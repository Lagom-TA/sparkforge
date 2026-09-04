import { z } from "zod";

/**
 * AppSpec — Builder 的输出、Preview Runtime 的输入。
 * 运行时只渲染此 Schema 描述的组件与字段类型（白名单），
 * 禁止任意代码或 HTML 进入 AppSpec。
 */

export const fieldDefSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number", "date", "select", "boolean"]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(80)).max(20).optional(),
  helpText: z.string().max(200).optional(),
});

export const collectionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(80),
  fields: z.array(fieldDefSchema).min(1).max(20),
});

export const viewDefSchema = z.object({
  type: z.enum(["stats", "table", "cards", "board", "form"]),
  collection: z.string(),
  title: z.string().max(80).optional(),
  groupBy: z.string().optional(),
  columns: z.array(z.string()).optional(),
});

export const appSpecSchema = z.object({
  app: z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(300).default(""),
  }),
  collections: z.array(collectionSchema).min(1).max(3),
  views: z.array(viewDefSchema).min(1).max(8),
});

export type FieldDef = z.infer<typeof fieldDefSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type ViewDef = z.infer<typeof viewDefSchema>;
export type AppSpec = z.infer<typeof appSpecSchema>;

/** 校验 AppSpec 自身一致性：视图必须引用已定义的 collection 与字段 */
export function validateAppSpecReferences(spec: AppSpec): string[] {
  const errors: string[] = [];
  const collectionKeys = new Set(spec.collections.map((c) => c.key));
  for (const view of spec.views) {
    if (!collectionKeys.has(view.collection)) {
      errors.push(`视图 "${view.type}" 引用了未定义的 collection "${view.collection}"`);
    }
    for (const col of view.columns ?? []) {
      const c = spec.collections.find((x) => x.key === view.collection);
      if (c && !c.fields.some((f) => f.key === col)) {
        errors.push(`视图列 "${col}" 不是 collection "${view.collection}" 的字段`);
      }
    }
    if (view.groupBy) {
      const c = spec.collections.find((x) => x.key === view.collection);
      if (c && !c.fields.some((f) => f.key === view.groupBy)) {
        errors.push(`分组字段 "${view.groupBy}" 不是 collection "${view.collection}" 的字段`);
      }
    }
  }
  return errors;
}
