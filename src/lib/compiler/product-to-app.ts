import type { ProductSpec } from "@/lib/specs/product-spec";
import { appSpecSchema, validateAppSpecReferences, type AppSpec } from "@/lib/specs/app-spec";

/**
 * 确定性编译器：ProductSpec → AppSpec。
 * 不经过模型，保证已批准的计划与实际构建产物一一对应。
 */

export function compileProductToAppSpec(product: ProductSpec): AppSpec {
  const raw: AppSpec = {
    app: {
      name: product.title.slice(0, 80),
      description: product.summary.slice(0, 300),
    },
    collections: product.entities.map((entity) => ({
      key: entity.key,
      label: entity.label,
      fields: entity.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        ...(f.options ? { options: f.options.map((o) => o.slice(0, 80)) } : {}),
        ...(f.helpText ? { helpText: f.helpText.slice(0, 200) } : {}),
      })),
    })),
    views: product.views.map((v) => ({
      type: v.type,
      collection: v.collection,
      ...(v.title ? { title: v.title } : {}),
      ...(v.type === "board" && v.groupBy ? { groupBy: v.groupBy } : {}),
      ...(v.columns ? { columns: v.columns } : {}),
    })),
  };

  const parsed = appSpecSchema.parse(raw); // 不合法直接抛出，Builder 阶段处理
  const refErrors = validateAppSpecReferences(parsed);
  if (refErrors.length > 0) {
    throw new Error(`APPSPEC_INVALID: ${refErrors.join("; ")}`);
  }
  return parsed;
}
