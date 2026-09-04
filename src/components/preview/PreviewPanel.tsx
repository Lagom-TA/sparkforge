"use client";

import { useState } from "react";
import AppRuntime from "@/components/preview/AppRuntime";
import type { AppSpec } from "@/lib/specs/app-spec";

interface CheckResult {
  id: string;
  description: string;
  status: "passed" | "failed";
  evidence: string;
  critical: boolean;
}

export default function PreviewPanel({
  projectId,
  appSpec,
}: {
  projectId: string;
  appSpec: AppSpec;
}) {
  const [tab, setTab] = useState<"preview" | "tests" | "code">("preview");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [runStatus, setRunStatus] = useState<"passed" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<Record<string, string> | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  async function runVerification() {
    if (running) return;
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/verify`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error === "NO_ACTIVE_VERSION" ? "没有可验收的版本。" : "验收执行失败，请重试。");
        return;
      }
      setResults(body.results);
      setRunStatus(body.status);
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setRunning(false);
    }
  }

  async function loadSource() {
    if (sourceFiles) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/source`, { cache: "no-store" });
      if (!res.ok) {
        setError("源文件加载失败。");
        return;
      }
      const body = await res.json();
      setSourceFiles(body.files ?? {});
      setActiveFile(Object.keys(body.files ?? {})[0] ?? null);
    } catch {
      setError("网络错误，请重试。");
    }
  }

  function switchTab(next: "preview" | "tests" | "code") {
    setTab(next);
    if (next === "code" && !sourceFiles) loadSource();
  }

  return (
    <div className="flex h-full flex-col">
      {/* 页签栏 */}
      <div className="flex items-center gap-1 border-b border-line bg-background/60 px-4 pt-2.5">
        {(
          [
            ["preview", "Preview", null],
            ["tests", "Tests", runStatus],
            ["code", "Code", null],
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`relative rounded-t-lg px-4 py-2 text-[13px] font-medium transition-colors ${
              tab === key ? "text-foreground" : "text-faint hover:text-muted"
            }`}
          >
            {label}
            {key === "tests" && badge && (
              <span
                className={`ml-1.5 font-mono text-[10px] ${
                  badge === "passed" ? "text-green-600" : "text-red-600"
                }`}
              >
                {badge === "passed" ? "✓" : "✗"}
              </span>
            )}
            {tab === key && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {tab === "preview" && (
        <div key="tab-preview" className="animate-fade-up flex-1 overflow-y-auto">
          <AppRuntime projectId={projectId} appSpec={appSpec} />
        </div>
      )}

      {tab === "tests" && (
        <div key="tab-tests" className="animate-fade-up flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">自动验收</h3>
            <button
              onClick={runVerification}
              disabled={running}
              className="btn-gradient rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed"
            >
              {running ? (
                <>
                  <span className="spinner" /> 运行中…
                </>
              ) : results ? (
                "重新运行"
              ) : (
                "运行验收"
              )}
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-xs text-red-600">
              {error}
            </p>
          )}
          {running && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <span className="dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <p className="text-sm text-muted">正在逐项验证应用行为</p>
              </div>
              <div className="progress-track mt-4" />
            </div>
          )}
          {results && !running && (
            <>
              <p
                className={`mb-3 rounded-lg border p-3 text-xs font-medium ${
                  runStatus === "passed"
                    ? "border-green-600/25 bg-green-400/5 text-green-600"
                    : "border-red-600/25 bg-red-600/[0.04] text-red-600"
                }`}
              >
                {runStatus === "passed"
                  ? `✓ 全部 ${results.length} 项检查通过`
                  : `✗ ${results.filter((r) => r.status === "failed").length} / ${results.length} 项检查未通过`}
              </p>
              <ul className="space-y-2">
                {results.map((r, i) => (
                  <li
                    key={r.id}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className={`animate-fade-up flex items-start gap-3 rounded-lg border p-3.5 ${
                      r.status === "passed"
                        ? "border-green-600/20 bg-green-600/[0.04]"
                        : "border-red-600/25 bg-red-600/[0.05]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        r.status === "passed"
                          ? "bg-green-600/10 text-green-600"
                          : "bg-red-600/10 text-red-600"
                      }`}
                    >
                      {r.status === "passed" ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{r.description}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-faint">{r.evidence}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === "code" && (
        <div key="tab-code" className="animate-fade-up flex flex-1 overflow-hidden">
          <aside className="w-52 shrink-0 overflow-y-auto border-r border-line bg-background/40 p-2">
            {sourceFiles === null && (
              <p className="p-2 text-xs text-faint">加载中…</p>
            )}
            {sourceFiles &&
              Object.keys(sourceFiles).map((name) => (
                <button
                  key={name}
                  onClick={() => setActiveFile(name)}
                  className={`block w-full truncate rounded-lg px-3 py-1.5 text-left font-mono text-[11px] transition-colors ${
                    activeFile === name
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {name}
                </button>
              ))}
          </aside>
          <pre className="flex-1 overflow-auto bg-[#0d0d10] p-5 font-mono text-[11.5px] leading-relaxed text-neutral-300">
            <code>{activeFile ? (sourceFiles?.[activeFile] ?? "") : ""}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
