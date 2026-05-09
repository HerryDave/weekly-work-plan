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

// 拦截 Save 请求
let saveRequestBody = null;
page.on('request', async req => {
  if (req.url().includes('/project-weekly-plan/projects/status') && req.method() === 'POST') {
    saveRequestBody = await req.postDataJSON();
    console.log('SAVE REQUEST BODY:', JSON.stringify(saveRequestBody, null, 2));
  }
});

// 找状态列的 Select
const statusSelect = page.locator('.ant-table-row').nth(0).locator('td').nth(1).locator('.ant-select');

// 点击打开下拉
await statusSelect.click();
await page.waitForTimeout(800);

// 选择第二项（有风险）
const dropdown = page.locator('.ant-select-dropdown:visible').first();
await dropdown.locator('.ant-select-item').nth(1).click();
await page.waitForTimeout(500);

// 检查 DOM 里选中的值（用新的 selector）
const selectedBadgeText = await statusSelect.locator('.ant-badge-status-text').textContent().catch(() => 'null');
console.log('Selected badge text:', selectedBadgeText);

// 立即点击保存按钮
const saveBtn = page.locator('.ant-table-row').nth(0).locator('button:has-text("保存")');
await saveBtn.click();
await page.waitForTimeout(2000);

console.log('\nFinal save request body:', JSON.stringify(saveRequestBody, null, 2));

if (saveRequestBody) {
  console.log('\nSaved status:', saveRequestBody.status);
  console.log('Expected: risk, Actual:', saveRequestBody.status);
}

await browser.close();
