import { productSpecSchema, type ProductSpec } from "@/lib/specs/product-spec";
import { chatComplete, extractJson } from "@/lib/llm/provider";
import { PLANNER_SYSTEM_PROMPT } from "@/lib/agents/planner";
import type { CheckResult } from "@/lib/agents/verifier";

/**
 * Repairer：验收失败后生成受约束的修复。
 * 输出仍是完整 ProductSpec（而非任意代码补丁），只允许针对失败项修改。
 */

export async function runRepairer(
  spec: ProductSpec,
  failures: CheckResult[]
): Promise<ProductSpec> {
  const messages = [
    { role: "system" as const, content: PLANNER_SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `当前应用的 ProductSpec 是：
${JSON.stringify(spec)}

自动验收发现以下失败项：
${failures.map((f, i) => `${i + 1}. ${f.description} — 证据：${f.evidence}`).join("\n")}

请输出修复后的**完整** ProductSpec（JSON，不要解释文字）。要求：
- 只针对失败项做最小修改；未失败的实体、字段、视图保持原样。
- 不得删除或改名既有字段 key。
- 常见修复方式：字段类型调整（如 required 的 select 缺 options）、补充缺失的视图（table/form）、修正视图的 groupBy/columns 引用、调整验收标准措辞使其与实际能力一致。`,
    },
  ];

  const raw = await chatComplete(messages, { forceJson: true, temperature: 0.1 });
  const parsed = productSpecSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new Error(
      `REPAIR_SCHEMA_INVALID: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}
