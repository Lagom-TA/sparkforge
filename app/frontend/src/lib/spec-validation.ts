import { z } from 'zod';
import type { AppSpec, ProductSpec, SourceBundle } from './sparkforge';

const text = z.string().trim().min(1).max(8000);
const key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const unique = (values: string[]) => new Set(values).size === values.length;
const productSchema = z.object({
  title: text, summary: text, audience: text,
  features: z.array(z.object({ name: text, description: text, priority: z.enum(['P0', 'P1']) }).strict()).min(3).max(30),
  pages: z.array(z.object({ name: text, purpose: text }).strict()).min(1).max(30),
  entities: z.array(z.object({ name: text, fields: z.array(text).min(1).max(30) }).strict()).max(30),
  acceptance: z.array(text).min(3).max(30), outOfScope: z.array(text).min(1).max(30),
}).strict();
const fieldSchema = z.object({
  key, label: text, type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'boolean']),
  required: z.boolean().optional(), options: z.array(text).max(30).optional(),
}).strict().refine(field => field.type === 'select' ? !!field.options?.length && unique(field.options) : field.options === undefined, '字段选项无效');
const identity = z.object({ name: text, description: text }).strict();
const crudSchema = z.object({
  runtime: z.literal('crud'), app: identity,
  navigation: z.array(text).min(1).max(30),
  dashboard: z.array(z.object({ label: text, metric: z.enum(['count', 'completed', 'pending']) }).strict()).max(30),
  collections: z.array(z.object({ key, label: text, fields: z.array(fieldSchema).min(2).max(6).refine(fields => unique(fields.map(field => field.key)), '字段键不能重复') }).strict()).min(1).max(8),
  views: z.array(z.object({ type: z.enum(['table', 'cards']), collection: key, title: text, columns: z.array(key).max(30).optional() }).strict()).min(1).max(30),
  primaryAction: text,
}).strict().superRefine((app, ctx) => {
  if (!unique(app.collections.map(collection => collection.key))) ctx.addIssue({ code: 'custom', path: ['collections'], message: '集合键不能重复' });
  if (app.navigation.length !== app.views.length) ctx.addIssue({code: 'custom', path: ['navigation'], message: '导航与视图必须一一对应'});
  app.views.forEach((view, index) => {
    const collection = app.collections.find(item => item.key === view.collection);
    if (!collection || (view.columns && (!unique(view.columns) || view.columns.some(column => !collection.fields.some(field => field.key === column))))) {
      ctx.addIssue({ code: 'custom', path: ['views', index], message: '视图引用无效或重复的集合字段' });
    }
  });
});
const htmlSchema = z.object({runtime: z.literal('html'), app: identity, requirements: z.array(text).min(1).max(30)}).strict();

export function validatePlan(raw: unknown): ProductSpec {
  const result = productSchema.safeParse(raw);
  if (!result.success) throw new Error(`蓝图格式不正确：${result.error.issues[0].path.join('.')} ${result.error.issues[0].message}`);
  return result.data as ProductSpec;
}

export function validateBuild(raw: unknown): { appSpec: AppSpec; sourceBundle: SourceBundle } {
  const result = z.object({ appSpec: z.union([crudSchema, htmlSchema]), files: z.record(z.string().min(1).max(180000)) }).strict().safeParse(raw);
  if (!result.success) throw new Error(`生成结果无法预览：${result.error.issues[0].path.join('.')} ${result.error.issues[0].message}`);
  const {appSpec, files} = result.data;
  const allowed = appSpec.runtime === 'html' ? ['index.html'] : ['src/App.tsx', 'src/index.css'];
  if (!files[allowed[0]]?.trim() || Object.keys(files).some(path => !allowed.includes(path))) throw new Error('源码文件不符合运行时契约');
  return {appSpec, sourceBundle: {files}};
}
