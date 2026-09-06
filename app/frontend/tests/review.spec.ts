import { test, expect } from '@playwright/test';
import { validateBuild, validatePlan } from '../src/lib/spec-validation';

const valid = {
  appSpec: { app: { name: 'Test', description: 'Test' }, navigation: [], dashboard: [],
    collections: [{key:'tasks',label:'Tasks',fields:[{key:'title',label:'Title',type:'text'}, {key:'done',label:'Done',type:'boolean'}]}],
    views:[{type:'table',collection:'tasks',title:'Tasks',columns:['title']}], primaryAction:'Add' },
  files:{'src/App.tsx':'export default function App() { return null; }'},
};
test('reject malformed models and invalid cross references', () => {
  expect(validateBuild(valid).appSpec.collections).toHaveLength(1);
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

test('stale planning failure cannot overwrite the newer project state', async ({page}) => {
  await page.goto('http://127.0.0.1:4317/tests/preview.html');
  const result = await page.evaluate(async () => {
    const harness = await import('/tests/generation-harness.ts');
    return harness.interruptedPlanDoesNotOverwrite();
  });
  expect(result.projectWrites).toEqual([{status:'planning'}]);
  expect(result.generationWrites.some((write: any) => write.status === 'failed')).toBe(false);
});

test('building saves its approved blueprint before requesting the model', async ({page}) => {
  await page.goto('http://127.0.0.1:4317/tests/preview.html');
  const writes = await page.evaluate(async () => {
    const harness = await import('/tests/generation-harness.ts');
    return harness.buildPersistsApprovedPlan();
  });
  expect(writes[0].product_spec.title).toBe('恢复用蓝图');
  expect(writes.at(-1).status).toBe('failed');
});

for (const mode of ['repair','invalid','stopped'] as const) {
  test(`semantic model repair is bounded and respects cancellation: ${mode}`, async ({page}) => {
    await page.goto('http://127.0.0.1:4317/tests/preview.html');
    const result = await page.evaluate(async (mode) => {
      const harness = await import('/tests/generation-harness.ts');
      return harness.semanticBuildRepair(mode);
    },mode);
    expect(result.requests).toHaveLength(mode === 'stopped' ? 1 : 2);
    expect(result.versions).toHaveLength(mode === 'repair' ? 1 : 0);
    if (mode !== 'stopped') {
      expect(result.requests[1].messages[1].content).toContain('修复测试蓝图');
      expect(result.requests[1].messages.at(-1).content).toContain('校验失败');
    }
    if (mode === 'invalid') expect(result.error).toContain('生成结果无法预览');
  });
}
