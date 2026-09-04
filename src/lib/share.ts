import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getProject, type ProjectRow } from "@/lib/projects";
import type { AppSpec } from "@/lib/specs/app-spec";

/**
 * 分享链接：只存 token 的 SHA-256 哈希，原始 token 只在签发时返回一次。
 * 公开访问按 token 校验归属，不经过 Guest Session。
 */

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createShareLink(
  projectId: string,
  permission: "view" | "interact" = "interact"
): Promise<string> {
  const project = await getProject(projectId); // 校验归属
  if (!project) throw new Error("NOT_FOUND");
  if (!project.active_version_id) throw new Error("NO_ACTIVE_VERSION");

  const token = randomBytes(32).toString("hex");
  const { error } = await getSupabaseAdmin().from("share_links").insert({
    project_id: projectId,
    token_hash: hashToken(token),
    permission,
  });
  if (error) throw error;
  return token;
}

export interface SharedProjectContext {
  project: ProjectRow;
  appSpec: AppSpec;
  permission: "view" | "interact";
}

/** 通过 token 获取项目与激活 AppSpec（token 无效、过期或项目无版本时返回 null） */
export async function getSharedProject(
  projectId: string,
  token: string
): Promise<SharedProjectContext | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { data: link, error } = await getSupabaseAdmin()
    .from("share_links")
    .select("id, permission, expires_at")
    .eq("project_id", projectId)
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error || !link) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;

  const { data: project } = await getSupabaseAdmin()
    .from("projects")
    .select("id, name, initial_prompt, status, active_version_id, created_at, updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.active_version_id) return null;

  const { data: version } = await getSupabaseAdmin()
    .from("versions")
    .select("app_spec")
    .eq("id", project.active_version_id)
    .maybeSingle();
  if (!version) return null;

  return {
    project: project as ProjectRow,
    appSpec: version.app_spec as AppSpec,
    permission: link.permission,
  };
}
