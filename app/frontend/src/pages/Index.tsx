import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  ChevronRight,
  Clock3,
  Code2,
  FolderKanban,
  LogIn,
  Menu,
  Paperclip,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  client,
  createProject,
  getCurrentUser,
  getErrorMessage,
  listProjects,
  Project,
} from '@/lib/sparkforge';

const statusText: Record<string, string> = {
  intake: '等待开始',
  planning: '正在规划',
  awaiting_approval: '等待确认',
  building: '正在构建',
  ready: '已验收',
  awaiting_verification: '待验收',
  failed: '需要处理',
};

const suggestions = [
  '为研究生做一个每周习惯追踪器。可以添加习惯、选择类别、记录当天是否完成、写备注，并展示本周完成率。数据刷新后不能丢失。',
  '做一个自由职业者客户线索管理工具。每条线索包含客户名、联系方式、预算、阶段、下次跟进日期和备注。支持按阶段筛选并修改跟进状态。',
  '做一个小型线下活动报名管理器。可以新增报名人、记录人数、联系方式和付款状态，支持搜索、取消报名，并统计已报名总人数。',
];

function deriveName(prompt: string) {
  const compact = prompt
    .replace(/[，。！？,.!?]/g, ' ')
    .trim()
    .split(/\s+/)
    .join(' ');
  return compact.slice(0, 24) || '未命名应用';
}

export default function Index() {
  const navigate = useNavigate();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [auth, setAuth] = useState<'loading' | 'authenticated' | 'anonymous'>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectsError, setProjectsError] = useState('');

  const loadProjects = async () => {
    setProjectsError('');
    try { setProjects(await listProjects()); }
    catch (error) { setProjectsError(getErrorMessage(error)); }
  };

  useEffect(() => {
    getCurrentUser()
      .then(() => {
        setAuth('authenticated');
        void loadProjects();
      })
      .catch(() => setAuth('anonymous'));
  }, []);

  const startConversation = async (event?: FormEvent) => {
    event?.preventDefault();
    if (prompt.trim().length < 12) {
      toast.error('再多描述一点你想构建的产品或功能。');
      composerRef.current?.focus();
      return;
    }
    if (auth !== 'authenticated') {
      client.auth.toLogin();
      return;
    }

    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const project = await createProject(deriveName(prompt), prompt.trim());
      navigate(`/workspace/${project.id}?start=1`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
      event.preventDefault();
      void startConversation();
    }
  };

  const handleLogout = () => {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      localStorage.removeItem('token');
      localStorage.setItem('isLougOutManual', 'true');
      setAuth('anonymous');
      setProjects([]);
      setHistoryOpen(false);
      toast.success('已退出登录。');
    } catch (error) {
      toast.error(`退出未完成：${getErrorMessage(error)}`);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-background/95">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md text-sm font-semibold"
            onClick={() => navigate('/')}
          >
            <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background">
              <Sparkles className="h-4 w-4" />
            </span>
            SparkForge
          </button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-muted-foreground sm:inline-flex"
              onClick={() => setHistoryOpen(true)}
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              项目
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="设置"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-4 w-4" />
            </Button>
            {auth === 'authenticated' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loggingOut}
                onClick={handleLogout}
              >
                {loggingOut ? '正在退出…' : '退出'}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => client.auth.toLogin()}>
                <LogIn className="mr-2 h-4 w-4" />
                登录
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label="打开项目"
              onClick={() => setHistoryOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-4 pb-20 pt-28 sm:px-6">
        <div className="sf-enter mb-9 max-w-2xl">
          <h1 className="text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[3rem]">
            <span className="block">从一句想法，</span>
            <span className="block text-primary">到可以迭代的产品</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            描述产品、功能或需要修复的问题。SparkForge 会规划结构、生成应用，并持续保存每一次改进。
          </p>
        </div>

        <form
          onSubmit={startConversation}
          className="sf-enter-delayed sf-panel group rounded-2xl border border-border/80 bg-card p-3 transition-[border-color,box-shadow,transform] duration-300 focus-within:-translate-y-0.5 focus-within:border-primary/35 focus-within:shadow-[0_18px_48px_rgba(28,25,23,0.09)]"
        >
          <label htmlFor="prompt" className="sr-only">
            描述你想构建的内容
          </label>
          <textarea
            ref={composerRef}
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={5}
            autoFocus
            className="w-full resize-none bg-transparent px-2 py-1 text-base leading-7 outline-none placeholder:text-muted-foreground/70"
            placeholder="例如：做一个可以收集、分类和追踪客户反馈的内部工具…"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <div className="flex items-center gap-1">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Enter 发送 · Shift + Enter 换行
              </span>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={creating || prompt.trim().length < 12 || auth === 'loading'}
              aria-label="开始构建"
              className="rounded-lg"
            >
              {creating ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-muted-foreground">选择一个示例，补充你的需求</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setPrompt(suggestion);
                  composerRef.current?.focus();
                }}
                className="rounded-xl border border-border/80 bg-card/90 p-3 text-left transition-[color,background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-accent active:translate-y-0"
              >
                <span className="block text-sm font-medium">
                  {['习惯追踪器', '客户线索看板', '活动报名管理器'][index]}
                </span>
                <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {suggestion}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-border/70 pt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            先确认蓝图，再生成应用并保存版本
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
          >
            查看项目
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex animate-in justify-end bg-foreground/15 fade-in duration-200" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="关闭项目列表"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="relative h-full w-full max-w-sm animate-in border-l border-border bg-card p-5 shadow-sm slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">项目</h2>
                <p className="mt-1 text-sm text-muted-foreground">继续之前的对话与构建。</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭"
                onClick={() => setHistoryOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 space-y-1">
              {auth === 'loading' ? (
                <div className="h-20 animate-pulse rounded-lg bg-secondary" />
              ) : auth === 'anonymous' ? (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">登录后查看历史项目</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    对话、版本和分享链接会保存到你的工作区。
                  </p>
                  <Button className="mt-4 w-full" onClick={() => client.auth.toLogin()}>
                    登录 SparkForge
                  </Button>
                </div>
              ) : projectsError ? (
                <div role="alert" className="rounded-lg border p-4">
                  <p className="text-sm">项目列表加载失败：{projectsError}</p>
                  <Button className="mt-3" variant="outline" onClick={() => void loadProjects()}>重新加载项目</Button>
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Code2 className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">还没有项目</p>
                  <p className="mt-1 text-sm text-muted-foreground">关闭面板并发送第一条需求。</p>
                </div>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate(`/workspace/${project.id}`)}
                    className="group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-secondary"
                  >
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{project.name}</span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {project.initial_prompt}
                      </span>
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      {statusText[project.status] || project.status}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
