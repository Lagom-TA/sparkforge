import { parse } from 'acorn';
import { sandboxDocument } from './sandbox';

/** Runs candidate code with isolated, disposable storage, never project data. */
export async function checkStartup(html: string, isCurrent: () => boolean = () => true): Promise<{passed: boolean; message: string}> {
  try {
    const document = new DOMParser().parseFromString(html, 'text/html');
    for (const script of document.querySelectorAll('script')) {
      parse(script.textContent || '', {ecmaVersion: 'latest', sourceType: 'script'});
    }
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (attribute.name.startsWith('on')) parse(`function handler(event){${attribute.value}\n}`, {ecmaVersion: 'latest'});
      }
    }
  } catch (error) {
    return {passed: false, message: `JavaScript 语法错误：${error instanceof Error ? error.message : String(error)}`.slice(0, 500)};
  }
  return new Promise(resolve => {
    const channel = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.title = '候选应用启动检查';
    frame.style.cssText = 'position:fixed;left:-2000px;top:0;width:1024px;height:768px;border:0;';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    let settled = false;
    let memory: unknown = null;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let pending = 0;
    let ready = false;
    const finish = (passed: boolean, message = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout); clearTimeout(readyTimer); clearInterval(interruption);
      window.removeEventListener('message', handle); frame.remove();
      resolve({passed, message: message.slice(0, 500)});
    };
    const schedule = () => {
      clearTimeout(readyTimer);
      if (ready && !pending) readyTimer = setTimeout(() => finish(true), 1200);
    };
    const handle = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
      const {type, id, state, message} = event.data;
      if (type === 'error') {finish(false, `应用启动错误：${String(message)}`); return;}
      if (type === 'ready') {ready = true; schedule(); return;}
      if (type !== 'load' && type !== 'save') return;
      pending++;
      try {
        if (type === 'save') {
          const encoded = JSON.stringify(state);
          if (encoded === undefined || new TextEncoder().encode(encoded).length > 100000) throw Error('状态超过100KB或不是JSON');
          memory = state;
        }
        frame.contentWindow?.postMessage({channel, type: 'response', id, state: memory}, '*');
      } catch (error) {finish(false, String(error));}
      finally {pending--; schedule();}
    };
    const timeout = setTimeout(() => finish(false, '应用启动超时，请修复初始化逻辑。'), 12000);
    const interruption = setInterval(() => {if (!isCurrent()) finish(false, '启动检查已中断。');}, 100);
    window.addEventListener('message', handle);
    frame.srcdoc = sandboxDocument(html, channel);
    document.body.append(frame);
  });
}
