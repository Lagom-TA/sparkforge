import { NextRequest, NextResponse } from "next/server";
import { getProject, getActiveAppSpec } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

/** 返回项目详情 + 当前激活版本的 AppSpec（工作台与 Preview Runtime 使用） */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getOrCreateGuestSession();
  try {
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const appSpec = await getActiveAppSpec(id);
    return NextResponse.json({ project, appSpec });
  } catch {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
