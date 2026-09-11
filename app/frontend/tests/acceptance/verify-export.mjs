import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const directory=resolve(process.argv[2]);
const server=spawn(process.execPath,[join(directory,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4321','--strictPort'],{cwd:directory,stdio:'pipe'});
let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4321')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4321');
 await page.getByLabel('名称',{exact:true}).fill('导出工程记录');
 await page.getByRole('button',{name:'新增',exact:true}).click();
 await page.getByRole('cell',{name:'导出工程记录',exact:true}).waitFor();
 await page.reload();await page.getByRole('cell',{name:'导出工程记录',exact:true}).waitFor();
 await page.getByRole('button',{name:'编辑',exact:true}).click();
 await page.getByLabel('名称',{exact:true}).fill('已编辑记录');
 await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await page.reload();await page.getByRole('cell',{name:'已编辑记录',exact:true}).waitFor();
 await page.getByRole('button',{name:'删除',exact:true}).click();
 await page.reload();assert.equal(await page.getByRole('cell',{name:'已编辑记录',exact:true}).count(),0);
 // A transient read error must preserve the stored bytes and block writes until re-read succeeds.
 await page.getByLabel('名称',{exact:true}).fill('受保护的原记录');
 await page.getByRole('button',{name:'新增',exact:true}).click();
 const saved=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sparkforge-export:')).map(k=>[k,localStorage.getItem(k)]));
 const failure=await browser.newPage();
 await failure.addInitScript(({saved})=>{
   if(sessionStorage.getItem('read-failure-injected'))return;
   sessionStorage.setItem('read-failure-injected','1');
   for(const [key,value] of saved)localStorage.setItem(key,value);
   const get=Storage.prototype.getItem;
   Storage.prototype.getItem=function(key){if(key.startsWith('sparkforge-export:')){Storage.prototype.getItem=get;throw Error('transient read failure');}return get.call(this,key);};
 },{saved});
 await failure.goto('http://127.0.0.1:4321');
 await failure.getByRole('alert').waitFor();
 assert.equal(await failure.getByRole('button',{name:'新增',exact:true}).isEnabled(),false);
 assert.equal(await failure.evaluate(([key])=>localStorage.getItem(key),saved[0]),saved[0][1]);
 await failure.getByRole('button',{name:'重新读取存档',exact:true}).click();
 await failure.getByRole('cell',{name:'受保护的原记录',exact:true}).waitFor();
 assert.equal(await failure.getByRole('button',{name:'新增',exact:true}).isEnabled(),true);
 // Malformed JSON remains intact too.
 await failure.evaluate(([key])=>localStorage.setItem(key,'{broken'),saved[0]);
 await failure.reload();await failure.getByRole('alert').waitFor();
 assert.equal(await failure.evaluate(([key])=>localStorage.getItem(key),saved[0]),'{broken');
 assert.equal(await failure.getByRole('button',{name:'新增',exact:true}).isEnabled(),false);
 await failure.evaluate(([key,value])=>localStorage.setItem(key,value),saved[0]);
 await failure.getByRole('button',{name:'重新读取存档',exact:true}).click();
 await failure.getByRole('cell',{name:'受保护的原记录',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('Export acceptance passed: startup, create, edit, delete, refresh persistence; read and parse failure protection, recovery; zero runtime errors.');
} finally {await browser?.close();server.kill('SIGTERM');}
