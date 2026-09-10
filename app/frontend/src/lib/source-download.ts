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

export function downloadSource(version: Version) {
  const html = version.source_bundle.files['index.html'];
  const content = version.app_spec.runtime === 'html' ? downloadableHtml(html, version.id) : JSON.stringify(version.source_bundle, null, 2);
  const blob = new Blob([content], {type: version.app_spec.runtime === 'html' ? 'text/html;charset=utf-8' : 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sparkforge-v${version.version_number}.${version.app_spec.runtime === 'html' ? 'html' : 'json'}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
