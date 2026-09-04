import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getProject, getActiveAppSpec } from "@/lib/projects";
import { validateAppSpecReferences, type AppSpec, type Collection } from "@/lib/specs/app-spec";
import { sanitizeRecordData } from "@/app/api/data/[projectId]/[collection]/route";

/**
 * Verifier Agent（确定性检查优先，方案 §8.4）。
 * 对激活版本在真实数据库上执行隔离的 CRUD 验证：
 * 测试记录以 created_by='__verifier__' 标记并在结束时软删除，不污染用户数据。
 */

export interface CheckResult {
  id: string;
  description: string;
  status: "passed" | "failed";
  evidence: string;
  critical: boolean;
}

const VERIFIER_MARK = "__verifier__";

function syntheticData(col: Collection): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of col.fields) {
    switch (f.type) {
      case "number":
        data[f.key] = 1;
        break;
      case "boolean":
        data[f.key] = true;
        break;
      case "date":
        data[f.key] = new Date().toISOString().slice(0, 10);
        break;
      case "select":
        data[f.key] = f.options?.[0] ?? null;
        break;
      case "textarea":
        data[f.key] = `${VERIFIER_MARK} 验证记录`;
        break;
      default:
        data[f.key] = `${VERIFIER_MARK} 测试记录`;
    }
  }
  return data;
}

async function runCollectionChecks(
  projectId: string,
  col: Collection,
  results: CheckResult[]
): Promise<void> {
  const db = getSupabaseAdmin();
  const payload = sanitizeRecordData(col, syntheticData(col));

  // 1. 创建
  const { data: created, error: createErr } = await db
    .from("app_records")
    .insert({
      project_id: projectId,
      collection_key: col.key,
      data: payload,
      created_by: VERIFIER_MARK,
    })
    .select("record_id, data")
    .single();
  if (createErr || !created) {
    results.push({
      id: `${col.key}.create`,
      description: `[${col.label}] 新建记录成功`,
      status: "failed",
      evidence: createErr?.message ?? "未返回记录",
      critical: true,
    });
    return;
  }
  results.push({
    id: `${col.key}.create`,
    description: `[${col.label}] 新建记录成功`,
    status: "passed",
    evidence: `record_id=${created.record_id.slice(0, 8)}…`,
    critical: true,
  });

  // 2. 持久化（重新查询模拟刷新后的读取）
  const { data: reloaded } = await db
    .from("app_records")
    .select("record_id, data")
    .eq("record_id", created.record_id)
    .is("deleted_at", null)
    .maybeSingle();
  const persisted = Boolean(reloaded && (reloaded.data as Record<string, unknown>)[col.fields[0].key]);
  results.push({
    id: `${col.key}.persist`,
    description: `[${col.label}] 数据刷新后仍存在`,
    status: persisted ? "passed" : "failed",
    evidence: persisted ? "重新查询读取到完整字段" : "重新查询未找到记录",
    critical: true,
  });

  // 3. 编辑
  const editField = col.fields.find((f) => f.type === "text") ?? col.fields[0];
  const editedData = { ...created.data, [editField.key]: `${VERIFIER_MARK} 已编辑` };
  const cleanEdit = sanitizeRecordData(col, editedData);
  const { error: patchErr } = await db
    .from("app_records")
    .update({ data: cleanEdit, updated_at: new Date().toISOString() })
    .eq("record_id", created.record_id);
  const editOk = !patchErr;
  results.push({
    id: `${col.key}.edit`,
    description: `[${col.label}] 编辑记录成功（${editField.label}）`,
    status: editOk ? "passed" : "failed",
    evidence: editOk ? "更新写入成功" : patchErr?.message ?? "更新失败",
    critical: true,
  });

  // 4. 删除（软删除后应查不到）
  const { error: delErr } = await db
    .from("app_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("record_id", created.record_id);
  let deletedOk = !delErr;
  if (deletedOk) {
    const { data: stillThere } = await db
      .from("app_records")
      .select("id")
      .eq("record_id", created.record_id)
      .is("deleted_at", null)
      .maybeSingle();
    deletedOk = !stillThere;
  }
  results.push({
    id: `${col.key}.delete`,
    description: `[${col.label}] 删除记录成功`,
    status: deletedOk ? "passed" : "failed",
    evidence: deletedOk ? "软删除后查询不可见" : "删除失败或记录仍可见",
    critical: true,
  });
}

export async function runVerification(projectId: string): Promise<{
  versionId: string | null;
  results: CheckResult[];
  status: "passed" | "failed";
}> {
  const results: CheckResult[] = [];
  const project = await getProject(projectId);
  if (!project) throw new Error("NOT_FOUND");

  const appSpec = await getActiveAppSpec(projectId);
  if (!appSpec) {
    results.push({
      id: "structure",
      description: "应用存在可运行版本",
      status: "failed",
      evidence: "项目没有激活版本",
      critical: true,
    });
    return { versionId: null, results, status: "failed" };
  }

  // 结构检查
  const refErrors = validateAppSpecReferences(appSpec);
  results.push({
    id: "structure",
    description: "应用结构合法（视图引用有效）",
    status: refErrors.length === 0 ? "passed" : "failed",
    evidence: refErrors.length === 0 ? `「${appSpec.app.name}」共 ${appSpec.collections.length} 个数据集` : refErrors.join("; "),
    critical: true,
  });

  // 每个数据集的 CRUD + 持久化
  for (const col of appSpec.collections) {
    await runCollectionChecks(projectId, col, results);
  }

  const status = results.some((r) => r.critical && r.status === "failed") ? "failed" : "passed";

  const { data: version } = await getSupabaseAdmin()
    .from("versions")
    .select("id")
    .eq("id", project.active_version_id!)
    .maybeSingle();

  await getSupabaseAdmin().from("verification_runs").insert({
    project_id: projectId,
    version_id: project.active_version_id,
    status,
    results,
  });

  return { versionId: version?.id ?? null, results, status };
}
