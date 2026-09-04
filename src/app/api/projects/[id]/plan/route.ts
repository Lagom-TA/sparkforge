import { NextRequest, NextResponse } from "next/server";
import { startPlanning, getLatestGeneration } from "@/lib/agents/orchestrator";
import { getProject } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

/** 触发 Planner 并返回最新 generation（含待批准的 ProductSpec）。 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const generation = await startPlanning(id);
    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "INTERNAL";
    if (message === "LLM_NOT_CONFIGURED") {
      return NextResponse.json({ error: "LLM_NOT_CONFIGURED" }, { status: 503 });
    }
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}

/** 读取最新 generation（页面刷新后恢复蓝图状态）。 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const generation = await getLatestGeneration(id);
  return NextResponse.json({ generation });
}
