import { NextResponse } from "next/server";

/**
 * 生成编排已拆分为两个阶段端点：
 * - POST /api/projects/[id]/plan   → Planner 产出蓝图（awaiting_approval）
 * - POST /api/projects/[id]/build  → 批准后编译 AppSpec 并落版本（ready）
 * 保留本端点以维护协议占位，后续 Phase 4 引入 SSE 事件流时在此收敛。
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "USE_STAGE_ENDPOINTS",
      message: "请使用 /api/projects/[id]/plan 与 /api/projects/[id]/build。",
    },
    { status: 501 }
  );
}
