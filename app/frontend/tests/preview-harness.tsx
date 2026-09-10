// Isolated UI regression fixture. All records below are test data.
import React from 'react';
import { createRoot } from 'react-dom/client';
import AppPreview from '../src/components/AppPreview';
import { client } from '../src/lib/api';
import '../src/index.css';

const api = client.entities.app_records;
let records = [1, 2].map((id) => ({ id, project_id: 1, collection_key: 'tasks', record_key: String(id), data: { title: `测试记录 ${id}`, amount: id }, is_deleted: false }));
let failLoad = false;
let failDelete = false;
Object.assign(window, { fixture: {
  failLoad: (value: boolean) => { failLoad = value; },
  failDelete: (value: boolean) => { failDelete = value; },
  records: () => records,
} });
api.query = async ({ query }: any) => {
  if (failLoad) throw new Error('测试网络故障');
  return { data: { items: records.filter((item) => item.collection_key === query.collection_key && !item.is_deleted) } } as any;
};
api.create = async ({ data }: any) => {
  const record = { ...data, id: records.length + 1 };
  records.push(record);
  return { data: record } as any;
};
api.update = async ({ id, data }: any) => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (data.is_deleted && failDelete) throw new Error('测试删除失败');
  records = records.map((item) => item.id === Number(id) ? { ...item, ...data } : item);
  return { data: records.find((item) => item.id === Number(id)) } as any;
};
const spec = {
  runtime: 'crud' as const,
  app: { name: '项目记录 · 回归测试', description: '验证记录加载、集合切换和编辑反馈。此处使用隔离测试数据。' },
  collections: ['tasks', 'notes'].map((key, index) => ({ key, label: index ? '备忘' : '任务', fields: [
    { key: 'title', label: '标题', type: 'text' as const, required: true },
    { key: 'amount', label: '数量', type: 'number' as const, required: true },
  ] })),
  navigation: ['任务', '备忘'], dashboard: [], views: ['tasks', 'notes'].map(collection => ({type: 'cards' as const, collection, title: collection})), primaryAction: '新建记录',
};
if (new URLSearchParams(location.search).has('table')) {
  Object.assign(spec, {views: [{type: 'table', collection: 'tasks', title: '指定表格', columns: ['title']}], navigation: ['列表页'], dashboard: [{label: '总条数', metric: 'count'}]});
}
createRoot(document.getElementById('fixture')!).render(<div className="mx-auto max-w-5xl p-4"><AppPreview spec={spec} sourceBundle={{files: {}}} projectId={1} confirmDeletion={false} /></div>);
