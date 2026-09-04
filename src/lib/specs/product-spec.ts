import { z } from "zod";

/**
 * ProductSpec — Planner Agent 的结构化输出。
 * Planner 只负责消除歧义与限定范围，不写代码。
 * Builder 消费已批准的 ProductSpec 生成 AppSpec。
 */

export const entityFieldSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "字段 key 必须是合法标识符"),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number", "date", "select", "boolean"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  helpText: z.string().optional(),
});

export const entitySpecSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(entityFieldSchema).min(1).max(20),
});

export const viewSpecSchema = z.object({
  type: z.enum(["stats", "table", "cards", "board", "form"]),
  collection: z.string().min(1),
  title: z.string().optional(),
  groupBy: z.string().optional(),
  columns: z.array(z.string()).optional(),
});

export const actionSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["create", "edit", "delete", "filter", "search", "toggleStatus"]),
  collection: z.string().min(1),
});

export const acceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  critical: z.boolean().default(true),
});

export const productSpecSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  targetUser: z.string().min(1),
  entities: z.array(entitySpecSchema).min(1).max(3),
  views: z.array(viewSpecSchema).min(1).max(6),
  actions: z.array(actionSpecSchema).min(1),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1).max(12),
  outOfScope: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

export type EntityField = z.infer<typeof entityFieldSchema>;
export type EntitySpec = z.infer<typeof entitySpecSchema>;
export type ViewSpec = z.infer<typeof viewSpecSchema>;
export type ActionSpec = z.infer<typeof actionSpecSchema>;
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
export type ProductSpec = z.infer<typeof productSpecSchema>;
