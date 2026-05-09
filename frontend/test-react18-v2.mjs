import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

page.on('console', msg => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.goto('http://localhost:5173', { timeout: 15000 });
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(1000);

// 登录
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

// 进入项目周计划页面
await page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).click();
await page.waitForTimeout(2000);

// 点击项目情况 tab
const tab = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
await tab.click();
await page.waitForTimeout(1500);

console.log('React version:', await page.evaluate(() => window.React?.version || 'not exposed'));
console.log('React-dom version:', await page.evaluate(() => window.ReactDOM?.version || 'not exposed'));

// 找 textarea
const ta = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').first();

// 测试1: 先清空，再逐字输入
console.log('\n=== Test 1: Click + type ===');
await ta.click();
await page.waitForTimeout(300);
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.type('ABC');
await page.waitForTimeout(500);
console.log('After Ctrl+A + type ABC:', await ta.inputValue());

// 测试2: 用 pressSequentially
console.log('\n=== Test 2: pressSequentially ===');
await ta.fill('');
await page.waitForTimeout(300);
await ta.pressSequentially('XYZ', { delay: 100 });
await page.waitForTimeout(500);
console.log('After pressSequentially XYZ:', await ta.inputValue());

// 测试3: 检查 antd TextArea 是否有特殊的 event handling
console.log('\n=== Test 3: Direct React synthetic event ===');
// React 18 uses __reactFiber$ + __reactProps$
const fiberInfo = await ta.evaluate(el => {
  const keys = Object.keys(el);
  const reactFiberKey = keys.find(k => k.startsWith('__reactFiber'));
  const reactPropsKey = keys.find(k => k.startsWith('__reactProps'));
  return {
    hasFiber: !!reactFiberKey,
    fiberKey: reactFiberKey,
    hasProps: !!reactPropsKey,
    propsKey: reactPropsKey
  };
});
console.log('React fiber info:', JSON.stringify(fiberInfo));

if (fiberInfo.hasProps) {
  const props = await ta.evaluate(el => {
    const propsKey = Object.keys(el).find(k => k.startsWith('__reactProps'));
    if (!propsKey) return null;
    const props = el[propsKey];
    return props ? { hasOnChange: !!props.onChange, onChangeType: typeof props.onChange } : null;
  });
  console.log('React props onChange:', JSON.stringify(props));
}

// 测试4: 尝试触发 antd 内部包装的 onChange
console.log('\n=== Test 4: Simulate full React text input ===');
await ta.fill('');
await page.waitForTimeout(300);

// 使用 character-by-character 输入，每次都触发 input 事件
const chars = ['H', 'E', 'L', 'L', 'O'];
for (const char of chars) {
  await ta.press(char);
  await page.waitForTimeout(100);
}
const valAfterPress = await ta.inputValue();
console.log('After individual press:', valAfterPress);

// 测试5: 点击 textarea 之外的地方触发 blur，看是否会触发任何更新
console.log('\n=== Test 5: Check if value change triggers save ===');
await ta.click();
await page.waitForTimeout(200);
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.type('NEWVALUE');
await page.waitForTimeout(300);
console.log('Before blur:', await ta.inputValue());
await ta.blur();
await page.waitForTimeout(500);
console.log('After blur:', await ta.inputValue());

// 测试6: 检查保存按钮的保存内容
console.log('\n=== Test 6: Save request body ===');
let saveBody = '';
page.on('response', async resp => {
  if (resp.url().includes('/project-weekly-plan/projects/status') && resp.request().method() === 'POST') {
    saveBody = await resp.text();
  }
});

const saveBtn = page.locator('.ant-table-row').nth(0).locator('button:has-text("保存")');
if (await saveBtn.isVisible()) {
  await saveBtn.click();
  await page.waitForTimeout(2000);
  console.log('Save response:', saveBody);
}

await browser.close();
