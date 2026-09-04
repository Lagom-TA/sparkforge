"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSpec, Collection, FieldDef, ViewDef } from "@/lib/specs/app-spec";

/**
 * Preview Runtime：根据 AppSpec 渲染可交互应用。
 * 只渲染白名单视图与字段类型；所有数据经运行时 Data API 持久化。
 */

interface RecordRow {
  record_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type Draft = Record<string, string | number | boolean>;

const inputCls =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-faint focus:border-line-strong focus:outline-none";

function emptyDraft(col: Collection): Draft {
  const draft: Draft = {};
  for (const f of col.fields) {
    draft[f.key] = f.type === "boolean" ? false : "";
  }
  return draft;
}

function formatValue(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "boolean") return value ? "是" : "否";
  return String(value);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  if (field.type === "textarea") {
    return (
      <textarea
        className={inputCls}
        rows={3}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        className={inputCls}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">请选择…</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        {field.label}
      </label>
    );
  }
  return (
    <input
      className={inputCls}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={String(value ?? "")}
      onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
    />
  );
}

function RecordForm({
  collection,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  collection: Collection;
  initial: Draft;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const err = await onSubmit(draft);
        setSaving(false);
        if (err) setError(err);
      }}
    >
      {collection.fields.map((f) => (
        <div key={f.key}>
          {f.type !== "boolean" && (
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-faint">
              {f.label}
              {f.required && <span className="ml-0.5 text-accent">*</span>}
            </label>
          )}
          <FieldInput
            field={f}
            value={draft[f.key] ?? ""}
            onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
          />
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="btn-gradient rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <span className="spinner" /> 保存中…
            </>
          ) : (
            submitLabel
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-4 py-2 text-xs text-muted transition-colors hover:text-foreground"
        >
          取消
        </button>
      </div>
    </form>
  );
}

function RecordsView({
  projectId,
  appSpec,
  view,
  collections,
  shareToken,
}: {
  projectId: string;
  appSpec: AppSpec;
  view: ViewDef;
  collections: Collection[];
  shareToken?: string;
}) {
  const col = collections.find((c) => c.key === view.collection);
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "create" | { edit: RecordRow }>("list");
  const [filterText, setFilterText] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const headers: Record<string, string> = { "x-share-token": shareToken ?? "" };

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/data/${projectId}/${view.collection}`, {
        cache: "no-store",
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `加载失败（${res.status}）`);
      }
      const body = (await res.json()) as { records: RecordRow[] };
      setRecords(body.records);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载失败");
      setRecords([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, view.collection]);

  useEffect(() => {
    load();
  }, [load]);

  const searchFields = useMemo(
    () => (col ? col.fields.filter((f) => f.type === "text" || f.type === "textarea") : []),
    [col]
  );

  const visible = useMemo(() => {
    if (!records) return [];
    const q = filterText.trim().toLowerCase();
    if (!q || searchFields.length === 0) return records;
    return records.filter((r) =>
      searchFields.some((f) => String(r.data[f.key] ?? "").toLowerCase().includes(q))
    );
  }, [records, filterText, searchFields]);

  if (!col) return <p className="text-sm text-red-600">视图引用了未知数据集</p>;

  async function submitCreate(draft: Draft): Promise<string | null> {
    const res = await fetch(`/api/data/${projectId}/${col!.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return body.message ?? "保存失败";
    }
    setMode("list");
    await load();
    return null;
  }

  async function submitEdit(row: RecordRow, draft: Draft): Promise<string | null> {
    const res = await fetch(`/api/data/${projectId}/${col!.key}/${row.record_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return body.message ?? "更新失败";
    }
    setMode("list");
    await load();
    return null;
  }

  async function removeRow(row: RecordRow) {
    setRemovingId(row.record_id);
    await new Promise((r) => setTimeout(r, 180)); // 等待淡出
    setRecords((prev) => prev?.filter((r) => r.record_id !== row.record_id) ?? prev);
    await fetch(`/api/data/${projectId}/${col!.key}/${row.record_id}`, {
      method: "DELETE",
      headers,
    });
    await load();
  }

  const columns = view.columns?.length
    ? view.columns.map((k) => col.fields.find((f) => f.key === k)!).filter(Boolean)
    : col.fields.slice(0, 5);

  const isEditing = mode !== "list" && mode !== "create";

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold">{view.title ?? col.label}</h3>
        <div className="flex items-center gap-2">
          {searchFields.length > 0 && (
            <input
              className="w-40 rounded-lg border border-line bg-background px-2.5 py-1.5 text-xs placeholder:text-faint focus:border-line-strong focus:outline-none"
              placeholder="搜索…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          )}
          {mode === "list" && (
            <button
              onClick={() => setMode("create")}
              className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent/50"
            >
              + 新增
            </button>
          )}
        </div>
      </header>

      <div className="p-4">
        {mode === "create" && (
          <div className="mb-4 animate-fade-up rounded-lg border border-line bg-background p-4">
            <RecordForm
              collection={col}
              initial={emptyDraft(col)}
              submitLabel="创建"
              onSubmit={submitCreate}
              onCancel={() => setMode("list")}
            />
          </div>
        )}
        {isEditing && (
          <div className="mb-4 animate-fade-up rounded-lg border border-accent/25 bg-background p-4">
            <RecordForm
              collection={col}
              initial={(() => {
                const row = mode as { edit: RecordRow };
                const d: Draft = {};
                for (const f of col.fields) {
                  const v = row.edit.data[f.key];
                  d[f.key] = f.type === "boolean" ? Boolean(v) : v == null ? "" : (v as string | number);
                }
                return d;
              })()}
              submitLabel="保存修改"
              onSubmit={(draft) => submitEdit((mode as { edit: RecordRow }).edit, draft)}
              onCancel={() => setMode("list")}
            />
          </div>
        )}

        {loadError && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-xs text-red-600">
            {loadError}
          </p>
        )}
        {records === null && !loadError && (
          <div className="flex items-center justify-center gap-2 py-10">
            <span className="dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <p className="text-xs text-faint">加载中</p>
          </div>
        )}
        {records !== null && visible.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-muted">{filterText ? "没有匹配的记录" : "暂无记录"}</p>
            <p className="mt-1 text-xs text-faint">
              {filterText ? "换个关键词试试" : "点击右上角「新增」创建第一条"}
            </p>
          </div>
        )}

        {records !== null && visible.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-widest text-faint">
                {columns.map((f) => (
                  <th key={f.key} className="px-2.5 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="px-2.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  key={r.record_id}
                  style={{
                    animationDelay: `${Math.min(i * 30, 300)}ms`,
                  }}
                  className={`animate-row-in border-b border-line/50 transition-colors last:border-0 hover:bg-surface-2/50 ${
                    removingId === r.record_id ? "opacity-20" : ""
                  }`}
                >
                  {columns.map((f) => (
                    <td key={f.key} className="px-2.5 py-2.5 text-muted">
                      {f.type === "select" && r.data[f.key] ? (
                        <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-foreground">
                          {formatValue(f, r.data[f.key])}
                        </span>
                      ) : (
                        formatValue(f, r.data[f.key])
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right">
                    <button
                      onClick={() => setMode({ edit: r })}
                      className="mr-3 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => removeRow(r)}
                      className="text-xs text-red-500 underline-offset-2 hover:text-red-600 hover:underline"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-line px-4 py-2.5 font-mono text-[10px] text-faint">
        {appSpec.app.name} · {visible.length} 条记录
      </p>
    </section>
  );
}

export default function AppRuntime({
  projectId,
  appSpec,
  shareToken,
}: {
  projectId: string;
  appSpec: AppSpec;
  shareToken?: string;
}) {
  const collections = appSpec.collections;
  return (
    <div className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{appSpec.app.name}</h2>
        {appSpec.app.description && (
          <p className="mt-0.5 text-[13px] text-muted">{appSpec.app.description}</p>
        )}
      </div>
      {appSpec.views.map((view, i) => (
        <RecordsView
          key={`${view.type}-${view.collection}-${i}`}
          projectId={projectId}
          appSpec={appSpec}
          view={view}
          collections={collections}
          shareToken={shareToken}
        />
      ))}
    </div>
  );
}
