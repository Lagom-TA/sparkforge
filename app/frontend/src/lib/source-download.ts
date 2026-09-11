import { zipSync, strToU8 } from 'fflate';
import type {Version} from './sparkforge';

/** Standalone HTML gets its own local adapter, not access to the hosted API. */
export function downloadableHtml(html: string, versionId: number) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const adapter = document.createElement('script');
  adapter.textContent = `window.sparkforge = Object.freeze({
    loadState: async () => JSON.parse(localStorage.getItem('sparkforge-download:${versionId}') || 'null'),
    saveState: async state => {
      const encoded = JSON.stringify(state);
      if (new TextEncoder().encode(encoded).length > 100000) throw new Error('状态超过100KB');
      localStorage.setItem('sparkforge-download:${versionId}', encoded);
    }
  });`;
  document.head.prepend(adapter);
  return '<!doctype html>\n' + document.documentElement.outerHTML;
}

export function projectFiles(version: Version): Record<string, string> {
  return {
    ...version.source_bundle.files,
    'package.json': JSON.stringify({name: `sparkforge-project-${version.project_id}`, version: '1.0.0', private: true, type: 'module',
      scripts: {dev: 'vite --host 127.0.0.1', build: 'tsc --noEmit && vite build', preview: 'vite preview --host 127.0.0.1'},
      dependencies: {react: '18.3.1', 'react-dom': '18.3.1'},
      devDependencies: {'@types/react': '18.3.3', '@types/react-dom': '18.3.0', typescript: '5.5.3', vite: '8.3.0'},
    }, null, 2),
    'index.html': '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    'src/main.tsx': "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);\n",
    'vite.config.ts': "import { defineConfig } from 'vite';\nexport default defineConfig({oxc:{jsx:{runtime:'automatic'}}});\n",
    'tsconfig.json': JSON.stringify({compilerOptions: {target: 'ES2022', lib: ['ES2022','DOM','DOM.Iterable'], module:'ESNext', moduleResolution:'Bundler', jsx:'react-jsx', strict:true, noEmit:true, skipLibCheck:true, allowSyntheticDefaultImports:true}, include:['src']}, null, 2),
    '.gitignore': 'node_modules/\ndist/\n',
    'README.md': `# SparkForge 导出工程 V${version.version_number}\n\n需要 Node.js 20.19+ 或 22.12+（建议使用当前 LTS）。\n\n安装：npm install\n开发：npm run dev\n验证构建：npm run build\n预览构建：npm run preview\n\n此副本使用本浏览器 localStorage，不连接 SparkForge 云端，不包含账户凭据或线上业务数据。请保持同一访问地址以恢复本机存档。\n`,
  };
}

export function sourceArchive(version: Version) {
  const entries = Object.fromEntries(Object.entries(projectFiles(version)).map(([path, content]) => [path, strToU8(content)]));
  return zipSync(entries);
}

export function downloadSource(version: Version) {
  const isHtml = version.app_spec.runtime === 'html';
  const content = isHtml ? downloadableHtml(version.source_bundle.files['index.html'], version.id) : sourceArchive(version);
  const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content).buffer], {type: isHtml ? 'text/html;charset=utf-8' : 'application/zip'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sparkforge-v${version.version_number}.${isHtml ? 'html' : 'zip'}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
