import { z } from 'zod';
import type { AppSpec, ProductSpec, SourceBundle } from './sparkforge';

const text = z.string().trim().min(1);
const key = text.regex(/^[a-z][a-z0-9_]*$/);
const unique = (values: string[]) => new Set(values).size === values.length;
const productSchema = z.object({
  title: text, summary: text, audience: text,
  features: z.array(z.object({ name: text, description: text, priority: z.enum(['P0', 'P1']) })).min(3),
  pages: z.array(z.object({ name: text, purpose: text })).min(2),
  entities: z.array(z.object({ name: text, fields: z.array(text).min(1) })).min(1),
  acceptance: z.array(text).min(3), outOfScope: z.array(text).min(1),
});
const fieldSchema = z.object({
  key, label: text, type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'boolean']),
  required: z.boolean().optional(), options: z.array(text).optional(),
}).refine((field) => field.type !== 'select' || (!!field.options?.length && unique(field.options)), '下拉字段需要不重复的选项');
const appSchema = z.object({
  app: z.object({ name: text, description: text }),
  navigation: z.array(text),
  dashboard: z.array(z.object({ label: text, value: z.string().optional(), metric: z.enum(['count', 'completed', 'pending']).optional(), trend: z.string().optional() })),
  collections: z.array(z.object({ key, label: text, fields: z.array(fieldSchema).min(2).max(6).refine((fields) => unique(fields.map((field) => field.key)), '字段键不能重复') })).min(1),
  views: z.array(z.object({ type: z.enum(['table', 'cards']), collection: key, title: text, columns: z.array(key).optional() })).min(1),
  primaryAction: text,
}).superRefine((app, ctx) => {
  if (!unique(app.collections.map((collection) => collection.key))) ctx.addIssue({ code: 'custom', message: '集合键不能重复' });
  for (const view of app.views) {
    const collection = app.collections.find((item) => item.key === view.collection);
    if (!collection || view.columns?.some((column) => !collection.fields.some((field) => field.key === column))) {
      ctx.addIssue({ code: 'custom', message: '视图引用了不存在的集合或字段' });
    }
  }
});

export function validatePlan(raw: unknown): ProductSpec {
  const result = productSchema.safeParse(raw);
  if (!result.success) throw new Error(`蓝图格式不正确：${result.error.issues[0].path.join('.')} ${result.error.issues[0].message}`);
  return result.data as ProductSpec;
}

export function validateBuild(raw: unknown): { appSpec: AppSpec; sourceBundle: SourceBundle } {
  const result = z.object({ appSpec: appSchema, files: z.record(text).refine((files) => !!files['src/App.tsx'], '缺少 src/App.tsx') }).safeParse(raw);
  if (!result.success) throw new Error(`生成结果无法预览：${result.error.issues[0].path.join('.')} ${result.error.issues[0].message}`);
  return { appSpec: result.data.appSpec as AppSpec, sourceBundle: { files: result.data.files } };
}
