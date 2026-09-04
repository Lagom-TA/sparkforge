import { getPrincipal } from "@/lib/auth";
import { listProjects, type ProjectRow } from "@/lib/projects";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getOrCreateGuestSession } from "@/lib/guest";
import AppSidebar from "@/components/shell/AppSidebar";
import HomeClient from "@/components/home/HomeClient";

export default async function HomePage() {
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

  return (
    <div className="flex min-h-screen">
      <AppSidebar projects={projects} activeProjectId={null} principal={principal} />
      <HomeClient dbConfigured={dbConfigured} />
    </div>
  );
}