import { notFound } from "next/navigation";
import { getProject, getActiveAppSpec, listProjects } from "@/lib/projects";
import { getLatestGeneration, listVersions } from "@/lib/agents/orchestrator";
import { getPrincipal } from "@/lib/auth";
import { getOrCreateGuestSession } from "@/lib/guest";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { isLlmConfigured } from "@/lib/llm/provider";
import PreviewPanel from "@/components/preview/PreviewPanel";
import AgentWorkspace from "@/components/workspace/AgentWorkspace";
import AppSidebar from "@/components/shell/AppSidebar";

/**
 * 三栏工作台：Projects | Agent Workspace | Live App。
 * 状态来自数据库，刷新页面可恢复当前阶段。
 */
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            !
          </span>
          <h1 className="text-lg font-semibold">数据库未配置</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            请按 README 配置 Supabase 环境变量后重启服务。
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg border border-line px-4 py-2 text-xs text-muted hover:text-foreground"
          >
            返回首页
          </a>
        </div>
      </main>
    );
  }

  await getOrCreateGuestSession();
  const project = await getProject(projectId);
  if (!project) notFound();

  const [appSpec, generation, projects, versions, principal] = await Promise.all([
    getActiveAppSpec(projectId),
    getLatestGeneration(projectId),
    listProjects(),
    listVersions(projectId),
    getPrincipal(),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar projects={projects} activeProjectId={projectId} principal={principal} />

      <div className="flex min-w-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 中栏：智能体工作区 */}
        <section className="min-h-[60vh] border-b border-line bg-background lg:min-h-0 lg:border-b-0 lg:border-r">
          <AgentWorkspace
            projectId={projectId}
            initialGeneration={generation}
            initialVersions={versions}
            activeVersionId={project.active_version_id}
            llmConfigured={isLlmConfigured()}
          />
        </section>

        {/* 右栏：Preview / Tests / Code */}
        <section className="min-h-[60vh] bg-surface/30">
          {appSpec ? (
            <PreviewPanel projectId={projectId} appSpec={appSpec} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
              <span className="animate-breathe inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-accent">
                ▷
              </span>
              <p className="text-sm text-muted">尚无可运行版本</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
