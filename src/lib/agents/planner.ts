import { productSpecSchema, type ProductSpec } from "@/lib/specs/product-spec";
import { chatComplete, extractJson, isLlmConfigured, LlmError, type LlmMessage } from "@/lib/llm/provider";

/**
 * Planner Agent：把自然语言需求转换为严格符合 Schema 的 ProductSpec。
 * Planner 不写代码，只消除歧义并限定范围。
 * 失败路径：Schema 不合法时自动要求模型修复一次（方案 §11.5）。
 */

export const PLANNER_SYSTEM_PROMPT = `你是 SparkForge 平台的 Planner 智能体。你的任务是把用户的自然语言需求转换为一个结构化的 ProductSpec（JSON）。

## 平台能力边界（必须遵守）
- 平台只支持"记录型微应用"：围绕 1-2 个实体做新建、查看、编辑、删除、搜索、筛选、状态切换和简单统计。
- 字段类型仅限：text、textarea、number、date、select、boolean。select 必须给出 options（2-8 个）。
- 视图类型仅限：table（列表）、form（表单）、stats（统计）、cards（卡片）、board（按 select 字段分组的看板）。
- 不支持：文件上传、图表库、地图、日历组件、多表关联、用户系统、支付、外部 API 集成。
- 超出边界的内容放进 outOfScope，不要硬造。

## 输出要求
- 只输出一个 JSON 对象，不要任何解释文字或 markdown 代码块。
- JSON 必须符合如下结构：
{
  "title": "应用名称（简短）",
  "summary": "一句话说明应用做什么",
  "targetUser": "目标用户",
  "entities": [{ "key": "snake_case", "label": "中文名", "description": "可选", "fields": [{ "key": "camelCase", "label": "中文标签", "type": "text|textarea|number|date|select|boolean", "required": true, "options": ["select 类型必填"], "helpText": "可选" }] }],
  "views": [{ "type": "table|form|stats|cards|board", "collection": "实体key", "title": "可选", "groupBy": "board 类型必填，须是 select 字段", "columns": ["可选，指定列表列"] }],
  "actions": [{ "key": "camelCase", "label": "中文", "type": "create|edit|delete|filter|search|toggleStatus", "collection": "实体key" }],
  "acceptanceCriteria": [{ "id": "ac1", "description": "可验证的一句话", "critical": true }],
  "outOfScope": ["本次明确不做的内容"],
  "assumptions": ["你做出的合理假设"]
}
- 验收标准 3-8 条，必须包含：能新建记录、数据刷新后仍存在、至少一条核心业务操作。
- 所有面向用户的文本用中文。`;

export class PlannerError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function runPlanner(
  userPrompt: string,
  currentSpec?: ProductSpec | null
): Promise<ProductSpec> {
  if (!isLlmConfigured()) {
    throw new PlannerError("LLM_NOT_CONFIGURED");
  }

  const messages: LlmMessage[] = [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    ...(currentSpec
      ? [
          {
            role: "user" as const,
            content: `这是应用当前的 ProductSpec（JSON）：\n${JSON.stringify(currentSpec)}\n\n用户会提出修改要求。请输出应用修改后的**完整** ProductSpec：只做用户要求的改动，保留其余内容与既有字段 key 不变（旧字段不要删除或改名，避免破坏已有数据）。`,
          },
        ]
      : []),
    { role: "user", content: userPrompt.slice(0, 4000) },
  ];

  const parse = async (raw: string): Promise<ProductSpec> => {
    const parsed = productSpecSchema.safeParse(extractJson(raw));
    if (!parsed.success) {
      throw new PlannerError(
        `SCHEMA_INVALID: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      );
    }
    return parsed.data;
  };

  let spec: ProductSpec;
  try {
    spec = await parse(await chatComplete(messages, { forceJson: true, temperature: 0.2 }));
  } catch (err) {
    // 一次自修复：把校验错误回传给模型
    if (err instanceof LlmError || (err instanceof PlannerError && err.message.startsWith("SCHEMA_INVALID"))) {
      const reason = err instanceof PlannerError ? err.message : `BAD_RESPONSE: ${err.message}`;
      messages.push({
        role: "user",
        content: `你上次的输出未通过校验：${reason}。请重新只输出一个符合要求的完整 JSON。`,
      });
      spec = await parse(await chatComplete(messages, { forceJson: true, temperature: 0.1 }));
    } else {
      throw err;
    }
  }
  return spec;
}
