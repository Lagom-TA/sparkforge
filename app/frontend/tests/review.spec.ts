import { test, expect } from '@playwright/test';
import { validateBuild, validatePlan } from '../src/lib/spec-validation';

const valid = {
  appSpec: { runtime: 'crud', app: { name: 'Test', description: 'Test' }, navigation: ['Tasks'], dashboard: [],
    collections: [{key:'tasks',label:'Tasks',fields:[{key:'title',label:'Title',type:'text'}, {key:'done',label:'Done',type:'boolean'}]}],
    views:[{type:'table',collection:'tasks',title:'Tasks',columns:['title']}], primaryAction:'Add' },
  files:{'src/App.tsx':'export default function App() { return null; }'},
};
test('reject malformed models and invalid cross references', () => {
  expect((validateBuild(valid).appSpec as import('../src/lib/sparkforge').CrudSpec).collections).toHaveLength(1);
  expect(() => validatePlan({title:'x',features:[null,null,null]})).toThrow();
  const dangling = structuredClone(valid);
  dangling.appSpec.views[0].columns = ['missing'];
  expect(() => validateBuild(dangling)).toThrow();
  const badField = structuredClone(valid);
  badField.appSpec.collections[0].fields[1].type = 'select';
  expect(() => validateBuild(badField)).toThrow();
  const duplicate = structuredClone(valid);
  duplicate.appSpec.collections.push(duplicate.appSpec.collections[0]);
  expect(() => validateBuild(duplicate)).toThrow();
});

test('record editor retains empty number and distinguishes failed load', async ({page}) => {
  await page.goto('http://127.0.0.1:4317/tests/preview.html');
  await expect(page.getByText('测试记录 1', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'新建记录'}).click();
  await page.getByLabel('标题').fill('新记录');
  await page.getByLabel('数量').fill('8');
  await page.getByLabel('数量').fill('');
  await page.getByRole('button', {name:'创建记录',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('请填写数量');
  await expect(page.getByLabel('数量')).toHaveValue('');
  await page.getByLabel('数量').fill('1.5');
  await page.getByRole('button', {name:'创建记录',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('新记录', {exact:true})).toBeVisible();
  await page.evaluate(() => (window as any).fixture.failDelete(true));
  await page.getByRole('button', {name:'删除记录',exact:true}).first().click();
  await expect(page.getByRole('alert')).toContainText('删除失败，记录已保留');
  await expect(page.getByText('新记录', {exact:true})).toBeVisible();
  await page.evaluate(() => (window as any).fixture.failLoad(true));
  await page.getByRole('button', {name:'重新加载',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('记录加载失败');
  await page.evaluate(() => (window as any).fixture.failLoad(false));
  await page.getByRole('button', {name:'重新加载',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', {name:'备忘',exact:true}).click();
  await expect(page.getByText('还没有记录', {exact:true})).toBeVisible();
  await expect(page.getByText('新记录', {exact:true})).toHaveCount(0);
});

test('desktop and mobile layouts stay within viewport', async ({page}) => {
  for (const [name, width] of [['desktop',1440], ['mobile',390]] as const) {
    await page.setViewportSize({width,height:1000});
    await page.goto('http://127.0.0.1:4317/');
    await expect(page.getByRole('textbox')).toBeVisible();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.screenshot({path:`test-results/home-${name}.png`,fullPage:true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('http://127.0.0.1:4317/tests/preview.html');
    await expect(page.getByText('测试记录 1',{exact:true})).toBeVisible();
    await page.screenshot({path:`test-results/preview-${name}.png`,fullPage:true});
    await page.getByRole('button',{name:'新建记录'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

for (const mode of ['success','lost','stopped','resume'] as const) {
  test(`durable task client: ${mode}`, async ({page}) => {
    await page.goto('http://127.0.0.1:4317/tests/preview.html');
    const result = await page.evaluate(async (mode) => {
      const harness = await import('/tests/generation-harness.ts');
      return harness.pipeline(mode);
    }, mode);
    expect(result.writes).toEqual([]);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[1].url).toContain('/1/step');
    if (mode === 'resume') expect(result.requests[0].data.action).toBe('resume');
    else {
      expect(result.requests[0].data.product_spec.title).toBe('恢复用蓝图');
      expect(result.requests[0].data.version_number).toBeUndefined();
    }
    if (mode === 'success' || mode === 'resume') expect(result.version.version_number).toBe(3);
    else expect(result.version).toBeUndefined();
    if (mode === 'lost') expect(result.error).toContain('任务已保存');
  });
}

test('CRUD renders declared table columns, navigation and metric', async ({page}) => {
  await page.goto('http://127.0.0.1:4317/tests/preview.html?table');
  await expect(page.getByRole('button', {name:'列表页'})).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', {name:'标题'})).toBeVisible();
  await expect(page.getByRole('columnheader', {name:'数量'})).toHaveCount(0);
  await expect(page.getByText('总条数', {exact:true})).toBeVisible();
});

test('record loading includes later pages instead of silently truncating at 200', async ({page}) => {
  await page.goto('http://127.0.0.1:4317/tests/preview.html');
  const result = await page.evaluate(async () => {
    const {client, listAppRecords} = await import('/src/lib/sparkforge.ts');
    const calls: unknown[] = [];
    client.entities.app_records.query = async (request: any) => {
      calls.push(request.query.id);
      const ids = request.query.id ? [1] : Array.from({length:500}, (_, i) => 501-i);
      return {data:{items:ids.map(id=>({id,is_deleted:false}))}} as any;
    };
    return {count:(await listAppRecords(1,'tasks')).length,calls};
  });
  expect(result.count).toBe(501);
  expect(result.calls[1]).toEqual({$lt:2});
});
