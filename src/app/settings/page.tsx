import { getPrincipal } from "@/lib/auth";
import { listProjects, type ProjectRow } from "@/lib/projects";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { isLlmConfigured } from "@/lib/llm/provider";
import { getOrCreateGuestSession } from "@/lib/guest";
import AppSidebar from "@/components/shell/AppSidebar";
import SignOutButton from "@/components/workspace/SignOutButton";

export default async function SettingsPage() {
  const dbConfigured = isSupabaseConfigured();
  if (dbConfigured) {
    await getOrCreateGuestSession().catch(() => {});
  }
  const principal = await getPrincipal();

  let projects: ProjectRow[] = [];
  if (dbConfigured) {
    try {
      projects = await listProjects();
    } catch {
      projects = [];
    }
  }

  const services = [
    { name: "数据库", ok: dbConfigured, env: "SUPABASE_*" },
    { name: "模型服务", ok: isLlmConfigured(), env: "LLM_*" },
  ];

  return (
    <div className="flex min-h-screen">
      <AppSidebar projects={projects} activeProjectId={null} principal={principal} />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-xl space-y-8">
          <h1 className="text-lg font-semibold">设置</h1>

          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
              账号
            </h2>
            <div className="rounded-xl border border-line bg-surface p-4 text-sm">
              {principal.email ? (
                <p>
                  {principal.email}
                  <span className="ml-3">
                    <SignOutButton />
                  </span>
                </p>
              ) : (
                <p className="text-muted">
                  当前以访客身份使用，数据保存在本设备。
                  <a
                    href="/auth"
                    className="ml-1 underline underline-offset-2 hover:text-foreground"
                  >
                    登录
                  </a>
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
              服务
            </h2>
            <div className="rounded-xl border border-line bg-surface">
              <ul className="divide-y divide-line">
                {services.map((s) => (
                  <li key={s.name} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">{s.name}</span>
                    <span
                      className={`flex items-center gap-1.5 text-xs ${
                        s.ok ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          s.ok ? "bg-green-500" : "bg-red-400"
                        }`}
                      />
                      {s.ok ? "已配置" : "未配置"} · <code className="font-mono text-[10px]">{s.env}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {!dbConfigured && (
              <p className="mt-2 text-xs text-faint">按 README 配置环境变量后重启服务生效。</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}