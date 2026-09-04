import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getPrincipal, type Principal } from "@/lib/auth";
import type { AppSpec } from "@/lib/specs/app-spec";

/**
 * 项目层服务端数据访问。
 * 归属校验：登录用户按 owner_id，未登录按 guest_session_id；
 * 服务端解析主体，客户端无法越权读取。
 */

export interface ProjectRow {
  id: string;
  name: string;
  initial_prompt: string;
  status: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export class NotAuthorizedError extends Error {}

async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal.userId && !principal.guestSessionId) {
    throw new NotAuthorizedError("NO_GUEST_SESSION");
  }
  return principal;
}

function ownershipFilter<T>(query: T, principal: Principal): T {
  // Supabase PostgREST 不支持 or 链式跨列的便捷写法，这里显式构造 or 条件
  const clauses: string[] = [];
  if (principal.userId) clauses.push(`owner_id.eq.${principal.userId}`);
  if (principal.guestSessionId) clauses.push(`guest_session_id.eq.${principal.guestSessionId}`);
  return (query as { or: (s: string) => T }).or(clauses.join(","));
}

export async function listProjects(): Promise<ProjectRow[]> {
  const principal = await requirePrincipal();
  let query = getSupabaseAdmin()
    .from("projects")
    .select("id, name, initial_prompt, status, active_version_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  query = ownershipFilter(query, principal);
  const { data, error } = await query;
  if (error) throw error;
  return data as ProjectRow[];
}

export async function createProject(input: {
  name: string;
  initialPrompt: string;
}): Promise<ProjectRow> {
  const principal = await requirePrincipal();
  const { data, error } = await getSupabaseAdmin()
    .from("projects")
    .insert({
      owner_id: principal.userId,
      guest_session_id: principal.guestSessionId,
      name: input.name.slice(0, 120),
      initial_prompt: input.initialPrompt.slice(0, 4000),
      status: "intake",
    })
    .select("id, name, initial_prompt, status, active_version_id, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as ProjectRow;
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const principal = await requirePrincipal();
  let query = getSupabaseAdmin()
    .from("projects")
    .select("id, name, initial_prompt, status, active_version_id, created_at, updated_at")
    .eq("id", id);
  query = ownershipFilter(query, principal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ProjectRow) ?? null;
}

export async function getActiveAppSpec(projectId: string): Promise<AppSpec | null> {
  const project = await getProject(projectId);
  if (!project?.active_version_id) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("versions")
    .select("app_spec")
    .eq("id", project.active_version_id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.app_spec as AppSpec) : null;
}
