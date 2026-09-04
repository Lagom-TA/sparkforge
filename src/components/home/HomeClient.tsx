"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  {
    key: "habits",
    label: "习惯追踪器",
    prompt:
      "为研究生做一个每周习惯追踪器。可以添加习惯、选择类别、记录当天是否完成、写备注，并展示本周完成率。数据刷新后不能丢失。",
  },
  {
    key: "leads",
    label: "客户线索看板",
    prompt:
      "做一个自由职业者客户线索管理工具。每条线索包含客户名、联系方式、预算、阶段、下次跟进日期和备注。支持按阶段筛选并修改跟进状态。",
  },
  {
    key: "events",
    label: "活动报名管理器",
    prompt:
      "做一个小型线下活动报名管理器。可以新增报名人、记录人数、联系方式和付款状态，支持搜索、取消报名，并统计已报名总人数。",
  },
];

export default function HomeClient({ dbConfigured }: { dbConfigured: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialPrompt: text }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "SUPABASE_NOT_CONFIGURED") {
          setError("数据库尚未配置（SUPABASE_NOT_CONFIGURED），请查看 README 完成环境变量设置。");
        } else {
          setError("创建项目失败，请重试。");
        }
        return;
      }
      router.push(`/workspace/${body.project.id}`);
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="hero-glow flex-1">
      <div className="mx-auto max-w-3xl px-6 pb-24 pt-14 sm:pt-20">
        <div className="animate-fade-up">
          <h1 className="text-balance text-4xl font-bold leading-[1.15] tracking-tight sm:text-[3.5rem]">
            从一句话，到
            <span className="text-accent">通过验收</span>
            的应用
          </h1>
        </div>

        <div className="animate-fade-up mt-12" style={{ animationDelay: "80ms" }}>
          <div className="rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-black/[0.06] transition-colors focus-within:border-line-strong">
            <textarea
              className="min-h-28 w-full resize-none rounded-xl bg-transparent p-4 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none"
              placeholder="描述你想做的应用…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
              }}
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
                <kbd className="rounded border border-line bg-background px-1.5 py-0.5 font-mono text-[10px] leading-none">
                  ⌘↵
                </kbd>
                快速提交
              </span>
              <button
                onClick={start}
                disabled={!prompt.trim() || submitting}
                className="btn-gradient rounded-xl px-6 py-2.5 text-sm font-semibold disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <span className="spinner" /> 创建中…
                  </>
                ) : (
                  "开始生成"
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          {!dbConfigured && (
            <p className="mt-3 text-center text-xs text-red-600">
              数据库未配置，无法创建项目（见 README）。
            </p>
          )}
        </div>

        <div className="animate-fade-up mt-16" style={{ animationDelay: "160ms" }}>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-faint">
            示例
          </p>
          <div className="stagger grid gap-3 sm:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.key}
                onClick={() => setPrompt(ex.prompt)}
                className="card-lift group flex items-center justify-between rounded-xl border border-line bg-surface p-4 text-left"
              >
                <p className="text-sm font-medium">{ex.label}</p>
                <span className="text-faint opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100">
                  →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}