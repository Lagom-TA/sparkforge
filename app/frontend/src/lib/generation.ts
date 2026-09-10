import { client, Generation, ProductSpec, Version, getErrorMessage } from '@/lib/sparkforge';
import { validatePlan, validateBuild } from '@/lib/spec-validation';

export type TaskControl = 'running' | 'paused' | 'stopped';
export interface TaskEvent { generation: Generation; stage: string; progress: number; message: string }
export interface GenerationControls {
  getControl?: () => TaskControl;
  isCurrent?: () => boolean;
  onEvent?: (event: TaskEvent) => void;
}
interface Job { generation: Generation; status: string; stage: string; kind: 'plan' | 'build'; version?: Version }
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
    progress: job.status === 'succeeded' || job.status === 'awaiting_approval' ? 100 : job.stage === 'source' ? 72 : 30,
    message: job.generation.public_log.at(-1)?.message ?? '任务已保存。' });
}
async function execute(job: Job, controls: GenerationControls): Promise<Job> {
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
    if (job.status === 'failed') throw new Error(job.generation.error_message || '生成失败，可重试当前步骤。');
    try {
      job = await call<Job>(`/${job.generation.id}/step`, 'POST');
    } catch (error) {
      // Lost responses do not imply failed work; do not overwrite server state.
      throw new Error(`连接未完成，任务已保存。请恢复任务以查询结果：${getErrorMessage(error)}`);
    }
    assertRunning(controls);
    if (job.status === 'running') await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
async function start(projectId: number, kind: 'plan' | 'build', request: string, spec: ProductSpec | undefined, controls: GenerationControls) {
  assertRunning(controls);
  const storageKey = `sparkforge-request:${projectId}:${kind}`;
  const fingerprint = JSON.stringify([request, spec]);
  let key = crypto.randomUUID();
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (previous?.fingerprint === fingerprint && typeof previous.key === 'string') key = previous.key;
    sessionStorage.setItem(storageKey, JSON.stringify({ key, fingerprint }));
  } catch { /* storage may be unavailable; server still enforces project exclusion */ }
  const job = await call<Job>('', 'POST', { project_id: projectId, kind, request_text: request, request_key: key, product_spec: spec });
  try { sessionStorage.removeItem(storageKey); } catch { /* optional cache */ }
  emit(job, controls);
  const control = controls.getControl?.() ?? 'running';
  if (control !== 'running' && controls.isCurrent?.() !== false) await call(`/${job.generation.id}/control`, 'POST', { action: control });
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
  if (generation.status === 'stopped') {
    return start(generation.project_id, generation.product_spec ? 'build' : 'plan', generation.request_text, generation.product_spec, controls);
  }
  const job = await call<Job>(`/${generation.id}/control`, 'POST', { action: 'resume' });
  return execute(job, controls);
}
export async function markGenerationInterrupted(generation: Generation, control: 'paused' | 'stopped') {
  const job = await call<Job>(`/${generation.id}/control`, 'POST', { action: control });
  return job.generation;
}
export async function saveEditedPlan(generationId: number, spec: ProductSpec) {
  return call<ProductSpec>(`/${generationId}/plan`, 'PUT', { product_spec: validatePlan(spec) });
}
