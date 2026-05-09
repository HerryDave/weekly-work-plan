import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.goto('http://localhost:5173', { timeout: 15000 });
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(1000);

// 登录
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

// 直接导航
await page.goto('http://localhost:5173/project-weekly-plan');
await page.waitForTimeout(2000);

// 点击项目情况 tab
const tab = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
await tab.click();
await page.waitForTimeout(1500);

// 找到 risk_desc 的 textarea（td:nth-child(10)）
const riskTextarea = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea');

// 检查当前值
const initialVal = await riskTextarea.inputValue();
console.log('Initial risk_desc value:', JSON.stringify(initialVal));

// 拦截 Save 请求
let saveRequestBody = null;
page.on('request', async req => {
  if (req.url().includes('/project-weekly-plan/projects/status') && req.method() === 'POST') {
    saveRequestBody = await req.postDataJSON();
  }
});

// 方法1: 使用 fill()
console.log('\n=== Test: fill() ===');
await riskTextarea.fill('FILLED_VALUE');
await page.waitForTimeout(500);
const afterFill = await riskTextarea.inputValue();
console.log('After fill("FILLED_VALUE"):', JSON.stringify(afterFill));

// 保存
const saveBtn = page.locator('.ant-table-row').nth(0).locator('button:has-text("保存")');
await saveBtn.click();
await page.waitForTimeout(2000);
console.log('After save, request body risk_desc:', saveRequestBody?.risk_desc);

// 方法2: 刷新页面，检查是否真的保存了
console.log('\n=== Reload and verify ===');
await page.reload();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

const tab2 = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
await tab2.click();
await page.waitForTimeout(1500);

const afterReloadVal = await page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').inputValue();
console.log('After reload, risk_desc:', JSON.stringify(afterReloadVal));

// 方法3: 尝试 keyboard.type
console.log('\n=== Test: keyboard.type ===');
const riskTa3 = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea');
await riskTa3.click();
await page.waitForTimeout(300);
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.type('KEYBOARD_TYPED');
await page.waitForTimeout(500);
const afterType = await riskTa3.inputValue();
console.log('After Ctrl+A + type:', JSON.stringify(afterType));

// 保存
await page.locator('.ant-table-row').nth(0).locator('button:has-text("保存")').click();
await page.waitForTimeout(2000);
console.log('After keyboard save, request body risk_desc:', saveRequestBody?.risk_desc);

console.log('\nAll tests complete');
await browser.close();
