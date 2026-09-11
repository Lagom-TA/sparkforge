import { client, Generation, ProductSpec, Version, getErrorMessage } from '@/lib/sparkforge';
import { checkStartup } from './startup-check';
import { validatePlan, validateBuild } from '@/lib/spec-validation';

export type TaskControl = 'running' | 'paused' | 'stopped';
export interface TaskEvent { generation: Generation; stage: string; progress: number; message: string; canRetry?: boolean; diagnostic?: {code: string; message: string} }
export interface GenerationControls {
  getControl?: () => TaskControl;
  isCurrent?: () => boolean;
  onAdmission?: (pending: Promise<Generation>) => void;
  expectedGenerationId?: number | null;
  expectedActiveVersionId?: number | null;
  onEvent?: (event: TaskEvent) => void;
}
export interface Job { generation: Generation; status: string; stage: string; kind: 'plan' | 'build'; version?: Version; can_retry?: boolean; diagnostic?: {code: string; message: string}; candidate?: {token: string; html: string} }
export class GenerationInterruptedError extends Error {
  constructor(public readonly reason: 'paused' | 'stopped') {
    super(reason === 'paused' ? '生成已暂停。' : '生成已停止。');
  }
}

async function call<T>(path: string, method = 'GET', data?: Record<string, unknown>): Promise<T> {
  const response = await client.apiCall.invoke({ url: `/api/v1/generation-jobs${path}`, method, data, options: { timeout: 95_000 } });
  return (response as { data: T }).data;
}

function assertRunning(controls: GenerationControls) {
  if (controls.isCurrent?.() === false) throw new GenerationInterruptedError('stopped');
  const state = controls.getControl?.() ?? 'running';
  if (state !== 'running') throw new GenerationInterruptedError(state);
}
function emit(job: Job, controls: GenerationControls) {
  controls.onEvent?.({ generation: job.generation, stage: job.generation.current_stage,
    progress: job.status === 'succeeded' || job.status === 'awaiting_approval' ? 100 : job.stage === 'validation' ? 90 : job.stage === 'source' ? 72 : 30,
    canRetry: job.can_retry, diagnostic: job.diagnostic, message: job.generation.public_log.at(-1)?.message ?? '任务已保存。' });
}
async function execute(job: Job, controls: GenerationControls): Promise<Job> {
  let lostResponses = 0;
  for (;;) {
    assertRunning(controls);
    emit(job, controls);
    if (['succeeded', 'awaiting_approval'].includes(job.status)) {
      if (job.version) {
        const validated = validateBuild({appSpec: job.version.app_spec, files: job.version.source_bundle.files});
        job.version = {...job.version, app_spec: validated.appSpec, source_bundle: validated.sourceBundle};
      }
      return job;
    }
    if (job.status === 'paused' || job.status === 'stopped') throw new GenerationInterruptedError(job.status);
    if (job.status === 'failed') {
      if (!job.can_retry) throw new Error(job.generation.error_message || '任务无法继续，请修改蓝图或检查模型配置。');
      await new Promise(resolve => setTimeout(resolve, 1000));
      assertRunning(controls);
      job = await call<Job>(`/${job.generation.id}/control`, 'POST', {action: 'resume'});
      continue;
    }
    if (job.candidate) {
      const result = await checkStartup(job.candidate.html, () => controls.isCurrent?.() !== false && (controls.getControl?.() ?? 'running') === 'running');
      assertRunning(controls);
      job = await call<Job>(`/${job.generation.id}/validation`, 'POST', {token: job.candidate.token, ...result});
      continue;
    }
    try {
      job = await call<Job>(`/${job.generation.id}/step`, 'POST');
      lostResponses = 0;
    } catch (error) {
      // Reconcile a lost response before retrying any mutation. Lease fencing remains server-owned.
      let recovered: Job | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        assertRunning(controls);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        try { recovered = await getGenerationJob(job.generation.id); break; } catch { /* bounded reconnect */ }
      }
      if (!recovered) throw new Error(`连接暂时不可用，进度已保存。联网后会尝试续接，也可手动恢复：${getErrorMessage(error)}`);
      job = recovered;
      if (++lostResponses >= 3 && !['succeeded', 'awaiting_approval'].includes(job.status)) throw new Error('连接未能稳定恢复，任务已保存。请稍后恢复或检查网络。');
    }
    assertRunning(controls);
    if (job.status === 'running') await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
async function start(projectId: number, kind: 'plan' | 'build', request: string, spec: ProductSpec | undefined, controls: GenerationControls) {
  assertRunning(controls);
  const storageKey = `sparkforge-request:${projectId}:${kind}`;
  const fingerprint = JSON.stringify([request, spec, controls.expectedGenerationId, controls.expectedActiveVersionId]);
  let key = crypto.randomUUID();
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (previous?.fingerprint === fingerprint && typeof previous.key === 'string') key = previous.key;
    sessionStorage.setItem(storageKey, JSON.stringify({ key, fingerprint }));
  } catch { /* storage may be unavailable; server still enforces project exclusion */ }
  const admission = call<Job>('', 'POST', { project_id: projectId, kind, request_text: request, request_key: key, product_spec: spec,
    expected_generation_id: controls.expectedGenerationId ?? null, expected_active_version_id: controls.expectedActiveVersionId ?? null });
  if (controls.onAdmission) controls.onAdmission(admission.then(job => job.generation));
  const job = await admission;
  try { sessionStorage.removeItem(storageKey); } catch { /* optional cache */ }
  emit(job, controls);
  const control = controls.getControl?.() ?? 'running';
  if (control !== 'running' && controls.isCurrent?.() !== false && !controls.onAdmission) await call(`/${job.generation.id}/control`, 'POST', { action: control });
  assertRunning(controls);
  return execute(job, controls);
}
export async function planProject(projectId: number, request: string, controls: GenerationControls = {}) {
  const result = await start(projectId, 'plan', request, undefined, controls);
  return validatePlan(result.generation.product_spec);
}
export async function buildProject(projectId: number, spec: ProductSpec, summary: string, controls: GenerationControls = {}) {
  const result = await start(projectId, 'build', summary, validatePlan(spec), controls);
  if (!result.version) throw new Error('任务尚未生成版本。');
  return result.version;
}
export async function resumeGeneration(generation: Generation, controls: GenerationControls = {}) {
  if (generation.status === 'stopped') throw new GenerationInterruptedError('stopped');
  const job = await call<Job>(`/${generation.id}/control`, 'POST', { action: 'resume' });
  return execute(job, controls);
}
export async function markGenerationInterrupted(generation: Generation, control: 'paused' | 'stopped') {
  const job = await call<Job>(`/${generation.id}/control`, 'POST', { action: control });
  return job.generation;
}

export function getGenerationJob(id: number) { return call<Job>(`/${id}`); }
export async function continueGeneration(id: number, controls: GenerationControls = {}) {
  return execute(await getGenerationJob(id), controls);
}
export async function savePlanDraft(projectId: number, spec: ProductSpec, generationId: number | null, activeVersionId: number | null, requestKey: string) {
  return call<Job>('/draft', 'POST', {project_id: projectId, product_spec: validatePlan(spec), request_key: requestKey,
    expected_generation_id: generationId, expected_active_version_id: activeVersionId});
}
