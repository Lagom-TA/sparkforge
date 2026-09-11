import {test,expect} from '@playwright/test';
import {unzipSync, strFromU8} from 'fflate';
import {mkdir,writeFile} from 'node:fs/promises';

test('real HTTP/DB: plan, startup rejection, auto resume, CRUD, restore, acceptance and download',async({page,request})=>{
 expect((await request.post('http://127.0.0.1:8019/__acceptance/reset')).ok()).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('token','local-acceptance-only'));
 await page.goto('/workspace/1?start=1');
 await expect(page.getByRole('button',{name:'批准并构建',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'批准并构建',exact:true}).click();
 // Refresh during building: work reconnects without clicking a resume button.
 await expect.poll(async()=>(await request.get('/api/v1/entities/generations?sort=-id')).json().then(d=>d.items[0]?.status)).toBe('running');
 await page.reload();
 await expect(page.getByRole('tab',{name:'预览',exact:true})).toBeVisible({timeout:30000});
 const counter=page.frameLocator('iframe[title="验收计数器"]');
 await expect(counter.locator('#count')).toHaveText('0');
 await counter.getByRole('button',{name:'加一',exact:true}).click();
 await expect(counter.locator('#count')).toHaveText('1');
 await page.reload();
 await expect(counter.locator('#count')).toHaveText('1');
 await counter.getByRole('button',{name:'归零',exact:true}).click();
 await expect(counter.locator('#count')).toHaveText('0');
 for(const box of await page.getByRole('checkbox').all())await box.check();
 await page.getByRole('button',{name:'确认已逐项验证'}).click();
 await expect(page.getByText('你已确认此版本通过验收')).toBeVisible();
 const generations=await (await request.get('/api/v1/entities/generations?sort=-id')).json();
 expect(JSON.stringify(generations)).toContain('语法错误');
 expect(generations.items.filter((g:any)=>g.status==='awaiting_approval')).toHaveLength(0);
 // Edit the completed version's blueprint and save a new durable draft.
 await page.getByRole('button',{name:'编辑蓝图',exact:true}).click();
 await page.getByLabel('应用名称',{exact:true}).fill('CRUD 任务管理');
 await page.getByRole('button',{name:'保存蓝图',exact:true}).click();
 await page.reload();
 await expect(page.getByRole('heading',{name:'CRUD 任务管理',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'生成新版本',exact:true}).click();
 await expect(page.getByRole('button',{name:'新增',exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'新增',exact:true}).click();
 await page.getByLabel('名称',{exact:true}).fill('持久化验收记录');
 await page.getByRole('button',{name:'创建记录',exact:true}).click();
 await expect(page.getByText('持久化验收记录',{exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByText('持久化验收记录',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'代码',exact:true}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载源码',exact:true}).click();
 const download=await downloaded;expect(download.suggestedFilename()).toBe('sparkforge-v2.zip');
 const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const c of stream!)chunks.push(c);
 const files=unzipSync(Buffer.concat(chunks));
 const output='/tmp/sparkforge-export-acceptance';
 for(const [name,value] of Object.entries(files)){const path=output+'/'+name;await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await writeFile(path,strFromU8(value));}
 // A restore incompatible with persisted records must fail and retain V2.
 await page.getByRole('tab',{name:'版本',exact:true}).click();
 await page.getByRole('button',{name:/版本 1/}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'恢复 V1',exact:true}).click();
 await expect(page.getByText(/无法恢复此版本/)).toBeVisible();
 const project=await (await request.get('/api/v1/entities/projects/1')).json();
 const versions=await (await request.get('/api/v1/entities/versions?sort=-version_number')).json();
 expect(project.active_version_id).toBe(versions.items[0].id);
 // Remove only this test's disposable record, then verify a successful restore through the UI.
 await page.getByRole('button',{name:/版本 2/}).click();
 await page.getByRole('tab',{name:'预览',exact:true}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除记录',exact:true}).click();
 await expect(page.getByText('持久化验收记录',{exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'版本',exact:true}).click();
 await page.getByRole('button',{name:/版本 1/}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'恢复 V1',exact:true}).click();
 await expect(page.getByText('当前活动版本：V1')).toBeVisible();
 await page.reload();
 await expect(counter.locator('#count')).toHaveText('0');
 await expect(page.getByText('你已确认此版本通过验收')).toBeVisible();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  await page.screenshot({path:`test-results/acceptance-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }

});
