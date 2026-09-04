import { NextRequest, NextResponse } from "next/server";
import { buildAndVerify } from "@/lib/agents/orchestrator";
import { getProject } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";
import { productSpecSchema } from "@/lib/specs/product-spec";

/**
 * 批准（可编辑后的）蓝图并构建新版本，随后自动验收；
 * 失败时由 Repairer 自动修复，最多两轮。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = productSpecSchema.safeParse(body?.productSpec);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "SCHEMA_INVALID", message: "蓝图数据不合法" },
      { status: 422 }
    );
  }
  const generationId = typeof body?.generationId === "string" ? body.generationId : null;

  try {
    const outcome = await buildAndVerify(id, parsed.data, generationId);
    return NextResponse.json(outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : "INTERNAL";
    if (message.startsWith("APPSPEC_INVALID")) {
      return NextResponse.json(
        { error: "APPSPEC_INVALID", message: message.slice("APPSPEC_INVALID: ".length) },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
