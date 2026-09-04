import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getProject, getActiveAppSpec } from "@/lib/projects";
import { getSharedProject } from "@/lib/share";
import { getOrCreateGuestSession } from "@/lib/guest";
import type { AppSpec } from "@/lib/specs/app-spec";

/**
 * 激活版本的生成源文件（Code 页签）。
 * 支持归属会话与分享 token 两条通道；旧版本无 source_bundle 时即时生成。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const shareToken = req.headers.get("x-share-token");

  let appSpec: AppSpec | null = null;
  if (shareToken) {
    const shared = await getSharedProject(id, shareToken);
    if (!shared) return NextResponse.json({ error: "INVALID_SHARE_TOKEN" }, { status: 403 });
    appSpec = shared.appSpec;
  } else {
    await getOrCreateGuestSession();
    appSpec = await getActiveAppSpec(id);
    if (!appSpec) {
      return NextResponse.json({ error: "NO_ACTIVE_VERSION" }, { status: 409 });
    }
  }

  // 以激活版本为准获取 source_bundle
  let activeVersionId: string | null = null;
  if (shareToken) {
    const shared = await getSharedProject(id, shareToken);
    activeVersionId = shared?.project.active_version_id ?? null;
  } else {
    const project = await getProject(id);
    activeVersionId = project?.active_version_id ?? null;
  }

  const { data: version } = activeVersionId
    ? await getSupabaseAdmin()
        .from("versions")
        .select("source_bundle")
        .eq("id", activeVersionId)
        .maybeSingle()
    : { data: null };

  let bundle = (version?.source_bundle as Record<string, string> | null) ?? null;
  if (!bundle && appSpec) {
    const { generateSourceBundle } = await import("@/lib/compiler/source-generator");
    bundle = generateSourceBundle(appSpec);
  }

  return NextResponse.json({ files: bundle ?? {} });
}