"""Deterministic standalone React export of a validated AppSpec."""
import json
import hashlib
from services.generation_contracts import app_spec

TEMPLATE = r'''import { useState } from 'react';
import './index.css';
type Field = {key:string;label:string;type:string;required?:boolean;options?:string[]};
type Row = {id:string;values:Record<string,string|number|boolean>};
type Spec = {runtime:'crud';app:{name:string;description:string};collections:{key:string;label:string;fields:Field[]}[];views:{type:'table'|'cards';collection:string;title:string;columns?:string[]}[];navigation:string[];dashboard:{label:string;metric:'count'|'completed'|'pending'}[];primaryAction:string};
const spec:Spec = __SPEC__;
const storageKey = 'sparkforge-export:__KEY__';
export default function App() {
  const [viewIndex,setViewIndex] = useState(0);
  const view = spec.views[viewIndex];
  const collectionKey = view.collection;
  const [records,setRecords] = useState<Record<string,Row[]>>(() => {
    try { const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
      return Object.fromEntries(spec.collections.map(c => [c.key, Array.isArray(data[c.key]) ? data[c.key].filter((r:Row) => r && typeof r.id === 'string' && r.values && typeof r.values === 'object') : []]));
    } catch { return {}; }
  });
  const [editing,setEditing] = useState<string|null>(null);
  const [values,setValues] = useState<Row['values']>({});
  const [error,setError] = useState('');
  const collection = spec.collections.find(c => c.key === collectionKey)!;
  const rows = records[collectionKey] || [];
  const fields:Field[] = collection.fields;
  const visibleFields = view.columns === undefined ? fields : view.columns.map(key => fields.find(field => field.key === key)!);
  const completed = rows.filter(row => fields.some(field => field.type === 'boolean' && row.values[field.key] === true)).length;
  function save(next:Record<string,Row[]>) {
    try { localStorage.setItem(storageKey,JSON.stringify(next));setRecords(next);setError('');return true; }
    catch { setError('浏览器存储不可用，记录尚未保存。');return false; }
  }
  return <main><h1>{spec.app.name}</h1><p>{spec.app.description}</p>
    <nav>{spec.views.map((v,index) => <button key={index} aria-current={index === viewIndex ? 'page' : undefined} onClick={() => {setViewIndex(index);setEditing(null);setValues({});}}>{spec.navigation[index]}</button>)}</nav>
    <div>{spec.dashboard.map((metric,index) => <p key={index}>{metric.label}：{metric.metric === 'count' ? rows.length : metric.metric === 'completed' ? completed : rows.length - completed}</p>)}</div>
    <h2>{view.title}</h2>{error && <p role="alert">{error}</p>}
    <form onSubmit={e => { e.preventDefault();
      const normalized:Row['values'] = {};
      for (const f of fields) {
        const v = values[f.key];
        if (f.required && f.type !== 'boolean' && (v == null || String(v).trim() === '')) {setError(f.label+'不能为空');return;}
        normalized[f.key] = f.type === 'boolean' ? Boolean(v) : f.type === 'number' && v !== '' && v != null ? Number(v) : String(v ?? '');
      }
      const row = {id:editing || crypto.randomUUID(),values:normalized};
      if (save({...records,[collectionKey]:editing ? rows.map(r => r.id === editing ? row : r) : [...rows,row]})) {setEditing(null);setValues({});}
    }}>
      {fields.map(f => <label key={f.key}>{f.label}
        {f.type === 'boolean' ? <input type="checkbox" checked={Boolean(values[f.key])} onChange={e => setValues({...values,[f.key]:e.target.checked})}/> : f.type === 'select' ? <select required={f.required} value={String(values[f.key] ?? '')} onChange={e => setValues({...values,[f.key]:e.target.value})}><option value="">请选择</option>{f.options?.map(o => <option key={o}>{o}</option>)}</select> : f.type === 'textarea' ? <textarea required={f.required} value={String(values[f.key] ?? '')} onChange={e => setValues({...values,[f.key]:e.target.value})}></textarea> : <input required={f.required} step={f.type === 'number' ? 'any' : undefined} type={f.type === 'number' || f.type === 'date' ? f.type : 'text'} value={String(values[f.key] ?? '')} onChange={e => setValues({...values,[f.key]:e.target.value})}/>}
      </label>)}
      <button type="submit">{editing ? '保存修改' : spec.primaryAction}</button>
      {editing && <button type="button" onClick={() => {setEditing(null);setValues({});}}>取消编辑</button>}
    </form>
    {view.type === 'table' ? <table><thead><tr>{visibleFields.map(f => <th key={f.key}>{f.label}</th>)}<th>操作</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}>{visibleFields.map(f => <td key={f.key}>{f.type === 'boolean' ? (r.values[f.key] ? '是' : '否') : String(r.values[f.key] ?? '')}</td>)}<td><button onClick={() => {setEditing(r.id);setValues({...r.values});}}>编辑</button><button onClick={() => {if(save({...records,[collectionKey]:rows.filter(v => v.id !== r.id)}) && editing === r.id){setEditing(null);setValues({});}}}>删除</button></td></tr>)}</tbody></table> : <section>{rows.map(r => <article key={r.id}>{visibleFields.map(f => <p key={f.key}>{f.label}：{f.type === 'boolean' ? (r.values[f.key] ? '是' : '否') : String(r.values[f.key] ?? '')}</p>)}<button onClick={() => {setEditing(r.id);setValues({...r.values});}}>编辑</button><button onClick={() => {if(save({...records,[collectionKey]:rows.filter(v => v.id !== r.id)}) && editing === r.id){setEditing(null);setValues({});}}}>删除</button></article>)}</section>}

  </main>;
}
'''
CSS = 'body{font-family:system-ui,sans-serif;margin:0;color:#18212f;background:#f7f8fa}main{max-width:960px;margin:auto;padding:24px}nav,form{display:flex;gap:12px;flex-wrap:wrap}label{display:grid;gap:6px}input,textarea,select,button{font:inherit;padding:8px}table{width:100%;margin-top:24px;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}[role=alert]{color:#b42318}'


def export_source(value):
    spec = app_spec(value)
    # Serialize as a JS object literal; no model text becomes executable syntax.
    encoded = json.dumps(spec, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e')
    return {'files': {'src/App.tsx': TEMPLATE.replace('__SPEC__', encoded).replace('__KEY__', hashlib.sha256(encoded.encode()).hexdigest()[:24]), 'src/index.css': CSS}}
