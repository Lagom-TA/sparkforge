import {test,expect} from '@playwright/test';
import {unzipSync, strFromU8} from 'fflate';

test('source files, download, restore and reload use the selected version',async({page})=>{
 await page.goto('http://127.0.0.1:4317/tests/workspace.html');
 await page.getByRole('tab',{name:'代码',exact:true}).click();
 await page.getByRole('button',{name:'src/index.css',exact:true}).click();
 await expect(page.getByLabel('源码 src/index.css',{exact:true})).toContainText('version 2 styles');
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载源码',exact:true}).click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('sparkforge-v2.zip');
 const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(chunk);
 const archive=unzipSync(Buffer.concat(chunks));
 expect(strFromU8(archive['src/index.css'])).toContain('version 2 styles');
 expect(JSON.parse(strFromU8(archive['package.json'])).scripts.build).toContain('vite build');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.screenshot({path:`test-results/source-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.getByRole('tab',{name:'版本',exact:true}).click();
 await page.getByRole('button',{name:'版本 1 测试版本 1'}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'恢复 V1',exact:true}).click();
 await expect(page.getByText('当前活动版本：V1')).toBeVisible();
 await page.goto('http://127.0.0.1:4317/tests/workspace.html');
 await page.getByRole('tab',{name:'版本',exact:true}).click();
 await expect(page.getByText('当前活动版本：V1')).toBeVisible();
 await page.getByRole('tab',{name:'代码',exact:true}).click();
 await expect(page.getByLabel('源码 src/App.tsx',{exact:true})).toContainText('Version 1');
});

test('list failures retain login and retry; logout and relogin restore projects',async({page})=>{
 await page.goto('http://127.0.0.1:4317/tests/workspace.html?home');
 await expect(page.getByRole('button',{name:'退出',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'项目',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('项目列表加载失败');
 await page.getByRole('button',{name:'重新加载项目'}).click();
 await expect(page.getByText('恢复测试',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'退出',exact:true}).click();
 await page.goto('http://127.0.0.1:4317/tests/workspace.html?home');
 await expect(page.getByRole('button',{name:'登录',exact:true})).toBeVisible();
 await page.evaluate(()=>localStorage.removeItem('isLougOutManual'));
 await page.goto('http://127.0.0.1:4317/tests/workspace.html?home');
 await expect(page.getByRole('button',{name:'退出',exact:true})).toBeVisible();
});

for(const existing of [false,true])for(const action of ['停止','暂停并补充'])test(`delayed admission (existing=${existing}): ${action} waits for server confirmation`,async({page})=>{
 await page.goto(`http://127.0.0.1:4317/tests/workspace.html?admission${existing?'&existing':''}`);
 await page.getByRole('button',{name:'生成新版本',exact:true}).click();
 await page.getByRole('button',{name:action,exact:true}).click();
 await expect.poll(async()=>page.evaluate(()=>(window as any).admissionRequests.filter((r:any)=>r.url.endsWith('/control')).length)).toBe(1);
 await expect(page.getByText(action==='停止'?'任务已停止。':'已暂停，可补充要求后重新规划。',{exact:true})).toBeVisible();
 const requests=await page.evaluate(()=>(window as any).admissionRequests);
 expect(requests.find((r:any)=>r.url.endsWith('/control')).url).toBe('/api/v1/generation-jobs/99/control');
 expect(requests.some((r:any)=>r.url.endsWith('/step'))).toBe(false);
});
