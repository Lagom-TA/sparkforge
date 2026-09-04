import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireProjectContext } from "@/lib/api/project-context";
import { sanitizeRecordData } from "../route";

/** 单条记录的编辑与软删除（软删除保证修改版本期间历史数据可回退）。 */

type RouteParams = { params: Promise<{ projectId: string; collection: string; recordId: string }> };

async function loadRecord(params: RouteParams["params"], projectId: string, collection: string) {
  const { recordId } = await params;
  const { data, error } = await getSupabaseAdmin()
    .from("app_records")
    .select("id, record_id, data")
    .eq("project_id", projectId)
    .eq("collection_key", collection)
    .eq("record_id", recordId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { projectId, collection } = await params;
  const ctx = await requireProjectContext(req, projectId);
  if (!ctx.ok) return ctx.response;

  const col = ctx.appSpec.collections.find((c) => c.key === collection);
  if (!col) {
    return NextResponse.json({ error: "UNKNOWN_COLLECTION" }, { status: 404 });
  }

  const record = await loadRecord(params, projectId, collection);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (ctx.permission === "view") {
    return NextResponse.json({ error: "READ_ONLY" }, { status: 403 });
  }

  // 合并更新：客户端允许只提交变化字段，仍经白名单清洗
  const body = await req.json().catch(() => null);
  const merged = { ...record.data, ...(typeof body === "object" && body !== null ? body : {}) };
  const data = sanitizeRecordData(col, merged);

  const { data: updated, error } = await getSupabaseAdmin()
    .from("app_records")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", record.id)
    .select("record_id, data, created_at, updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
  return NextResponse.json({ record: updated });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { projectId, collection } = await params;
  const ctx = await requireProjectContext(req, projectId);
  if (!ctx.ok) return ctx.response;

  const record = await loadRecord(params, projectId, collection);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (ctx.permission === "view") {
    return NextResponse.json({ error: "READ_ONLY" }, { status: 403 });
  }

  const { error } = await getSupabaseAdmin()
    .from("app_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", record.id);
  if (error) {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
