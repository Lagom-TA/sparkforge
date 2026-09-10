/** Build a fresh opaque-origin document for every run. No auth data enters it. */
export function sandboxDocument(html: string, channel: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  // No generated policy, refresh or base element can precede our policy.
  document.querySelectorAll('meta[http-equiv],base,iframe,frame,object,embed,link,script[src]').forEach(node => node.remove());
  const bootstrap = document.createElement('script');
  bootstrap.textContent = `(() => {
    const channel = ${JSON.stringify(channel)};
    const pending = new Map(); let serial = 0;
    function send(type, data) { parent.postMessage({channel, type, ...data}, '*'); }
    function request(type, state) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('保存服务未响应，请重试')); }, 15000);
        pending.set(id, {resolve, reject, timer}); send(type, {id, state});
      });
    }
    addEventListener('message', e => {
      if (e.source !== parent || e.data?.channel !== channel || e.data.type !== 'response') return;
      const item = pending.get(e.data.id); if (!item) return;
      clearTimeout(item.timer); pending.delete(e.data.id);
      e.data.error ? item.reject(new Error(e.data.error)) : item.resolve(e.data.state);
    });
    Object.defineProperty(window, 'sparkforge', {value: Object.freeze({loadState: () => request('load'), saveState: state => request('save', state)}), writable: false});
    addEventListener('error', e => send('error', {message: String(e.message).slice(0, 500)}));
    addEventListener('unhandledrejection', e => send('error', {message: String(e.reason?.message || e.reason).slice(0, 500)}));
    addEventListener('DOMContentLoaded', () => {send('ready', {}); new ResizeObserver(() => send('resize', {height: document.documentElement.scrollHeight})).observe(document.body);});
  })();`;
  document.head.prepend(bootstrap);
  document.head.prepend(policy);
  return '<!doctype html>\n' + document.documentElement.outerHTML;
}
