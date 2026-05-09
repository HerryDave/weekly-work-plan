import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');

// 登录
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

// 进入项目周计划页面
await page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).click();
await page.waitForTimeout(2500);

// 确保在项目情况 tab
const projectStatusTab = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
if (await projectStatusTab.isVisible()) {
  await projectStatusTab.click();
  await page.waitForTimeout(2000);
}

console.log('React version:', await page.evaluate(() => window.React?.version));
console.log('antd version:', await page.evaluate(() => window.antd?.version));

// 找到 textarea 并测试不同的输入方式
const textarea = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').first();
await textarea.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

// 清空现有值
await textarea.click();
await page.waitForTimeout(200);
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.press('Backspace');
await page.waitForTimeout(300);

const valAfterClear = await textarea.inputValue();
console.log('After Backspace clear:', JSON.stringify(valAfterClear));

// 方法1: 正常打字
await textarea.click();
await page.waitForTimeout(200);
await page.keyboard.type('HELLO123');
await page.waitForTimeout(500);
const valAfterType = await textarea.inputValue();
console.log('After keyboard.type():', JSON.stringify(valAfterType));

// 检查 DOM 属性 vs property
const domProps = await textarea.evaluate(el => ({
  value: el.value,
  defaultValue: el.defaultValue,
  readOnly: el.readOnly,
  disabled: el.disabled,
  className: el.className
}));
console.log('TextArea DOM props:', JSON.stringify(domProps));

// 如果上面的 type 不work，试试直接用 fill（会触发 input 事件）
await textarea.fill('FILL_TEST');
await page.waitForTimeout(500);
const valAfterFill = await textarea.inputValue();
console.log('After fill():', JSON.stringify(valAfterFill));

// 再试试 click + type（不用 Ctrl+A）
const textarea2 = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').first();
await textarea2.click();
await page.waitForTimeout(200);
// 快速三击选中
await page.mouse.click(100, 100); // 先点击别的地方
await textarea2.click();
await page.waitForTimeout(100);

console.log('\nAll tests done. Check values above.');
await browser.close();
