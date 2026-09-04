import { NextRequest, NextResponse } from "next/server";
import { startRefinement } from "@/lib/agents/orchestrator";
import { getProject } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

/** 聊天增量修改：基于当前激活版本生成新的待批准蓝图。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "MISSING_MESSAGE" }, { status: 400 });
  }
  if (!project.active_version_id) {
    return NextResponse.json({ error: "NO_ACTIVE_VERSION" }, { status: 409 });
  }

  try {
    const generation = await startRefinement(id, message);
    return NextResponse.json({ generation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "INTERNAL";
    if (msg === "LLM_NOT_CONFIGURED") {
      return NextResponse.json({ error: "LLM_NOT_CONFIGURED" }, { status: 503 });
    }
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
