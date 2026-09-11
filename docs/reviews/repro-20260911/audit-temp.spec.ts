import {test,expect} from '@playwright/test';
test('audit project-switch stale completion',async({page})=>{
 await page.goto('http://127.0.0.1:4317/tests/audit-temp.html');
 await expect(page.getByText('任务 #101',{exact:false})).toBeVisible();
 await page.getByRole('link',{name:/第二项目/}).click();
 await expect(page.getByRole('heading',{name:'第二项目',exact:true})).toBeVisible();
 await page.waitForTimeout(2500);
 console.log('AUDIT',page.url(),await page.locator('h1').textContent());
 await expect(page.getByRole('heading',{name:'第二项目',exact:true})).toBeVisible();
});test('audit stop before admission response must stop admitted job',async({page})=>{
 await page.goto('http://127.0.0.1:4317/tests/workspace.html');
 const result=await page.evaluate(async()=>{
  const {client}=await import('/src/lib/api.ts');
  const {buildProject}=await import('/src/lib/generation.ts');
  let current=true;let control='running';const requests:any[]=[];
  const plan={title:'任务',summary:'管理',audience:'团队',features:[0,1,2].map(i=>({name:String(i),description:'管理',priority:'P0'})),pages:[{name:'任务',purpose:'管理'}],entities:[],acceptance:['新增','编辑','删除'],outOfScope:['支付']};
  client.apiCall.invoke=async(r:any)=>{requests.push(r);current=false;control='stopped';return {data:{generation:{id:999,project_id:1,status:'running',current_stage:'building',public_log:[],product_spec:plan},status:'pending',stage:'spec',kind:'build'}};};
  try{await buildProject(1,plan,'test',{isCurrent:()=>current,getControl:()=>control as any});}catch{}
  return requests.map(r=>r.url);
 });
 console.log('STOP_AUDIT',result);
 expect(result).toContain('/api/v1/generation-jobs/999/control');
});
test('audit exported CRUD must not overwrite unread records',async({page})=>{
 await page.addInitScript(()=>{
  const original=Storage.prototype.getItem;
  Storage.prototype.getItem=function(key){
   if(key.startsWith('sparkforge-export:')){
    Storage.prototype.getItem=original;
    this.setItem(key,JSON.stringify({tasks:[{id:'old',values:{title:'原有记录',done:false}}]}));
    throw new Error('temporary read failure');
   }
   return original.call(this,key);
  };
 });
 await page.goto('http://127.0.0.1:4317/tests/audit-export.html');
 await page.getByLabel('名称',{exact:true}).fill('新增记录');
 await page.getByRole('button',{name:'新增',exact:true}).click();
 const value=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('sparkforge-export:')).map(k=>localStorage.getItem(k)).join(''));
 console.log('EXPORT_AUDIT',value);
 expect(value).toContain('原有记录');
});
