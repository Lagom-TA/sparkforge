import { getSupabaseAdmin } from "@/lib/supabase/server";
import { runPlanner, PlannerError } from "@/lib/agents/planner";
import { compileProductToAppSpec } from "@/lib/compiler/product-to-app";
import { getProject } from "@/lib/projects";
import { isLlmConfigured } from "@/lib/llm/provider";
import type { ProductSpec } from "@/lib/specs/product-spec";
import type { AppSpec } from "@/lib/specs/app-spec";
import type { PublicLogEntry, Stage } from "@/lib/pipeline/stages";
import type { CheckResult } from "@/lib/agents/verifier";

/**
 * 生成编排（显式状态机，方案 §8.5）。
 * Phase 3 同步执行：Plan → 审批 → Build。
 * 公开日志原则：只记录阶段、产物与错误摘要，不暴露模型推理。
 */

interface GenerationRow {
  id: string;
  project_id: string;
  request_text: string;
  status: string;
  current_stage: string | null;
  product_spec: ProductSpec | null;
  error_code: string | null;
  error_message: string | null;
}

function logEntry(stage: Stage, message: string, level: PublicLogEntry["level"] = "info"): PublicLogEntry {
  return { at: new Date().toISOString(), stage, message, level };
}

export async function getLatestGeneration(projectId: string): Promise<GenerationRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("generations")
    .select(
      "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
    )
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as GenerationRow) ?? null;
}

/** Step 1：运行 Planner，产出待批准的 ProductSpec */
export async function startPlanning(projectId: string): Promise<GenerationRow> {
  const project = await getProject(projectId);
  if (!project) throw new Error("NOT_FOUND");
  if (isLlmConfigured() === false) throw new PlannerError("LLM_NOT_CONFIGURED");

  const { data: generation, error } = await getSupabaseAdmin()
    .from("generations")
    .insert({
      project_id: projectId,
      request_text: project.initial_prompt,
      status: "running",
      current_stage: "planning",
      public_log: [logEntry("planning", "Planner 正在分析需求…")],
    })
    .select(
      "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
    )
    .single();
  if (error) throw error;

  await getSupabaseAdmin()
    .from("projects")
    .update({ status: "planning", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  try {
    const spec = await runPlanner(project.initial_prompt);
    const { data: updated, error: updateErr } = await getSupabaseAdmin()
      .from("generations")
      .update({
        status: "awaiting_approval",
        product_spec: spec,
        public_log: [
          logEntry("planning", `Planner 已产出计划「${spec.title}」，等待用户批准`),
        ],
      })
      .eq("id", generation.id)
      .select(
        "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
      )
      .single();
    if (updateErr) throw updateErr;
    await getSupabaseAdmin()
      .from("projects")
      .update({ status: "awaiting_approval", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return updated as GenerationRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    const { data: failed } = await getSupabaseAdmin()
      .from("generations")
      .update({
        status: "failed",
        error_code: message.split(":")[0],
        error_message: message.slice(0, 500),
        public_log: [logEntry("planning", `规划失败：${message.slice(0, 200)}`, "error")],
      })
      .eq("id", generation.id)
      .select(
        "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
      )
      .single();
    await getSupabaseAdmin()
      .from("projects")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return (failed as GenerationRow) ?? generation;
  }
}

/** Step 1b：聊天增量修改——基于当前激活版本的 ProductSpec 应用用户要求 */
export async function startRefinement(
  projectId: string,
  message: string
): Promise<GenerationRow> {
  const project = await getProject(projectId);
  if (!project) throw new Error("NOT_FOUND");
  if (!project.active_version_id) throw new Error("NO_ACTIVE_VERSION");
  if (isLlmConfigured() === false) throw new PlannerError("LLM_NOT_CONFIGURED");

  const currentSpec = await getActiveProductSpec(projectId);
  if (!currentSpec) throw new Error("NO_ACTIVE_VERSION");

  const { data: generation, error } = await getSupabaseAdmin()
    .from("generations")
    .insert({
      project_id: projectId,
      request_text: message.slice(0, 4000),
      status: "running",
      current_stage: "planning",
      public_log: [logEntry("planning", "Planner 正在基于当前版本应用修改…")],
    })
    .select(
      "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
    )
    .single();
  if (error) throw error;

  await getSupabaseAdmin()
    .from("projects")
    .update({ status: "refining", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  try {
    const spec = await runPlanner(message, currentSpec);
    const { data: updated, error: updateErr } = await getSupabaseAdmin()
      .from("generations")
      .update({
        status: "awaiting_approval",
        product_spec: spec,
        public_log: [
          logEntry("planning", `Planner 已产出修改计划「${spec.title}」，等待用户批准`),
        ],
      })
      .eq("id", generation.id)
      .select(
        "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
      )
      .single();
    if (updateErr) throw updateErr;
    await getSupabaseAdmin()
      .from("projects")
      .update({ status: "awaiting_approval", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return updated as GenerationRow;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    const { data: failed } = await getSupabaseAdmin()
      .from("generations")
      .update({
        status: "failed",
        error_code: msg.split(":")[0],
        error_message: msg.slice(0, 500),
        public_log: [logEntry("planning", `修改规划失败：${msg.slice(0, 200)}`, "error")],
      })
      .eq("id", generation.id)
      .select(
        "id, project_id, request_text, status, current_stage, product_spec, error_code, error_message"
      )
      .single();
    await getSupabaseAdmin()
      .from("projects")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return (failed as GenerationRow) ?? generation;
  }
}

async function getActiveProductSpec(projectId: string): Promise<ProductSpec | null> {
  const project = await getProject(projectId);
  if (!project?.active_version_id) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("versions")
    .select("product_spec")
    .eq("id", project.active_version_id)
    .maybeSingle();
  if (error || !data) return null;
  return (data.product_spec as ProductSpec) ?? null;
}

export interface VersionRow {
  id: string;
  version_number: number;
  change_summary: string | null;
  created_at: string;
}

export async function listVersions(projectId: string): Promise<VersionRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("versions")
    .select("id, version_number, change_summary, created_at")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data as VersionRow[];
}

/** 切换激活版本。应用数据归属项目，切换后旧数据仍然可见。 */
export async function activateVersion(projectId: string, versionId: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("versions")
    .select("id")
    .eq("id", versionId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  await getSupabaseAdmin()
    .from("projects")
    .update({ active_version_id: versionId, updated_at: new Date().toISOString() })
    .eq("id", projectId);
}

async function insertVersion(
  projectId: string,
  productSpec: ProductSpec,
  appSpec: AppSpec,
  changeSummary: string
): Promise<{ id: string; version_number: number }> {
  // 确定下一个版本号
  const { data: last, error: lastErr } = await getSupabaseAdmin()
    .from("versions")
    .select("version_number")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw lastErr;
  const versionNumber = (last?.version_number ?? 0) + 1;

  const { generateSourceBundle } = await import("@/lib/compiler/source-generator");
  const sourceBundle = generateSourceBundle(appSpec);

  const { data: version, error } = await getSupabaseAdmin()
    .from("versions")
    .insert({
      project_id: projectId,
      version_number: versionNumber,
      product_spec: productSpec,
      app_spec: appSpec,
      source_bundle: sourceBundle,
      change_summary: changeSummary,
    })
    .select("id, version_number")
    .single();
  if (error) throw error;
  return version;
}

export async function approveAndBuild(
  projectId: string,
  productSpec: ProductSpec
): Promise<{ appSpec: AppSpec; versionNumber: number }> {
  const project = await getProject(projectId);
  if (!project) throw new Error("NOT_FOUND");

  await getSupabaseAdmin()
    .from("projects")
    .update({ status: "building", updated_at: new Date().toISOString() })
    .eq("id", projectId);

  let appSpec: AppSpec;
  try {
    appSpec = compileProductToAppSpec(productSpec);
  } catch (err) {
    await getSupabaseAdmin()
      .from("projects")
      .update({ status: "awaiting_approval", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    throw err;
  }

  const version = await insertVersion(
    projectId,
    productSpec,
    appSpec,
    project.status === "ready" ? "根据修改需求重新构建" : "初始版本"
  );

  await getSupabaseAdmin()
    .from("projects")
    .update({
      status: "ready",
      active_version_id: version.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  return { appSpec, versionNumber: version.version_number };
}

async function appendLog(
  generationId: string | null | undefined,
  entry: PublicLogEntry
) {
  if (!generationId) return;
  const { data } = await getSupabaseAdmin()
    .from("generations")
    .select("public_log")
    .eq("id", generationId)
    .maybeSingle();
  const current = (data?.public_log as PublicLogEntry[] | null) ?? [];
  await getSupabaseAdmin()
    .from("generations")
    .update({ public_log: [...current, entry] })
    .eq("id", generationId);
}

export interface BuildOutcome {
  versionNumber: number;
  verification: { status: "passed" | "failed"; results: CheckResult[] };
  repairRounds: number;
}

/**
 * 构建 + 自动验收修复循环（方案 §6.3 Step 5）：
 * 构建后立即验收；关键项失败时由 Repairer 出受约束修复，最多两轮。
 * 超过轮次仍失败则保留最后版本并标记 failed，给出手动重试入口。
 */
export async function buildAndVerify(
  projectId: string,
  productSpec: ProductSpec,
  generationId?: string | null,
  maxRepairRounds = 2
): Promise<BuildOutcome> {
  const { runVerification } = await import("@/lib/agents/verifier");
  const { runRepairer } = await import("@/lib/agents/repairer");

  const { versionNumber } = await approveAndBuild(projectId, productSpec);
  await appendLog(generationId, logEntry("building", `V${versionNumber} 已构建，开始自动验收`));

  let currentSpec = productSpec;
  let verification = await runVerification(projectId);
  let rounds = 0;

  while (verification.status === "failed" && rounds < maxRepairRounds) {
    rounds += 1;
    const failures = verification.results.filter((r) => r.status === "failed");
    await appendLog(
      generationId,
      logEntry("repairing", `验收发现 ${failures.length} 项失败，Repairer 开始第 ${rounds} 轮修复`, "warn")
    );
    try {
      currentSpec = await runRepairer(currentSpec, failures);
      const appSpec = compileProductToAppSpec(currentSpec);
      const version = await insertVersion(projectId, currentSpec, appSpec, `自动修复 第 ${rounds} 轮`);
      await getSupabaseAdmin()
        .from("projects")
        .update({ active_version_id: version.id, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      verification = await runVerification(projectId);
      await appendLog(
        generationId,
        logEntry("validating", `第 ${rounds} 轮修复后重新验收：${verification.status === "passed" ? "通过" : "仍有失败"}`)
      );
    } catch (err) {
      await appendLog(
        generationId,
        logEntry("repairing", `修复失败：${(err instanceof Error ? err.message : "未知错误").slice(0, 200)}`, "error")
      );
      break;
    }
  }

  if (verification.status === "passed") {
    await appendLog(generationId, logEntry("validating", `验收通过，V${versionNumber} 就绪`));
  } else {
    await getSupabaseAdmin()
      .from("projects")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    await appendLog(
      generationId,
      logEntry("validating", "达到修复轮次上限，已保留最后版本供检查，可手动重试", "error")
    );
  }

  return { versionNumber, verification, repairRounds: rounds };
}
