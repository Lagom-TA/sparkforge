import { NextRequest, NextResponse } from "next/server";
import { runVerification } from "@/lib/agents/verifier";
import { getProject } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

/** 运行 Verifier：对激活版本执行确定性验收，结果落库并返回。 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!project.active_version_id) {
    return NextResponse.json({ error: "NO_ACTIVE_VERSION" }, { status: 409 });
  }

  try {
    const run = await runVerification(id);
    return NextResponse.json(run);
  } catch {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
