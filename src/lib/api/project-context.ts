import { NextRequest, NextResponse } from "next/server";
import { getProject, getActiveAppSpec } from "@/lib/projects";
import { getSharedProject } from "@/lib/share";
import { getOrCreateGuestSession } from "@/lib/guest";
import type { AppSpec } from "@/lib/specs/app-spec";

/**
 * 生成项目的归属校验 + 当前 AppSpec。所有运行时数据 API 共用。
 * 两条合法通道：Guest 归属会话，或有效分享 token（x-share-token 头）。
 */
export async function requireProjectContext(
  req: NextRequest,
  projectId: string
): Promise<
  | { ok: true; appSpec: AppSpec; permission: "owner" | "view" | "interact" }
  | { ok: false; response: NextResponse }
> {
  const shareToken = req.headers.get("x-share-token");

  // 分享通道：token 有效即可访问（view 权限下禁止写）
  if (shareToken) {
    const shared = await getSharedProject(projectId, shareToken);
    if (!shared) {
      return {
        ok: false,
        response: NextResponse.json({ error: "INVALID_SHARE_TOKEN" }, { status: 403 }),
      };
    }
    return { ok: true, appSpec: shared.appSpec, permission: shared.permission };
  }

  // 归属通道
  await getOrCreateGuestSession();
  const project = await getProject(projectId);
  if (!project) {
    return { ok: false, response: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  }
  const appSpec = await getActiveAppSpec(projectId);
  if (!appSpec) {
    return {
      ok: false,
      response: NextResponse.json({ error: "NO_ACTIVE_VERSION" }, { status: 409 }),
    };
  }
  return { ok: true, appSpec, permission: "owner" };
}
