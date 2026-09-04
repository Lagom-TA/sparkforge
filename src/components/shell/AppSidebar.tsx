import Link from "next/link";
import type { Principal } from "@/lib/auth";
import type { ProjectRow } from "@/lib/projects";

/** 全局侧边栏：新项目、项目列表、设置与账号入口，跨页面共用。 */
export default function AppSidebar({
  projects,
  activeProjectId,
  principal,
}: {
  projects: ProjectRow[];
  activeProjectId: string | null;
  principal: Principal;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface/40 lg:flex">
      <div className="border-b border-line px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[13px] font-black text-white">
            S
          </span>
          <span className="text-sm font-semibold tracking-wide">SparkForge</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <Link
          href="/"
          className="mb-4 block rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium transition-colors hover:border-line-strong"
        >
          + 新项目
        </Link>

        {projects.length > 0 && (
          <>
            <h2 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
              项目
            </h2>
            <ul className="space-y-0.5">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/workspace/${p.id}`}
                    className={`block truncate rounded-lg px-3 py-2 text-[13px] transition-colors ${
                      p.id === activeProjectId
                        ? "bg-accent-soft font-medium text-foreground"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                        p.status === "ready"
                          ? "bg-green-500"
                          : p.status === "failed"
                            ? "bg-red-400/80"
                            : "bg-faint"
                      }`}
                    />
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-line p-3">
        <Link
          href="/settings"
          className="block rounded-lg px-3 py-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          设置
        </Link>
        <p className="truncate px-3 pb-1 pt-2 text-xs text-faint">
          {principal.email ? (
            principal.email
          ) : (
            <a href="/auth" className="underline underline-offset-2 hover:text-muted">
              登录
            </a>
          )}
        </p>
      </div>
    </aside>
  );
}