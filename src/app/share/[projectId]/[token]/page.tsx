import { notFound } from "next/navigation";
import { getSharedProject } from "@/lib/share";
import AppRuntime from "@/components/preview/AppRuntime";

/**
 * 公开分享页：无需登录，凭 token 访问项目的激活版本。
 * permission=interact 时可增删改数据；view 时只读（后端强制）。
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string; projectId: string }>;
}) {
  const { token, projectId } = await params;
  const shared = await getSharedProject(projectId, token).catch(() => null);
  if (!shared) notFound();

  const readOnly = shared.permission === "view";

  return (
    <main className="mx-auto max-w-4xl">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-3">
        <p className="text-sm font-bold tracking-wide">SparkForge</p>
        <p className="text-xs text-neutral-500">{readOnly ? "只读分享" : "可交互分享"}</p>
      </header>
      <div className="bg-neutral-100">
        <AppRuntime
          projectId={shared.project.id}
          appSpec={shared.appSpec}
          shareToken={token}
        />
      </div>
    </main>
  );
}