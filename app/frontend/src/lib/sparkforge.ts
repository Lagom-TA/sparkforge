import { client } from '@/lib/api';

export type AuthState = 'loading' | 'authenticated' | 'anonymous';
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'boolean';

export interface Project {
  id: number;
  name: string;
  initial_prompt: string;
  status: string;
  active_version_id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductSpec {
  title: string;
  summary: string;
  audience: string;
  features: Array<{ name: string; description: string; priority: string }>;
  pages: Array<{ name: string; purpose: string }>;
  entities: Array<{ name: string; fields: string[] }>;
  acceptance: string[];
  outOfScope: string[];
}

export interface AppField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

export interface CrudSpec {
  runtime: 'crud';
  app: { name: string; description: string };
  navigation: string[];
  dashboard: Array<{ label: string; metric: 'count' | 'completed' | 'pending' }>;
  collections: Array<{ key: string; label: string; fields: AppField[] }>;
  views: Array<{ type: 'table' | 'cards'; collection: string; title: string; columns?: string[] }>;
  primaryAction: string;
}

export interface HtmlSpec {
  runtime: 'html';
  app: { name: string; description: string };
  requirements: string[];
}
export type AppSpec = CrudSpec | HtmlSpec;

export interface SourceBundle {
  files: Record<string, string>;
}

export interface PublicLogEntry {
  at: string;
  stage: string;
  actor?: 'Planner' | 'Builder' | 'Verifier' | 'System';
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  artifact?: string;
}

export interface Generation {
  id: number;
  project_id: number;
  request_text: string;
  status: string;
  current_stage: string;
  product_spec?: ProductSpec;
  public_log: PublicLogEntry[];
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Version {
  id: number;
  project_id: number;
  version_number: number;
  product_spec: ProductSpec;
  app_spec: AppSpec;
  source_bundle: SourceBundle;
  change_summary: string;
  created_at?: string;
}

export interface ShareLink {
  id: number;
  project_id: number;
  token: string;
  permission: 'view';
  is_active: boolean;
}

export interface AppRecord {
  id: number;
  project_id: number;
  collection_key: string;
  record_key: string;
  data: Record<string, unknown>;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;
}

const data = <T,>(response: any): T => response.data as T;
const items = <T,>(response: any): T[] => (response.data?.items ?? []) as T[];

export const getErrorMessage = (error: unknown): string => {
  const value = error as { data?: { detail?: unknown }; response?: { data?: { detail?: unknown } }; message?: unknown } | null;
  const detail = value?.data?.detail ?? value?.response?.data?.detail ?? value?.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => typeof item?.msg === 'string' ? item.msg : '输入格式不正确').join('；');
  return '操作未完成，请稍后重试。';
};

export async function getCurrentUser() {
  return data<any>(await client.auth.me());
}

export async function listProjects() {
  return items<Project>(await client.entities.projects.query({ sort: '-updated_at', limit: 100 }));
}

export async function getProject(id: number) {
  return data<Project>(await client.entities.projects.get({ id: String(id) }));
}

export async function createProject(name: string, prompt: string) {
  return data<Project>(
    await client.entities.projects.create({
      data: { name, initial_prompt: prompt, status: 'intake' },
    }),
  );
}

export async function updateProject(id: number, patch: Partial<Project>) {
  return data<Project>(
    await client.entities.projects.update({ id: String(id), data: patch }),
  );
}

export async function listGenerations(projectId: number) {
  return items<Generation>(
    await client.entities.generations.query({
      query: { project_id: projectId },
      sort: '-created_at',
      limit: 20,
    }),
  );
}

export async function listVersions(projectId: number) {
  return items<Version>(
    await client.entities.versions.query({
      query: { project_id: projectId },
      sort: '-version_number',
      limit: 50,
    }),
  );
}

export async function listAppRecords(projectId: number, collectionKey: string) {
  const records: AppRecord[] = [];
  let before: number | undefined;
  for (;;) {
    const page = items<AppRecord>(await client.entities.app_records.query({
      query: {project_id: projectId, collection_key: collectionKey, is_deleted: false, ...(before === undefined ? {} : {id: {$lt: before}})},
      sort: '-id', limit: 500,
    }));
    records.push(...page);
    if (page.length < 500) return records.filter(record => !record.is_deleted);
    const cursor = page.at(-1)!.id;
    if (records.length >= 10000 || (before !== undefined && cursor >= before)) throw new Error('记录超出当前预览容量或分页异常，无法显示完整统计。');
    before = cursor;
  }
}

export async function createAppRecord(
  projectId: number,
  collectionKey: string,
  recordData: Record<string, unknown>,
) {
  return data<AppRecord>(
    await client.entities.app_records.create({
      data: {
        project_id: projectId,
        collection_key: collectionKey,
        record_key: crypto.randomUUID(),
        data: recordData,
        is_deleted: false,
      },
    }),
  );
}

export async function updateAppRecord(id: number, recordData: Record<string, unknown>) {
  return data<AppRecord>(
    await client.entities.app_records.update({
      id: String(id),
      data: { data: recordData },
    }),
  );
}

export async function deleteAppRecord(id: number) {
  return data<AppRecord>(
    await client.entities.app_records.update({
      id: String(id),
      data: { is_deleted: true },
    }),
  );
}

export async function listShareLinks(projectId: number) {
  return items<ShareLink>(
    await client.entities.share_links.query({
      query: { project_id: projectId },
      sort: '-created_at',
      limit: 20,
    }),
  );
}

export async function createShareLink(projectId: number) {
  const token = `${crypto.randomUUID().replace(/-/g, '')}${Date.now().toString(36)}`;
  return data<ShareLink>(
    await client.entities.share_links.create({
      data: { project_id: projectId, token, permission: 'view', is_active: true },
    }),
  );
}

export async function revokeShareLink(id: number) {
  return data<ShareLink>(
    await client.entities.share_links.update({ id: String(id), data: { is_active: false } }),
  );
}

export interface PublicShareSnapshot {
  project: Pick<Project, 'id' | 'name' | 'status'>;
  version: Pick<Version, 'id' | 'version_number' | 'app_spec' | 'source_bundle' | 'change_summary' | 'created_at'>;
}

export async function getPublicShare(projectId: number, token: string) {
  const response = await client.apiCall.invoke({
    url: `/api/v1/public-share/${projectId}/${encodeURIComponent(token)}`,
    method: 'GET',
    data: {},
  });
  return response.data as PublicShareSnapshot;
}

export { client };