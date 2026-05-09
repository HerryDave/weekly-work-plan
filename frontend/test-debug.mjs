import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Capture actual save request body
let lastSaveBody = '';
page.on('response', async resp => {
  if (resp.url().includes('/project-weekly-plan/projects/status') && resp.request().method() === 'POST') {
    lastSaveBody = await resp.text();
  }
});

await page.goto('http://localhost:5175');
await page.waitForLoadState('networkidle');
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);
await page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).click();
await page.waitForTimeout(2000);

// Get current values
const riskTa = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea');
const initialVal = await riskTa.inputValue();
console.log('Initial risk value:', JSON.stringify(initialVal));

// Now simulate a real user: focus textarea, select all, type new value
await riskTa.scrollIntoViewIfNeeded();
await riskTa.click();
await page.waitForTimeout(300);

// Press Ctrl+A to select all, then type new value
await page.keyboard.press('Control+a');
await page.waitForTimeout(100);
await page.keyboard.type('BROWSER TEST RISK VALUE');
await page.waitForTimeout(500);

const afterTypeVal = await riskTa.inputValue();
console.log('After typing:', JSON.stringify(afterTypeVal));

// Save
console.log('\n=== Saving ===');
const saveBtn = page.locator('.ant-table-row').nth(0).locator('td').nth(12).locator('button');
await saveBtn.click();
await page.waitForTimeout(2000);

const msg = await page.locator('.ant-message').textContent().catch(() => null);
console.log('Message:', msg);
console.log('Save response:', lastSaveBody);

// Refresh and verify
console.log('\n=== Verifying persistence ===');
await page.reload();
await page.waitForLoadState('networkidle');
await page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).click();
await page.waitForTimeout(2000);

const riskTa2 = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea');
const refreshedVal = await riskTa2.inputValue();
console.log('After refresh:', JSON.stringify(refreshedVal));

if (refreshedVal === 'BROWSER TEST RISK VALUE') {
  console.log('\n✅ SUCCESS: Value persisted correctly!');
} else {
  console.log('\n❌ FAILED: Value did not persist. Expected "BROWSER TEST RISK VALUE"');
}

await browser.close();
