import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppField,
  AppRecord,
  AppSpec,
  createAppRecord,
  deleteAppRecord,
  getErrorMessage,
  listAppRecords,
  updateAppRecord,
} from '@/lib/sparkforge';
import {
  CheckCircle2,
  CirclePlus,
  Edit3,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Draft = Record<string, string | number | boolean>;

const emptyDraft = (fields: AppField[]): Draft =>
  Object.fromEntries(fields.map((field) => [field.key, field.type === 'boolean' ? false : '']));

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: AppField;
  value: Draft[string];
  onChange: (value: Draft[string]) => void;
}) {
  const common =
    'w-full rounded-md border border-stone-300 bg-[#fffefa] px-3 py-2 text-sm outline-none transition-colors focus:border-stone-500 focus:ring-2 focus:ring-stone-200';
  if (field.type === 'textarea') {
    return <textarea rows={3} className={common} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
  }
  if (field.type === 'select') {
    return (
      <select className={common} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-10 items-center gap-2 rounded-md border border-stone-300 bg-[#fffefa] px-3 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        是
      </label>
    );
  }
  return (
    <input
      className={common}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      step={field.type === 'number' ? 'any' : undefined}
      value={String(value ?? '')}
      onChange={(event) => onChange(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
    />
  );
}

export default function AppPreview({
  spec,
  projectId,
  compact = false,
  readOnly = false,
  confirmDeletion = true,
  errorNotifications = true,
}: {
  spec: AppSpec;
  projectId?: number;
  compact?: boolean;
  readOnly?: boolean;
  confirmDeletion?: boolean;
  errorNotifications?: boolean;
}) {
  const [collectionKey, setCollectionKey] = useState(spec.collections[0]?.key);
  const collection = spec.collections.find((item) => item.key === collectionKey) ?? spec.collections[0];
  const fields = collection?.fields ?? [];
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<number[]>([]);
  const savingRef = useRef(false);
  const deletingRef = useRef(new Set<number>());
  const requestRef = useRef(0);
  const scopeRef = useRef('');
  scopeRef.current = `${projectId}:${collection?.key}`;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('全部');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AppRecord>();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(fields));
  const filterField = fields.find((field) => field.type === 'select' || field.type === 'boolean');

  const load = useCallback(async () => {
    if (!projectId || !collection?.key) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await listAppRecords(projectId, collection.key);
      if (request === requestRef.current) setRecords(result);
    } catch (error) {
      if (request === requestRef.current) setLoadError(`记录加载失败：${getErrorMessage(error)}`);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [collection?.key, projectId]);

  useEffect(() => {
    setRecords([]);
    setQuery('');
    setFilter('全部');
    setFormOpen(false);
    setDraft(emptyDraft(fields));
    void load();
    return () => { requestRef.current += 1; };
  }, [fields, load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesQuery = !normalized || Object.values(record.data).some((value) =>
        String(value ?? '').toLowerCase().includes(normalized),
      );
      const rawFilterValue = filterField ? record.data[filterField.key] : undefined;
      const matchesFilter =
        filter === '全部' ||
        (filterField?.type === 'boolean'
          ? String(Boolean(rawFilterValue)) === filter
          : String(rawFilterValue ?? '') === filter);
      return matchesQuery && matchesFilter;
    });
  }, [filter, filterField, query, records]);

  const openCreate = () => {
    setFormError('');
    setEditing(undefined);
    setDraft(emptyDraft(fields));
    setFormOpen(true);
  };

  const openEdit = (record: AppRecord) => {
    setFormError('');
    setEditing(record);
    setDraft(Object.fromEntries(fields.map((field) => [field.key, record.data[field.key] ?? (field.type === 'boolean' ? false : '')])) as Draft);
    setFormOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!projectId || !collection || readOnly) {
      toast.info('只读分享预览不支持写入。');
      return;
    }
    const missing = fields.find((field) => field.required && String(draft[field.key] ?? '').trim() === '');
    if (missing) {
      setFormError(`请填写${missing.label}。`);
      return;
    }
    const scope = scopeRef.current;
    savingRef.current = true;
    setFormError('');
    setSaving(true);
    requestRef.current += 1;
    setLoading(false);
    try {
      if (editing) {
        const updated = await updateAppRecord(editing.id, draft);
        if (scope !== scopeRef.current) return;
        setRecords((current) => current.map((item) => item.id === updated.id ? updated : item));
        toast.success('记录已更新并保存。');
      } else {
        const created = await createAppRecord(projectId, collection.key, draft);
        if (scope !== scopeRef.current) return;
        setRecords((current) => [created, ...current]);
        toast.success('记录已创建并保存。');
      }
      setFormOpen(false);
    } catch (error) {
      if (scope === scopeRef.current) setFormError(`保存失败：${getErrorMessage(error)}。输入已保留，请重试。`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const remove = async (record: AppRecord) => {
    if (!projectId || readOnly) return;
    if (confirmDeletion && !window.confirm('确定删除这条记录吗？此操作无法撤销。')) return;
    if (deletingRef.current.has(record.id)) return;
    const scope = scopeRef.current;
    deletingRef.current.add(record.id);
    setDeleting([...deletingRef.current]);
    requestRef.current += 1;
    setLoading(false);
    try {
      await deleteAppRecord(record.id);
      if (scope !== scopeRef.current) return;
      setRecords((current) => current.filter((item) => item.id !== record.id));
      toast.success('记录已删除。');
    } catch (error) {
      if (scope === scopeRef.current) setLoadError(`删除失败，记录已保留：${getErrorMessage(error)}`);
    } finally {
      deletingRef.current.delete(record.id);
      setDeleting([...deletingRef.current]);
    }
  };

  const filterOptions = filterField?.type === 'select'
    ? filterField.options ?? []
    : filterField?.type === 'boolean'
      ? ['true', 'false']
      : [];

  return (
    <div className={`relative overflow-hidden rounded-xl border border-stone-200 bg-[#f7f5ef] text-[#292621] shadow-sm ${compact ? 'min-h-[520px]' : 'min-h-[620px]'}`}>
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#fffefa] px-4 py-2">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#292621] text-xs text-[#fffefa]">S</span>
          {spec.app.name}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-stone-500" />
            <input
              aria-label="搜索记录"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-28 bg-transparent text-sm outline-none placeholder:text-stone-400"
              placeholder="搜索记录"
            />
          </div>
          <button type="button" disabled={loading || saving || deleting.length > 0 || !projectId} onClick={() => void load()} className="rounded-md border border-stone-200 p-2 text-stone-600 hover:bg-stone-100" aria-label="刷新记录">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className={compact ? 'block' : 'grid lg:grid-cols-[140px_1fr]'}>
        {!compact && (
          <aside className="border-r border-stone-200 bg-[#efede6] p-3">
            {spec.collections.map((item) => (
              <button type="button" key={item.key} disabled={saving} onClick={() => setCollectionKey(item.key)} aria-current={item.key === collection?.key ? 'page' : undefined} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${item.key === collection?.key ? 'bg-[#fffefa] font-medium' : 'text-stone-600 hover:bg-stone-200'}`}>
                <LayoutDashboard className="h-4 w-4 shrink-0" />{item.label}
              </button>
            ))}
          </aside>
        )}

        <main className="min-w-0 p-4 sm:p-5">
          {compact && spec.collections.length > 1 && <select aria-label="选择集合" value={collection?.key} disabled={saving} onChange={(event) => setCollectionKey(event.target.value)} className="mb-4 w-full rounded-md border bg-background p-2 text-base">{spec.collections.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}
          {projectId && readOnly && <p className="mb-4 text-sm text-stone-600">正在查看历史版本。记录来自当前项目，请回到活动版本编辑。</p>}
          {!projectId && <p className="mb-4 text-sm text-stone-600">只读应用结构预览，业务记录不公开。</p>}
          {loadError && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}<Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>重新加载</Button></div>}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{collection?.label ?? '记录'}</h2>
              <p className="mt-1 max-w-xl text-sm text-stone-500">{spec.app.description}</p>
            </div>
            <Button type="button" size="sm" onClick={openCreate} disabled={!projectId || readOnly || saving || loading || !!loadError}>
              <CirclePlus className="mr-2 h-4 w-4" />{spec.primaryAction || '新建记录'}
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-[#fffefa] p-4">
              <p className="text-xs text-stone-500">全部记录</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{records.length}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-[#fffefa] p-4">
              <p className="text-xs text-stone-500">当前结果</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{filtered.length}</p>
            </div>
          </div>

          {filterField && (
            <div className="mt-4 flex flex-wrap gap-2">
              {['全部', ...filterOptions].map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${filter === option ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-200 bg-[#fffefa] text-stone-600 hover:bg-stone-100'}`}
                >
                  {option === 'true' ? `${filterField?.label}：是` : option === 'false' ? `${filterField?.label}：否` : option}
                </button>
              ))}
            </div>
          )}

          <section className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-[#fffefa]">
            {loading ? (
              <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />正在恢复已保存记录…
              </div>
            ) : loadError && records.length === 0 ? <p className="p-6 text-sm text-stone-600">暂时无法显示记录，请重新加载。</p> : filtered.length === 0 ? (
              <div className="grid min-h-44 place-items-center p-6 text-center">
                <div>
                  <CheckCircle2 className="mx-auto h-6 w-6 text-stone-400" />
                  <p className="mt-3 text-sm font-medium">{query || filter !== '全部' ? '没有符合条件的记录' : projectId ? '还没有记录' : '应用结构已就绪'}</p>
                  <p className="mt-1 text-xs text-stone-500">{query || filter !== '全部' ? '试试其他关键词，或清除筛选条件。' : projectId ? '创建第一条记录，数据会保存到当前项目。' : '此链接仅展示应用结构，不包含项目业务数据。'}</p>
                  {(query || filter !== '全部') && <Button type="button" variant="ghost" onClick={() => { setQuery(''); setFilter('全部'); }}>清除筛选</Button>}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filtered.map((record) => (
                  <article key={record.id} className="group flex items-start justify-between gap-3 p-4 transition-colors hover:bg-stone-50">
                    <div className="grid min-w-0 flex-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                      {fields.map((field) => (
                        <div key={field.key} className="min-w-0">
                          <p className="text-[11px] text-stone-400">{field.label}</p>
                          <p className="mt-0.5 truncate text-sm">
                            {field.type === 'boolean'
                              ? record.data[field.key] ? '是' : '否'
                              : String(record.data[field.key] ?? '—')}
                          </p>
                        </div>
                      ))}
                    </div>
                    {projectId && !readOnly && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" disabled={deleting.includes(record.id) || saving} onClick={() => openEdit(record)} className="rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800" aria-label="编辑记录">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" disabled={deleting.includes(record.id) || saving} onClick={() => void remove(record)} className="rounded-md p-2 text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label="删除记录">
                          {deleting.includes(record.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => { if (!savingRef.current) setFormOpen(open); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto bg-[#fffefa] sm:max-w-md">
          <form onSubmit={save} className="min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="font-semibold">{editing ? '编辑记录' : spec.primaryAction || '新建记录'}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-stone-600">保存后刷新页面仍会保留。</DialogDescription>
              </div>

            </div>
            <fieldset disabled={saving} className="mt-6 space-y-4">
              {fields.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-sm font-medium">{field.label}{field.required ? ' *' : ''}</span>
                  <FieldControl field={field} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />
                </label>
              ))}
            </fieldset>
            {formError && <p role="alert" className="mt-4 text-sm text-red-700">{formError}</p>}
            <div className="mt-6 flex justify-end gap-2 border-t border-stone-200 pt-4">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>取消</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? '保存修改' : '创建记录'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}