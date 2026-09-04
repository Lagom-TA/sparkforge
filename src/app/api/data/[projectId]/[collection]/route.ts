import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireProjectContext } from "@/lib/api/project-context";
import type { AppSpec, Collection } from "@/lib/specs/app-spec";
import { getGuestSession } from "@/lib/guest";

/**
 * 运行时数据 API：生成应用的所有读写都经过这里，
 * 按 AppSpec 白名单清洗字段，不信任客户端提交的任意键。
 */

function getCollection(appSpec: AppSpec, key: string): Collection | undefined {
  return appSpec.collections.find((c) => c.key === key);
}

/** 按字段定义清洗与强制转换输入数据；未知键一律丢弃 */
export function sanitizeRecordData(
  collection: Collection,
  input: unknown
): Record<string, unknown> {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of collection.fields) {
    const value = raw[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.required) continue; // 缺失必填字段交给上层校验
      out[field.key] = field.type === "boolean" ? false : null;
      continue;
    }
    switch (field.type) {
      case "number": {
        const n = Number(value);
        if (!Number.isFinite(n)) continue;
        out[field.key] = n;
        break;
      }
      case "boolean":
        out[field.key] = Boolean(value);
        break;
      case "date":
        out[field.key] = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null;
        break;
      case "select":
        if (field.options?.includes(String(value))) out[field.key] = String(value);
        break;
      default:
        out[field.key] = String(value).slice(0, 2000);
    }
  }
  return out;
}

function missingRequired(collection: Collection, data: Record<string, unknown>): string[] {
  return collection.fields
    .filter((f) => f.required && (data[f.key] === null || data[f.key] === undefined || data[f.key] === ""))
    .map((f) => f.label);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; collection: string }> }
) {
  const { projectId, collection } = await params;
  const ctx = await requireProjectContext(req, projectId);
  if (!ctx.ok) return ctx.response;

  const col = getCollection(ctx.appSpec, collection);
  if (!col) {
    return NextResponse.json({ error: "UNKNOWN_COLLECTION" }, { status: 404 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("app_records")
    .select("record_id, data, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("collection_key", collection)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
  return NextResponse.json({ records: data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; collection: string }> }
) {
  const { projectId, collection } = await params;
  const ctx = await requireProjectContext(req, projectId);
  if (!ctx.ok) return ctx.response;

  const col = getCollection(ctx.appSpec, collection);
  if (!col) {
    return NextResponse.json({ error: "UNKNOWN_COLLECTION" }, { status: 404 });
  }
  if (ctx.permission === "view") {
    return NextResponse.json({ error: "READ_ONLY" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const data = sanitizeRecordData(col, body);
  const missing = missingRequired(col, data);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "VALIDATION", message: `缺少必填字段：${missing.join("、")}` },
      { status: 422 }
    );
  }

  const guest = await getGuestSession();
  const { data: record, error } = await getSupabaseAdmin()
    .from("app_records")
    .insert({
      project_id: projectId,
      collection_key: collection,
      data,
      created_by: guest,
    })
    .select("record_id, data, created_at, updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
  return NextResponse.json({ record }, { status: 201 });
}
