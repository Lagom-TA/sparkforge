import { NextRequest, NextResponse } from "next/server";
import { createShareLink } from "@/lib/share";
import { getProject } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

/** 签发分享链接。token 只在响应中出现一次，数据库只存哈希。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!project.active_version_id) {
    return NextResponse.json({ error: "NO_ACTIVE_VERSION" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const permission = body?.permission === "view" ? "view" : "interact";

  try {
    const token = await createShareLink(id, permission);
    return NextResponse.json({ token, permission }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "INTERNAL";
    if (msg === "NO_ACTIVE_VERSION") {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}