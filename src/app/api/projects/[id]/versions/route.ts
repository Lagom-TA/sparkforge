import { NextRequest, NextResponse } from "next/server";
import { listVersions, activateVersion } from "@/lib/agents/orchestrator";
import { getProject } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

/** 版本列表与切换。 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const versions = await listVersions(id);
  return NextResponse.json({ versions, activeVersionId: project.active_version_id });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  if (!versionId) {
    return NextResponse.json({ error: "MISSING_VERSION_ID" }, { status: 400 });
  }
  try {
    await activateVersion(id, versionId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
