import { useState } from 'react';
import { Copy, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Version } from '@/lib/sparkforge';
import { downloadSource } from '@/lib/source-download';

export default function SourceBrowser({ version }: { version: Version }) {
  const files = version.source_bundle.files;
  const paths = Object.keys(files).sort();
  const [selected, setSelected] = useState(version.app_spec.runtime === 'html' ? 'index.html' : 'src/App.tsx');
  const path = selected in files ? selected : paths[0];
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-[#18181b] text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
        <span className="text-sm">源码 · {paths.length} 个文件</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => downloadSource(version)}>下载源码</Button>
          <Button variant="ghost" size="sm" onClick={async () => {
            try { await navigator.clipboard.writeText(files[path]); toast.success(`${path} 已复制。`); }
            catch { toast.error('复制失败，请手动选择源码复制。'); }
          }}><Copy className="mr-2 h-4 w-4" />复制当前文件</Button>
        </div>
      </div>
      <div className="grid min-w-0 sm:grid-cols-[minmax(140px,180px)_minmax(0,1fr)]">
        <nav aria-label="源码文件" className="max-h-48 overflow-auto border-b border-white/10 p-2 sm:max-h-none sm:border-b-0 sm:border-r">
          {paths.map(name => <button key={name} type="button" aria-current={name === path ? 'true' : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-white/10 focus-visible:outline focus-visible:outline-2 ${name === path ? 'bg-white/10 text-white' : 'text-zinc-300'}`}
            onClick={() => setSelected(name)}><FileCode2 className="h-4 w-4 shrink-0" /><span className="break-all">{name}</span></button>)}
        </nav>
        <div className="min-w-0">
          <p className="break-all border-b border-white/10 px-4 py-2 text-xs text-zinc-300">{path}</p>
          <pre aria-label={`源码 ${path}`} className="max-h-[calc(100vh-15rem)] overflow-auto p-4 text-xs leading-6"><code>{files[path]}</code></pre>
        </div>
      </div>
    </div>
  );
}
