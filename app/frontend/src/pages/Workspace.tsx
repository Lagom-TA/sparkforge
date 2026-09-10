import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  Loader2,
  Monitor,
  PanelRight,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Square,
  TimerReset,
} from 'lucide-react';
import { toast } from 'sonner';
import AppPreview from '@/components/AppPreview';
import VersionAcceptance from '@/components/VersionAcceptance';
import { downloadSource } from '@/lib/source-download';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Generation,
  ProductSpec,
  Project,
  ShareLink,
  Version,
  createShareLink,
  getErrorMessage,
  getProject,
  listGenerations,
  listProjects,
  listShareLinks,
  listVersions,
  revokeShareLink,
} from '@/lib/sparkforge';
import {
  buildProject,
  GenerationInterruptedError,
  markGenerationInterrupted,
  resumeGeneration,
  planProject,
  saveEditedPlan,
  TaskControl,
  TaskEvent,
} from '@/lib/generation';
import {
  applyPreferences,
  getPreferences,
  subscribePreferences,
} from '@/lib/preferences';

const stages = [
  { key: 'understanding', label: '理解需求' },
  { key: 'planning', label: '制定规划' },
  { key: 'building', label: '生成源码' },
  { key: 'validating', label: '结构校验' },
  { key: 'saving', label: '保存版本' },
];

const stageProgress: Record<string, number> = {
  understanding: 12,
  planning: 35,
  plan_validation: 82,
  awaiting_approval: 100,
  preparing: 8,
  building: 28,
  validating: 76,
  saving: 92,
  completed: 100,
};

export default function Workspace() {
  const { projectId } = useParams();
  return <WorkspaceSession key={projectId} />;
}

function WorkspaceSession() {
  const id = Number(useParams().projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState<Project>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version>();
  const [plan, setPlan] = useState<ProductSpec>();
  const [planDraft, setPlanDraft] = useState<ProductSpec>();
  const [editingPlan, setEditingPlan] = useState(false);
  const [preferences, setPreferences] = useState(getPreferences);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    () => getPreferences().defaultPreview,
  );
  const [previewKey, setPreviewKey] = useState(0);
  const [share, setShare] = useState<ShareLink>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [artifactOpen, setArtifactOpen] = useState(true);
  const [activeTask, setActiveTask] = useState<Generation>();
  const [taskStage, setTaskStage] = useState('');
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskMessage, setTaskMessage] = useState('');
  const [taskStartedAt, setTaskStartedAt] = useState<number>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controlRef = useRef<TaskControl>('running');
  const runTokenRef = useRef(0);
  const runningRef = useRef(false);
  const loadRef = useRef(0);
  const shareBusyRef = useRef(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => () => {
    controlRef.current = 'stopped';
    runTokenRef.current += 1;
    loadRef.current += 1;
  }, []);

  const applyTaskEvent = useCallback((event: TaskEvent) => {
    setActiveTask(event.generation);
    setTaskStage(event.stage);
    setTaskProgress(event.progress);
    setTaskMessage(event.message);
  }, []);

  const load = useCallback(async () => {
    const request = ++loadRef.current;
    try {
      const [nextProject, nextProjects, nextVersions, generations, shares] = await Promise.all([
        getProject(id),
        listProjects(),
        listVersions(id),
        listGenerations(id),
        listShareLinks(id),
      ]);
      if (request !== loadRef.current) return undefined;
      setProject(nextProject);
      setProjects(nextProjects);
      setVersions(nextVersions);
      setSelectedVersion((current) =>
        current ? nextVersions.find((item) => item.id === current.id) ?? nextVersions[0] : nextVersions.find((item) => item.id === nextProject.active_version_id) ?? nextVersions[0],
      );
      const nextPlan =
        generations.find((item) => item.status === 'awaiting_approval' && item.product_spec)?.product_spec ??
        generations.find((item) => item.product_spec)?.product_spec ??
        nextVersions.find((item) => item.id === nextProject.active_version_id)?.product_spec ??
        nextVersions[0]?.product_spec;
      setPlan(nextPlan);
      setPlanDraft(nextPlan);
      setShare(shares.find((item) => item.is_active));

      const latest = generations[0];
      setActiveTask(latest);
      if (latest && ['running', 'paused', 'stopped', 'failed'].includes(latest.status)) {
        setActiveTask(latest);
        setTaskStage(latest.current_stage);
        setTaskProgress(stageProgress[latest.current_stage] ?? 0);
        setTaskMessage(latest.public_log.at(-1)?.message ?? '');
        if (latest.status === 'running' && !runningRef.current) {
          setBusy('');
          setTaskMessage('任务已保存。点击恢复可查询进度并继续未完成的步骤。');
        }
      }
      return { nextProject, nextVersions, generations };
    } catch (loadError) {
      if (request === loadRef.current) setError(getErrorMessage(loadError));
      return undefined;
    }
  }, [id]);

  useEffect(() => {
    applyPreferences(preferences);
    setPreviewMode(preferences.defaultPreview);
  }, [preferences]);

  useEffect(() => subscribePreferences((nextPreferences) => {
    setPreferences(nextPreferences);
    applyPreferences(nextPreferences);
  }), []);

  useEffect(() => {
    if (!busy || !taskStartedAt) return;
    const update = () => setElapsedSeconds(Math.floor((Date.now() - taskStartedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [busy, taskStartedAt]);

  const beginRun = (kind: 'planning' | 'building') => {
    runningRef.current = true;
    controlRef.current = 'running';
    runTokenRef.current += 1;
    setBusy(kind);
    setError('');
    setTaskStartedAt(Date.now());
    setElapsedSeconds(0);
    return runTokenRef.current;
  };

  const runPlan = useCallback(
    async (request: string) => {
      if (runningRef.current) return;
      const token = beginRun('planning');
      try {
        const result = await planProject(id, request, {
          getControl: () => (token === runTokenRef.current ? controlRef.current : 'stopped'),
          isCurrent: () => token === runTokenRef.current,
          onEvent: (event) => { if (token === runTokenRef.current) applyTaskEvent(event); },
        });
        if (token !== runTokenRef.current || controlRef.current !== 'running') return;
        setPlan(result);
        if (preferences.completionNotifications) {
          toast.success('规划已完成，确认后即可开始构建。');
        }
        await load();
      } catch (planError) {
        if (token === runTokenRef.current && !(planError instanceof GenerationInterruptedError)) {
          setError(getErrorMessage(planError));
          await load();
        }
      } finally {
        if (token === runTokenRef.current) { runningRef.current = false; setBusy(''); }
      }
    },
    [applyTaskEvent, id, load],
  );

  useEffect(() => {
    void load().then((result) => {
      if (
        searchParams.get('start') === '1' &&
        result?.nextProject &&
        !result.nextVersions.length &&
        !result.generations.length
      ) {
        setSearchParams({}, { replace: true });
        void runPlan(result.nextProject.initial_prompt);
      }
    });
  }, [load, runPlan, searchParams, setSearchParams]);

  const runBuild = async () => {
    if (!plan || runningRef.current) return;
    const token = beginRun('building');
    try {
      const version = await buildProject(
        id,
        plan,
        versions.length ? '根据对话继续优化' : '初始版本',
        {
          getControl: () => (token === runTokenRef.current ? controlRef.current : 'stopped'),
          isCurrent: () => token === runTokenRef.current,
          onEvent: (event) => { if (token === runTokenRef.current) applyTaskEvent(event); },
        },
      );
      if (token !== runTokenRef.current || controlRef.current !== 'running') return;
      setSelectedVersion(version);
      setArtifactOpen(preferences.autoOpenArtifact);
      if (preferences.completionNotifications) {
        toast.success(
          preferences.autoOpenArtifact
            ? `V${version.version_number} 已生成，已打开预览。`
            : `V${version.version_number} 已生成。`,
        );
      }
      await load();
    } catch (buildError) {
      if (token === runTokenRef.current && !(buildError instanceof GenerationInterruptedError)) {
        setError(getErrorMessage(buildError));
        await load();
      }
    } finally {
      if (token === runTokenRef.current) { runningRef.current = false; setBusy(''); }
    }
  };

  const interrupt = async (control: Exclude<TaskControl, 'running'>) => {
    if (taskStage === 'saving') return;
    controlRef.current = control;
    runTokenRef.current += 1;
    runningRef.current = true;
    setBusy('interrupting');
    try {
      if (activeTask) {
        const result = await markGenerationInterrupted(activeTask, control);
        setActiveTask(result);
        if (result.status !== control) {
          setTaskMessage('任务已完成，保留已保存的结果。');
          await load();
          return;
        }
      }

      setTaskMessage(control === 'paused' ? '已暂停，可补充要求后重新规划。' : '任务已停止。');
      toast.success(control === 'paused' ? '任务已暂停。' : '任务已停止。');
    } catch (interruptError) {
      setError(`本地任务已停止，但保存状态失败：${getErrorMessage(interruptError)}`);
    } finally {
      runningRef.current = false;
      setBusy('');
    }
  };

  const resumeTask = async () => {
    if (!activeTask || runningRef.current) return;
    if (message.trim()) {
      const extra = message.trim();
      setMessage('');
      await runPlan(`${project?.initial_prompt ?? ''}\n用户追加要求：${extra}`);
      return;
    }
    const token = beginRun(activeTask.product_spec ? 'building' : 'planning');
    try {
      const result = await resumeGeneration(activeTask, {
        getControl: () => controlRef.current,
        isCurrent: () => token === runTokenRef.current,
        onEvent: (event) => { if (token === runTokenRef.current) applyTaskEvent(event); },
      });
      if (token !== runTokenRef.current) return;
      if (result.version) setSelectedVersion(result.version);
      if (result.generation.product_spec) setPlan(result.generation.product_spec);
      await load();
    } catch (error) {
      if (token === runTokenRef.current && !(error instanceof GenerationInterruptedError)) setError(getErrorMessage(error));
    } finally {
      if (token === runTokenRef.current) { runningRef.current = false; setBusy(''); }
    }
  };

  const retryTask = resumeTask;

  const sendMessage = async () => {
    const nextMessage = message.trim();
    if (nextMessage.length < 8) {
      toast.error('请更具体地描述希望调整的内容。');
      return;
    }
    setMessage('');
    await runPlan(`${project?.initial_prompt}\n当前蓝图：${JSON.stringify(plan)}\n用户追加要求：${nextMessage}`);
  };

  const approvePlan = async () => {
    if (!planDraft) return;
    try {
      if (activeTask) await saveEditedPlan(activeTask.id, planDraft);
      setPlan(planDraft);
      setEditingPlan(false);
      if (preferences.completionNotifications) {
        toast.success('蓝图修改已保存，可以开始构建。');
      }
    } catch (planError) {
      const message = getErrorMessage(planError);
      setError(message);
      if (preferences.errorNotifications) toast.error(message);
    }
  };

  const toggleShare = async () => {
    if (shareBusyRef.current || !project?.active_version_id) return;
    shareBusyRef.current = true;
    setSharing(true);
    try {
      if (share) {
        await revokeShareLink(share.id);
        setShare(undefined);
        toast.success('分享链接已撤销。');
      } else {
        const nextShare = await createShareLink(id);
        setShare(nextShare);
        try {
          await navigator.clipboard.writeText(`${location.origin}/share/${id}/${nextShare.token}`);
          toast.success('只读链接已创建并复制。');
        } catch {
          toast.info('分享已创建。复制失败，可通过右侧按钮打开链接。');
        }
      }
    } catch (shareError) {
      const message = getErrorMessage(shareError);
      setError(message);
      if (preferences.errorNotifications) toast.error(message);
    } finally {
      shareBusyRef.current = false;
      setSharing(false);
    }
  };

  const copyError = async () => {
    await navigator.clipboard.writeText(activeTask?.error_message || error);
    toast.success('错误详情已复制。');
  };

  if (!project) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        {error || '正在打开对话…'}
      </div>
    );
  }

  const taskStatus = activeTask?.status;
  const canRecover = ['paused', 'stopped', 'failed', 'running'].includes(taskStatus ?? '');

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border/70 bg-card/95 px-3 shadow-[0_1px_12px_rgba(28,25,23,0.025)] sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/" aria-label="返回首页"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{project.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {busy ? taskMessage || '任务处理中…' : editingPlan ? '蓝图有未保存的修改' : '项目已加载'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={sharing || !project.active_version_id} onClick={toggleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{share ? '撤销分享' : '分享'}</span>
          </Button>
          {share && (
            <Button variant="ghost" size="icon" asChild>
              <a href={`/share/${id}/${share.token}`} target="_blank" rel="noreferrer" aria-label="打开分享链接">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setArtifactOpen((open) => !open)}>
            <PanelRight className="mr-2 h-4 w-4" />产物
          </Button>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 ${artifactOpen ? 'xl:grid-cols-[220px_minmax(360px,38%)_1fr]' : 'xl:grid-cols-[220px_1fr]'}`}>
        <aside className="hidden border-r border-border/70 bg-sidebar px-3 py-4 xl:block">
          <div className="sticky top-[4.5rem]">
            <p className="px-2 text-xs font-medium text-muted-foreground">项目与版本</p>
            <div className="mt-3 space-y-1">
              {projects.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  to={`/workspace/${item.id}`}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent ${item.id === id ? 'bg-sidebar-accent font-medium' : 'text-muted-foreground'}`}
                >
                  <span className="block truncate">{item.name}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{item.status === 'ready' ? '可继续' : item.status}</span>
                </Link>
              ))}
            </div>
            {versions.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <p className="px-2 text-xs font-medium text-muted-foreground">当前项目版本</p>
                <div className="mt-2 space-y-1">
                  {versions.slice(0, 6).map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setSelectedVersion(version)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent ${selectedVersion?.id === version.id ? 'bg-sidebar-accent font-medium' : 'text-muted-foreground'}`}
                    >
                      V{version.version_number}
                      {selectedVersion?.id === version.id && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
        <section className="relative flex min-h-[calc(100vh-3.5rem)] flex-col border-r border-border/70">
          <div className="sf-grid-wash pointer-events-none absolute inset-x-0 top-0 h-64 opacity-35" />
          <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-7 lg:py-10">
            <div className="sf-enter flex-1 space-y-8">
              <article className="flex gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">你</span>
                <div>
                  <p className="text-sm font-medium">你的需求</p>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7">{project.initial_prompt}</p>
                </div>
              </article>

              <article className="flex gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-card">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">SparkForge</p>

                  {(busy || canRecover) && activeTask && (
                    <div className="sf-panel mt-4 animate-in rounded-xl border border-border/80 bg-card p-4 fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TimerReset className="h-4 w-4" />}
                            {busy ? taskMessage : taskStatus === 'failed' ? '任务执行失败' : '任务可以恢复'}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            任务 #{activeTask.id} · {busy ? `已用时 ${elapsedSeconds} 秒` : `停在 ${taskStage}`}
                          </p>
                        </div>
                        <Badge variant="secondary">{taskProgress}%</Badge>
                      </div>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className={`h-full rounded-full bg-primary transition-[width] duration-500 ${busy ? 'sf-progress-active' : ''}`} style={{ width: `${taskProgress}%` }} />
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {stages.map((stage) => {
                          const complete = taskProgress >= (stageProgress[stage.key] ?? 100);
                          return (
                            <div key={stage.key} className={`flex items-center gap-2 text-xs ${complete ? 'text-foreground' : 'text-muted-foreground'}`}>
                              <Check className="h-3.5 w-3.5" />{stage.label}
                            </div>
                          );
                        })}
                      </div>
                      <div className={`mt-4 border-t pt-4 ${preferences.compactTimeline ? 'space-y-1' : 'space-y-2'}`}>
                        {activeTask.public_log.slice(preferences.compactTimeline ? -8 : -5).map((entry, index) => (
                          <div key={`${entry.at}-${index}`} className="flex gap-3 text-xs">
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${entry.level === 'success' ? 'bg-emerald-600' : entry.level === 'error' ? 'bg-destructive' : 'bg-primary'}`} />
                            <div className="min-w-0">
                              <p><span className="font-semibold">{entry.actor ?? 'System'}</span> · {entry.message}</p>
                              {entry.artifact && <p className="mt-0.5 text-muted-foreground">产物：{entry.artifact}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {busy ? (
                          <>
                            <Button size="sm" variant="outline" disabled={taskStage === 'saving' || busy === 'interrupting'} onClick={() => void interrupt('paused')}>
                              <Pause className="mr-2 h-4 w-4" />暂停并补充
                            </Button>
                            <Button size="sm" variant="destructive" disabled={taskStage === 'saving' || busy === 'interrupting'} onClick={() => void interrupt('stopped')}>
                              <Square className="mr-2 h-4 w-4" />停止
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" onClick={() => void resumeTask()}>
                              <Play className="mr-2 h-4 w-4" />恢复
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void retryTask()}>
                              <RotateCcw className="mr-2 h-4 w-4" />重试
                            </Button>
                          </>
                        )}
                        {(activeTask.error_message || error) && (
                          <Button size="sm" variant="ghost" onClick={() => void copyError()}>
                            <Copy className="mr-2 h-4 w-4" />复制错误
                          </Button>
                        )}
                      </div>
                      {taskStatus === 'paused' && (
                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          可在下方补充要求后点击恢复。暂停不会冻结已经发出的远端模型请求，但旧结果不会写回。
                        </p>
                      )}
                    </div>
                  )}

                  {!busy && !plan && !canRecover && (
                    <div className="mt-2">
                      <p className="text-[15px] leading-7 text-muted-foreground">
                        我会先理解目标、梳理功能和数据结构，再与你确认构建方案。
                      </p>
                      <Button className="mt-4" onClick={() => void runPlan(project.initial_prompt)}>
                        <Sparkles className="mr-2 h-4 w-4" />开始规划
                      </Button>
                    </div>
                  )}

                  {!busy && plan && planDraft && (
                    <div className="mt-4 rounded-xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">可编辑应用蓝图</p>
                          <h2 className="mt-1 text-base font-semibold">{planDraft.title}</h2>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setEditingPlan((value) => !value)}>
                          {editingPlan ? '收起编辑' : '编辑蓝图'}
                        </Button>
                      </div>

                      {editingPlan ? (
                        <div className="mt-4 space-y-4">
                          <label className="block text-sm font-medium">
                            应用名称
                            <input className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" value={planDraft.title} onChange={(event) => setPlanDraft({ ...planDraft, title: event.target.value })} />
                          </label>
                          <label className="block text-sm font-medium">
                            目标与说明
                            <textarea className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" rows={2} value={planDraft.summary} onChange={(event) => setPlanDraft({ ...planDraft, summary: event.target.value })} />
                          </label>
                          <label className="block text-sm font-medium">
                            目标用户
                            <input className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" value={planDraft.audience} onChange={(event) => setPlanDraft({ ...planDraft, audience: event.target.value })} />
                          </label>
                          <label className="block text-sm font-medium">
                            功能（每行一项）
                            <textarea className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" rows={4} value={planDraft.features.map((item) => `${item.name}｜${item.description}`).join('\n')} onChange={(event) => setPlanDraft({ ...planDraft, features: event.target.value.split('\n').filter(Boolean).map((line) => { const [name, description = ''] = line.split('｜'); return { name, description, priority: 'P0' }; }) })} />
                          </label>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block text-sm font-medium">
                              数据实体与字段
                              <textarea className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" rows={4} value={planDraft.entities.map((item) => `${item.name}：${item.fields.join('、')}`).join('\n')} onChange={(event) => setPlanDraft({ ...planDraft, entities: event.target.value.split('\n').filter(Boolean).map((line) => { const [name, fields = ''] = line.split(/[：:]/); return { name, fields: fields.split(/[、,，]/).filter(Boolean) }; }) })} />
                            </label>
                            <label className="block text-sm font-medium">
                              页面视图
                              <textarea className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" rows={4} value={planDraft.pages.map((item) => `${item.name}｜${item.purpose}`).join('\n')} onChange={(event) => setPlanDraft({ ...planDraft, pages: event.target.value.split('\n').filter(Boolean).map((line) => { const [name, purpose = ''] = line.split('｜'); return { name, purpose }; }) })} />
                            </label>
                          </div>
                          <label className="block text-sm font-medium">
                            验收标准（每行一项）
                            <textarea className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" rows={4} value={planDraft.acceptance.join('\n')} onChange={(event) => setPlanDraft({ ...planDraft, acceptance: event.target.value.split('\n').filter(Boolean) })} />
                          </label>
                          <label className="block text-sm font-medium">
                            暂不实现项（每行一项）
                            <textarea className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" rows={3} value={(planDraft.outOfScope ?? []).join('\n')} onChange={(event) => setPlanDraft({ ...planDraft, outOfScope: event.target.value.split('\n').filter(Boolean) })} />
                          </label>
                          <Button onClick={() => void approvePlan()}>保存并批准蓝图</Button>
                        </div>
                      ) : (
                        <>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">{planDraft.summary}</p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg bg-secondary/70 p-3">
                              <p className="text-xs text-muted-foreground">目标用户</p>
                              <p className="mt-1 text-sm font-medium">{planDraft.audience}</p>
                            </div>
                            <div className="rounded-lg bg-secondary/70 p-3">
                              <p className="text-xs text-muted-foreground">范围</p>
                              <p className="mt-1 text-sm font-medium">{planDraft.features.length} 项功能 · {planDraft.acceptance.length} 条验收</p>
                            </div>
                          </div>
                          <div className="mt-4 divide-y overflow-hidden rounded-lg border">
                            {planDraft.features.slice(0, 4).map((feature) => (
                              <div key={feature.name} className="px-3 py-2.5">
                                <div className="flex justify-between gap-3">
                                  <p className="text-sm font-medium">{feature.name}</p>
                                  <Badge variant="secondary">{feature.priority}</Badge>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{feature.description}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button disabled={!!busy} onClick={() => void runBuild()}>
                              <Play className="mr-2 h-4 w-4" />
                              {versions.length ? '生成新版本' : '批准并构建'}
                            </Button>
                            <Button variant="outline" onClick={() => setEditingPlan(true)}>调整蓝图</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {selectedVersion && !busy && (
                    <div className="mt-5 rounded-lg bg-secondary px-3 py-3 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <Check className="h-4 w-4 text-emerald-700" />
                        V{selectedVersion.version_number} 已生成并打开预览
                      </div>
                      <p className="mt-1 pl-6 text-xs text-muted-foreground">{selectedVersion.change_summary}</p>
                    </div>
                  )}

                  {error && !activeTask?.error_message && (
                    <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                </div>
              </article>
            </div>

            <div className="sticky bottom-0 mt-8 bg-background pb-4 pt-4">
              <div className="sf-panel rounded-2xl border border-border/80 bg-card p-2 transition-[border-color,box-shadow,transform] duration-300 focus-within:-translate-y-0.5 focus-within:border-primary/30 focus-within:shadow-[0_16px_42px_rgba(28,25,23,0.09)]">
                <textarea
                  id="message-composer"
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey && !busy) {
                      event.preventDefault();
                      void (canRecover ? resumeTask() : sendMessage());
                    }
                  }}
                  className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  placeholder={canRecover ? '补充要求后恢复，或直接恢复当前任务…' : '告诉 SparkForge 要修改、添加或修复什么…'}
                />
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="px-2 text-xs text-muted-foreground">规划 gpt-6-astra · 构建 deepseek-v4-pro</span>
                  <Button
                    size="icon"
                    className="h-8 w-8"
                    disabled={!!busy || (!canRecover && message.trim().length < 8)}
                    onClick={() => void (canRecover ? resumeTask() : sendMessage())}
                    aria-label={canRecover ? '恢复任务' : '发送消息'}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {artifactOpen && (
          <aside className="min-w-0 animate-in bg-secondary/45 p-3 fade-in slide-in-from-right-3 duration-300 sm:p-4 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-auto">
            {selectedVersion ? (
              <Tabs defaultValue="preview">
                <div className="flex items-center justify-between gap-3">
                  <TabsList className="bg-card">
                    <TabsTrigger value="preview">预览</TabsTrigger>
                    <TabsTrigger value="source">代码</TabsTrigger>
                    <TabsTrigger value="versions">版本</TabsTrigger>
                  </TabsList>
                  <Badge variant="outline" className="bg-card">V{selectedVersion.version_number}</Badge>
                </div>
                <TabsContent value="preview" className="mt-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant={previewMode === 'desktop' ? 'secondary' : 'ghost'} onClick={() => setPreviewMode('desktop')}>
                        <Monitor className="mr-2 h-4 w-4" />桌面
                      </Button>
                      <Button size="sm" variant={previewMode === 'mobile' ? 'secondary' : 'ghost'} onClick={() => setPreviewMode('mobile')}>
                        <Smartphone className="mr-2 h-4 w-4" />移动
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPreviewKey((value) => value + 1)}>
                        <RefreshCw className="mr-2 h-4 w-4" />刷新
                      </Button>
                      {share && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={`/share/${id}/${share.token}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />独立查看
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className={`mx-auto transition-[max-width] duration-300 ${previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-none'}`}>
                    <VersionAcceptance key={selectedVersion.id} versionId={selectedVersion.id} criteria={selectedVersion.product_spec.acceptance} readOnly={selectedVersion.id !== project.active_version_id} onVerified={() => {void load();}} />
                    <AppPreview key={`${selectedVersion.id}-${previewKey}`} spec={selectedVersion.app_spec} sourceBundle={selectedVersion.source_bundle} versionId={selectedVersion.id} projectId={id} readOnly={selectedVersion.id !== project.active_version_id} compact={previewMode === 'mobile'} confirmDeletion={preferences.confirmRecordDeletion} errorNotifications={preferences.errorNotifications} />
                  </div>
                </TabsContent>
                <TabsContent value="source" className="mt-3">
                  <div className="overflow-hidden rounded-xl border bg-[#18181b] text-zinc-100">
                    <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
                      <span className="flex items-center gap-2 text-xs text-zinc-400"><FileCode2 className="h-4 w-4" />{selectedVersion.app_spec.runtime === 'html' ? 'index.html' : 'src/App.tsx'}</span>
                      <Button variant="ghost" size="sm" className="text-zinc-300" onClick={() => downloadSource(selectedVersion)}>下载源码</Button>
                      <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-white/10 hover:text-white" onClick={async () => {
                        try { await navigator.clipboard.writeText(selectedVersion.source_bundle.files[selectedVersion.app_spec.runtime === 'html' ? 'index.html' : 'src/App.tsx'] || '');
                        toast.success('源码已复制。'); } catch {toast.error('复制失败，请手动选择源码复制。');}
                      }}><Copy className="mr-2 h-4 w-4" />复制</Button>
                    </div>
                    <pre className="max-h-[calc(100vh-9rem)] overflow-auto p-5 text-xs leading-6">
                      <code>{selectedVersion.source_bundle.files[selectedVersion.app_spec.runtime === 'html' ? 'index.html' : 'src/App.tsx'] || JSON.stringify(selectedVersion.source_bundle.files, null, 2)}</code>
                    </pre>
                  </div>
                </TabsContent>
                <TabsContent value="versions" className="mt-3 space-y-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setSelectedVersion(version)}
                      className={`flex w-full items-center gap-3 rounded-lg border bg-card p-4 text-left hover:bg-secondary ${version.id === selectedVersion.id ? 'border-foreground/20' : ''}`}
                    >
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">版本 {version.version_number}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{version.change_summary}</span>
                      </span>
                      {version.id === selectedVersion.id && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="grid min-h-[calc(100vh-5.5rem)] place-items-center rounded-xl border border-dashed bg-card/60 p-8 text-center">
                <div>
                  <FileCode2 className="mx-auto h-7 w-7 text-muted-foreground" />
                  <h2 className="mt-4 text-sm font-semibold">产物将在这里出现</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                    确认方案并开始构建后，可在此查看应用预览、源码和历史版本。
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}