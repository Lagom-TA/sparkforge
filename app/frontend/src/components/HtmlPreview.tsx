import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { client, getErrorMessage } from '@/lib/sparkforge';
import { sandboxDocument } from '@/lib/sandbox';

export default function HtmlPreview({ html, title, versionId, readOnly = false }: {
  html: string; title: string; versionId?: number; readOnly?: boolean;
}) {
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState('正在启动应用…');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(true);
  const [height, setHeight] = useState(680);
  const frame = useRef<HTMLIFrameElement>(null);
  const channel = useMemo(() => crypto.randomUUID(), [html, versionId, readOnly, run]);
  const document = useMemo(() => sandboxDocument(html, channel), [html, channel]);
  useEffect(() => {
    if (!running) return;
    let active = true;
    let revision = 0;
    let loaded = !versionId;
    let memory: unknown = null;
    let queue = Promise.resolve();
    setStatus('正在启动应用…'); setError('');
    const timer = setTimeout(() => { if (active) setError('应用未完成启动，请重启或返回对话修复源码。'); }, 12000);
    const handle = (event: MessageEvent) => {
      if (!active || event.source !== frame.current?.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
      const { type, id, state, message } = event.data;
      if (type === 'resize' && Number.isFinite(event.data.height)) {setHeight(Math.max(480, Math.min(1200, event.data.height))); return;}
      if (type === 'ready') { clearTimeout(timer); setStatus('应用已启动，请逐项验证功能'); return; }
      if (type === 'error') { clearTimeout(timer); setError(String(message).slice(0, 500)); return; }
      if (!['load', 'save'].includes(type) || !Number.isSafeInteger(id)) return;
      const target = event.source as Window;
      // Serialize requests to preserve save order and optimistic revisions.
      queue = queue.then(async () => {
        if (!active) return;
        try {
          if (type === 'load') {
            if (versionId) {
              const result = await client.apiCall.invoke({url: `/api/v1/runtime-state/${versionId}`, method: 'GET', data: {}, options: {timeout: 10000}});
              memory = result.data.state; revision = result.data.revision;
            }
            loaded = true;
          } else {
            const encoded = JSON.stringify(state);
            if (encoded === undefined || new TextEncoder().encode(encoded).length > 100000) throw new Error('状态必须是 100KB 以内的 JSON 数据。');
            if (versionId && readOnly) throw new Error('历史版本仅供查看，不能保存状态。');
            if (!loaded) throw new Error('请先读取已保存状态，再进行修改。');
            if (versionId) {
              const result = await client.apiCall.invoke({url: `/api/v1/runtime-state/${versionId}`, method: 'PUT', data: {revision, state}, options: {timeout: 10000}});
              revision = result.data.revision;
            }
            memory = state;
          }
          if (active) target.postMessage({channel, type: 'response', id, state: memory}, '*');
        } catch (cause) {
          if (active) {
            const message = getErrorMessage(cause);
            setError(message);
            target.postMessage({channel, type: 'response', id, error: message}, '*');
          }
        }
      });
    };
    window.addEventListener('message', handle);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('message', handle); };
  }, [channel, versionId, readOnly, running]);
  return <section className="overflow-hidden rounded-xl border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
      <p className="text-sm" role="status">{running ? status : '应用已停止'}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => {setRunning(true); setRun(value => value + 1);}}>重新启动</Button>
        <Button size="sm" variant="outline" disabled={!running} onClick={() => setRunning(false)}>停止运行</Button>
      </div>
    </div>
    {!versionId && <p className="p-3 text-sm text-muted-foreground">分享演示可交互；数据仅保留在本次会话，不包含项目已保存的数据。</p>}
    {error && <p role="alert" className="break-words bg-destructive/10 p-3 text-sm text-destructive">运行问题：{error}</p>}
    {running && <iframe ref={frame} key={channel} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} style={{height}} className="w-full border-0 bg-white" />}
  </section>;
}
