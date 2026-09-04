import type { AppSpec, Collection } from "@/lib/specs/app-spec";

/**
 * 确定性源码生成器：AppSpec → React/TypeScript 源文件包。
 * 与 Preview Runtime 同源同语义；产物用于 Code 页签展示与（后续）代码导出。
 */

function pascal(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
}

function tsType(type: string): string {
  return type === "number" || type === "boolean" ? type : "string";
}

function recordType(collection: Collection): string {
  const fields = collection.fields
    .map((f) => `  ${f.key}: ${tsType(f.type)} | null;`)
    .join("\n");
  return `export interface ${pascal(collection.key)}Record {
${fields}
  recordId: string;
  createdAt: string;
}`;
}

/** 生成单个字段的受控输入 JSX（与 Preview Runtime 的 FieldInput 语义一致） */
function fieldInputCode(f: Collection["fields"][number]): string {
  const set = (v: string) => `setDraft((d) => ({ ...d, [f.key]: ${v} }))`;
  switch (f.type) {
    case "textarea":
      return `<textarea rows={3} value={String(draft[f.key] ?? "")} onChange={(e) => ${set("e.target.value")}} />`;
    case "select":
      return [
        `<select value={String(draft[f.key] ?? "")} onChange={(e) => ${set("e.target.value")}}>`,
        `            <option value="">请选择…</option>`,
        `            {(f.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}`,
        `          </select>`,
      ].join("\n");
    case "boolean":
      return `<input type="checkbox" checked={Boolean(draft[f.key])} onChange={(e) => ${set("e.target.checked")}} />`;
    case "number":
      return `<input type="number" value={String(draft[f.key] ?? "")} onChange={(e) => ${set("Number(e.target.value)")}} />`;
    case "date":
      return `<input type="date" value={String(draft[f.key] ?? "")} onChange={(e) => ${set("e.target.value")}} />`;
    default:
      return `<input type="text" value={String(draft[f.key] ?? "")} onChange={(e) => ${set("e.target.value")}} />`;
  }
}

function collectionComponent(collection: Collection): string {
  const fieldsLiteral = JSON.stringify(collection.fields, null, 2);
  const inputs = collection.fields
    .map(
      (f) => `        <label key={f.key} className="block">
          {f.label}{f.required ? " *" : ""}
          ${fieldInputCode(f)}
        </label>`
    )
    .join("\n");

  return `import { useEffect, useState } from "react";

const FIELDS = ${fieldsLiteral} as const;

interface RecordRow {
  record_id: string;
  data: Record<string, string | number | boolean | null>;
}

export default function ${pascal(collection.key)}List({ projectId }: { projectId: string }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(\`/api/data/\${projectId}/${collection.key}\`, { cache: "no-store" });
      if (!res.ok) throw new Error(\`加载失败（\${res.status}）\`);
      const body = await res.json();
      setRecords(body.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(draft: Record<string, string | boolean>) {
    const res = await fetch(\`/api/data/\${projectId}/${collection.key}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? "保存失败");
      return;
    }
    await load();
  }

  async function remove(recordId: string) {
    await fetch(\`/api/data/\${projectId}/${collection.key}/\${recordId}\`, { method: "DELETE" });
    await load();
  }

  return (
    <section>
      <h2>${collection.label}</h2>
      {error && <p role="alert">{error}</p>}
      {records.length === 0 && <p>暂无${collection.label}，创建第一条吧。</p>}
      <ul>
        {records.map((r) => (
          <li key={r.record_id}>
            {FIELDS.map((f) => (
              <span key={f.key}>
                {f.label}: {String(r.data[f.key] ?? "—")}
              </span>
            ))}
            <button onClick={() => remove(r.record_id)}>删除</button>
          </li>
        ))}
      </ul>
      <CreateForm onCreate={create} />
    </section>
  );
}

function CreateForm({ onCreate }: { onCreate: (data: Record<string, string | boolean>) => void }) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(draft);
      }}
    >
${inputs}
      <button type="submit">新增${collection.label}</button>
    </form>
  );
}
`;
}

export function generateSourceBundle(appSpec: AppSpec): Record<string, string> {
  const files: Record<string, string> = {};

  files["types.ts"] = appSpec.collections.map(recordType).join("\n\n");

  for (const collection of appSpec.collections) {
    files[`${collection.key}/List.tsx`] = collectionComponent(collection);
  }

  const imports = appSpec.collections
    .map((c) => `import ${pascal(c.key)}List from "./${c.key}/List";`)
    .join("\n");
  const lists = appSpec.collections
    .map((c) => `      <${pascal(c.key)}List projectId={projectId} />`)
    .join("\n");

  files["App.tsx"] = `${imports}

export default function App({ projectId }: { projectId: string }) {
  return (
    <main>
      <h1>${appSpec.app.name}</h1>
      <p>${appSpec.app.description}</p>
${lists}
    </main>
  );
}
`;

  files["README.md"] = `# ${appSpec.app.name}

${appSpec.app.description}

由 SparkForge 生成。数据通过平台 Runtime Data API 持久化；
表单与列表语义与工作台 Preview Runtime 完全一致。
`;

  return files;
}
