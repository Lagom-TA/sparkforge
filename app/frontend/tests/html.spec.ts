import {test,expect} from '@playwright/test';

test('2048 merges once, saves in order and restores after restart',async({page})=>{
  await page.goto('http://127.0.0.1:4317/tests/html.html');
  const app=page.frameLocator('iframe');
  await expect(app.getByRole('gridcell')).toHaveCount(16);
  await app.getByRole('grid').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(app.locator('#score')).toHaveText('8');
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.saves())).toBe(1);
  expect(await page.evaluate(()=>(window as any).fixture.state().board.slice(0,2))).toEqual([4,4]);
  await page.getByRole('button',{name:'重新启动',exact:true}).click();
  await expect(app.locator('#score')).toHaveText('8');
  await app.getByRole('button',{name:'重新开始',exact:true}).click();
  await expect(app.locator('#score')).toHaveText('0');
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.saves())).toBe(2);
  await page.getByRole('button',{name:'停止运行'}).click();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('sandbox blocks main document access and network fetch',async({page})=>{
  let escaped=false;
  page.on('request',request=>{if(request.url().includes('/exfil'))escaped=true;});
  await page.goto('http://127.0.0.1:4317/tests/html.html?hostile');
  await expect(page.frameLocator('iframe').locator('body')).toContainText('parent blocked network blocked');
  expect(await page.locator('body').getAttribute('data-compromised')).toBeNull();
  expect(escaped).toBe(false);
  expect(await page.evaluate(()=>(window as any).fixture.sdkMessages())).toBe(0);
  expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-scripts');
});

test('public interaction never reads or writes owner state, mobile fits',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await page.goto('http://127.0.0.1:4317/tests/html.html?share');
  const app=page.frameLocator('iframe');
  await expect(app.locator('#score')).toHaveText('0');
  await app.getByRole('button',{name:'重新开始',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).fixture.saves())).toBe(0);
  expect(await app.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/interactive-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'test-results/interactive-desktop.png',fullPage:true});
});

test('exported HTML includes a working standalone storage adapter',async({page})=>{
  await page.goto('http://127.0.0.1:4317/tests/html.html');
  const exported=await page.evaluate(async()=>{
    const {downloadableHtml}=await import('/src/lib/source-download.ts');
    return downloadableHtml('<html><head></head><body><script>window.sparkforge.saveState({score:12}).then(()=>window.sparkforge.loadState()).then(s=>document.body.append(String(s.score)));</script></body></html>',999);
  });
  await page.setContent(exported);
  await expect(page.locator('body')).toContainText('12');
});


test('new active version keeps a working runtime after read-only status changes',async({page})=>{
  await page.goto('http://127.0.0.1:4317/tests/html.html?readonly');
  await expect(page.getByRole('status')).toContainText('应用已启动');
  await page.getByRole('button',{name:'切换版本写入权限'}).click();
  await expect(page.getByRole('status')).toContainText('应用已启动');
  const app=page.frameLocator('iframe');
  await app.getByRole('grid').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(app.locator('#score')).toHaveText('8');
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.saves())).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});


test('failed cloud load stops untrusted code and restart restores existing state',async({page})=>{
  await page.goto('http://127.0.0.1:4317/tests/html.html?load-failure');
  await expect(page.getByRole('alert')).toContainText('读取存档失败');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixture.saves())).toBe(0);
  await page.getByRole('button',{name:'重新启动',exact:true}).click();
  await expect(page.frameLocator('iframe').getByRole('gridcell')).toHaveCount(16);
  await expect(page.getByRole('status')).toContainText('应用已启动');
  expect(await page.evaluate(()=>(window as any).fixture.state().board.slice(0,4))).toEqual([2,2,2,2]);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
