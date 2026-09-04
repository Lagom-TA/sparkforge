"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductSpec } from "@/lib/specs/product-spec";

/**
 * Agent Workspace：Planner 蓝图审批卡 + 阶段流转。
 * 状态来自 generation 记录，刷新页面可恢复。
 */

interface Generation {
  id: string;
  request_text?: string | null;
  status: string;
  current_stage: string | null;
  product_spec: ProductSpec | null;
  error_code: string | null;
  error_message: string | null;
}

interface VersionRow {
  id: string;
  version_number: number;
  change_summary: string | null;
  created_at: string;
}

type Stage = "none" | "planning" | "awaiting_approval" | "building" | "ready" | "failed";

const STEPS: { key: Stage[]; label: string }[] = [
  { key: ["planning"], label: "规划" },
  { key: ["awaiting_approval", "none"], label: "批准" },
  { key: ["building"], label: "构建" },
  { key: ["ready"], label: "就绪" },
];

export default function AgentWorkspace({
  projectId,
  initialGeneration,
  initialVersions,
  activeVersionId,
  llmConfigured,
}: {
  projectId: string;
  initialGeneration: Generation | null;
  initialVersions: VersionRow[];
  activeVersionId: string | null;
  llmConfigured: boolean;
}) {
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation | null>(initialGeneration);
  const [versions, setVersions] = useState<VersionRow[]>(initialVersions);
  const [activeVersion, setActiveVersion] = useState<string | null>(activeVersionId);
  const [planning, setPlanning] = useState(false);
  const [building, setBuilding] = useState(false);
  const [refineMessage, setRefineMessage] = useState("");
  const [refining, setRefining] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductSpec | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const spec = editing ?? generation?.product_spec ?? null;
  const status: Stage = (generation?.status as Stage) ?? "none";

  // 首次进入且无 generation 时自动触发规划
  useEffect(() => {
    if (status === "none" && llmConfigured) {
      startPlanning();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPlanning() {
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "LLM_NOT_CONFIGURED") {
          setError("模型服务尚未配置（LLM_NOT_CONFIGURED），请查看 README 设置环境变量。");
        } else {
          setError("规划失败，请重试。");
        }
        return;
      }
      setGeneration(body.generation);
      setEditing(null);
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setPlanning(false);
    }
  }

  async function refreshVersions() {
    const res = await fetch(`/api/projects/${projectId}/versions`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      setVersions(body.versions ?? []);
      setActiveVersion(body.activeVersionId ?? null);
    }
  }

  async function approveAndBuild() {
    if (!spec) return;
    setBuilding(true);
    setError(null);
    try {
      const payload = jsonMode ? JSON.parse(jsonText) : spec;
      const res = await fetch(`/api/projects/${projectId}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSpec: payload, generationId: generation?.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? "构建失败，请检查蓝图后重试。");
        return;
      }
      const passed = body.verification?.status === "passed";
      setGeneration((g) => (g ? { ...g, status: passed ? "ready" : "failed" } : g));
      if (!passed) {
        setError(
          `构建完成但验收未通过（自动修复 ${body.repairRounds ?? 0} 轮）。请打开 Tests 页签查看失败详情，修改蓝图后重试。`
        );
      }
      setEditing(null);
      await refreshVersions();
      router.refresh();
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setBuilding(false);
    }
  }

  function enterJsonMode() {
    if (spec) setJsonText(JSON.stringify(spec, null, 2));
    setJsonMode(true);
  }

  function updateSpec(patch: Partial<ProductSpec>) {
    if (!spec) return;
    setEditing({ ...spec, ...patch });
  }

  async function submitRefinement() {
    const message = refineMessage.trim();
    if (!message || refining) return;
    setRefining(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error === "LLM_NOT_CONFIGURED" ? "模型服务尚未配置。" : "修改规划失败，请重试。");
        return;
      }
      setGeneration(body.generation);
      setEditing(null);
      setRefineMessage("");
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setRefining(false);
    }
  }

  async function switchVersion(versionId: string) {
    const res = await fetch(`/api/projects/${projectId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (res.ok) {
      await refreshVersions();
      router.refresh();
    }
  }

  async function createShareLink() {
    setSharing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: "interact" }),
      });
      const body = await res.json();
      if (res.ok) {
        setShareUrl(`${window.location.origin}/share/${projectId}/${body.token}`);
      } else {
        setError("生成分享链接失败，请重试。");
      }
    } finally {
      setSharing(false);
    }
  }

  const busy = planning || building;

  // 阶段进度指示
  const currentStep = useMemo(() => {
    if (busy) return planning ? 0 : 2;
    switch (status) {
      case "planning":
        return 0;
      case "awaiting_approval":
      case "none":
        return 1;
      case "building":
        return 2;
      case "ready":
        return 3;
      case "failed":
        return 2;
      default:
        return 1;
    }
  }, [status, busy, planning]);

  const statusLabel = planning
    ? "规划中"
    : building
      ? "构建中"
      : status === "ready"
        ? "已就绪"
        : status === "failed"
          ? "验收未通过"
          : status === "awaiting_approval"
            ? "等待批准"
            : "准备中";

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col overflow-y-auto">
      {/* 标题与阶段 */}
      <div className="sticky top-0 z-10 border-b border-line bg-background/90 px-5 pb-4 pt-5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-[15px] font-semibold">
            {spec?.title ?? "智能体工作区"}
          </h1>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              status === "ready" && !busy
                ? "bg-green-600/10 text-green-600"
                : status === "failed" && !busy
                  ? "bg-red-600/10 text-red-600"
                  : "bg-accent-soft text-accent"
            }`}
          >
            {(busy || status === "planning" || status === "building") && (
              <span className="animate-breathe mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            )}
            {statusLabel}
          </span>
        </div>

        {/* 步骤条 */}
        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex flex-1 items-center gap-1.5 last:flex-none">
              <div
                className={`flex h-5 items-center gap-1.5 rounded-full px-2 font-mono text-[10px] ${
                  i === currentStep
                    ? "bg-accent-soft text-accent"
                    : i < currentStep
                      ? "text-green-600"
                      : "text-faint"
                }`}
              >
                {i < currentStep ? "✓" : i + 1} {step.label}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 ${i < currentStep ? "bg-green-400/40" : "bg-line"}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 px-5 py-5">
        {/* 用户需求 */}
        {generation?.request_text && (
          <div className="animate-fade-up rounded-xl border border-line bg-surface p-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              需求
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
              {generation.request_text}
            </p>
          </div>
        )}

        {error && (
          <p className="animate-fade-up rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3.5 text-xs leading-relaxed text-red-600">
            {error}
            <button onClick={startPlanning} className="ml-2 underline underline-offset-2">
              重试
            </button>
          </p>
        )}

        {busy && (
          <div className="animate-fade-up rounded-xl border border-line bg-surface p-6">
            <div className="flex items-center justify-center gap-3">
              <span className="dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <p className="text-sm text-muted">
                {planning
                  ? "正在分析需求并产出蓝图"
                  : "正在编译应用并写入数据库"}
              </p>
            </div>
            <div className="progress-track mx-auto mt-5 max-w-56" />
          </div>
        )}

        {/* 蓝图卡 */}
        {spec && !busy && (
          <div className="animate-fade-up rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-[13px] font-semibold">应用蓝图</h3>
            </div>

            <div className="p-4">
              {jsonMode ? (
                <textarea
                  className="w-full rounded-lg border border-line bg-background p-3 font-mono text-[11px] leading-relaxed text-muted focus:border-line-strong focus:outline-none min-h-96"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                />
              ) : (
                <div className="space-y-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-faint">
                        应用名称
                      </label>
                      <input
                        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-[13px] focus:border-line-strong focus:outline-none"
                        value={spec.title}
                        onChange={(e) => updateSpec({ title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-faint">
                        目标用户
                      </label>
                      <input
                        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-[13px] focus:border-line-strong focus:outline-none"
                        value={spec.targetUser}
                        onChange={(e) => updateSpec({ targetUser: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-faint">
                      说明
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-line bg-background px-3 py-2 text-[13px] leading-relaxed focus:border-line-strong focus:outline-none"
                      rows={2}
                      value={spec.summary}
                      onChange={(e) => updateSpec({ summary: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-faint">
                      数据实体
                    </label>
                    <div className="space-y-2">
                      {spec.entities.map((ent) => (
                        <div
                          key={ent.key}
                          className="rounded-lg border border-line bg-background p-3"
                        >
                          <p className="font-mono text-xs font-medium text-foreground">
                            {ent.label}
                            <span className="ml-2 text-faint">{ent.key}</span>
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {ent.fields.map((f) => (
                              <span
                                key={f.key}
                                className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted"
                              >
                                {f.label}
                                <span className="ml-1 text-accent/80">{f.type}</span>
                                {f.required && <span className="ml-0.5 text-accent">*</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-faint">
                      验收标准
                    </label>
                    <div className="space-y-1.5">
                      {spec.acceptanceCriteria.map((ac, i) => (
                        <div key={ac.id} className="flex items-center gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[10px] text-accent">
                            {i + 1}
                          </span>
                          <input
                            className="flex-1 rounded-lg border border-transparent bg-background px-2.5 py-1.5 text-xs text-muted focus:border-line-strong focus:text-foreground focus:outline-none"
                            value={ac.description}
                            onChange={(e) =>
                              updateSpec({
                                acceptanceCriteria: spec.acceptanceCriteria.map((a) =>
                                  a.id === ac.id ? { ...a, description: e.target.value } : a
                                ),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
              {jsonMode ? (
                <button
                  onClick={() => setJsonMode(false)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
                >
                  返回表单编辑
                </button>
              ) : (
                <button
                  onClick={enterJsonMode}
                  className="font-mono text-[11px] text-faint hover:text-muted"
                >
                  {"{ }"} JSON 编辑
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={startPlanning}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-foreground disabled:opacity-50"
              >
                重新规划
              </button>
              <button
                onClick={approveAndBuild}
                disabled={busy || (jsonMode && !jsonText.trim())}
                className="btn-gradient rounded-lg px-4 py-1.5 text-xs font-semibold shadow-md shadow-black/10 disabled:cursor-not-allowed"
              >
                {building ? (
                  <>
                    <span className="spinner" /> 构建中…
                  </>
                ) : status === "ready" ? (
                  "批准并构建新版本"
                ) : (
                  "批准并构建"
                )}
              </button>
            </div>
          </div>
        )}

        {!spec && !busy && (
          <div className="rounded-xl border border-dashed border-line p-8 text-center">
            <p className="text-sm text-muted">
              {llmConfigured ? "点击重试开始规划。" : "未配置模型服务：仍可浏览项目，但无法生成新计划。"}
            </p>
          </div>
        )}

        {/* 继续修改 + 版本 + 分享 */}
        {activeVersion && (
          <div className="animate-fade-up rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-3 text-[13px] font-semibold">继续修改</h3>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-line bg-background px-3 py-2 text-[13px] placeholder:text-faint focus:border-line-strong focus:outline-none"
                placeholder="例如：增加“优先级”字段，高优先级记录排前面"
                value={refineMessage}
                onChange={(e) => setRefineMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submitRefinement();
                }}
                maxLength={4000}
              />
              <button
                onClick={submitRefinement}
                disabled={refining || !refineMessage.trim()}
                className="btn-gradient rounded-lg px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed"
              >
                {refining ? <span className="spinner" /> : "发送"}
              </button>
            </div>

            {versions.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
                  版本历史
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => switchVersion(v.id)}
                      disabled={v.id === activeVersion}
                      title={v.change_summary ?? ""}
                      className={`rounded-full px-3 py-1 font-mono text-[11px] transition-colors ${
                        v.id === activeVersion
                          ? "bg-green-600/10 text-green-600"
                          : "border border-line text-muted hover:border-line-strong hover:text-foreground"
                      }`}
                    >
                      V{v.version_number}
                      {v.id === activeVersion && " ·当前"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-line pt-3">
              {shareUrl ? (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    className="flex-1 rounded-lg border border-line bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted"
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted hover:text-foreground"
                  >
                    {copied ? "✓ 已复制" : "复制"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={createShareLink}
                  disabled={sharing}
                  className="text-[11px] text-faint underline underline-offset-2 hover:text-muted disabled:opacity-50"
                >
                  {sharing ? "生成中…" : "生成公开分享链接"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
