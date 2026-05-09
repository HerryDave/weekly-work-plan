import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const errors = [];
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`CONSOLE ERROR: ${msg.text()}`);
});

await page.goto('http://localhost:5175');
await page.waitForLoadState('networkidle');

// Login
console.log('Logging in...');
await page.fill('input[type="text"]', 'admin');
await page.fill('input[type="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);
console.log('Current URL:', page.url());

// Find all sidebar menu items and look for the right one
const menuItems = await page.locator('.ant-menu-item, .ant-menu-submenu-title').allTextContents();
console.log('Menu items found:', menuItems);

// Click 项目周计划
const targetItem = page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).first();
const targetVisible = await targetItem.isVisible().catch(() => false);
console.log('\n项目周计划 visible:', targetVisible);

if (targetVisible) {
  await targetItem.click();
  await page.waitForTimeout(2000);
  console.log('After click URL:', page.url());
}

// Test DatePicker
const datePicker = page.locator('.ant-picker').first();
const dpVisible = await datePicker.isVisible().catch(() => false);
console.log('\nDatePicker visible:', dpVisible);

if (dpVisible) {
  await datePicker.click();
  await page.waitForTimeout(500);

  const pickerPanel = page.locator('.ant-picker-panel');
  const isVisible = await pickerPanel.isVisible().catch(() => false);
  console.log('DatePicker panel visible after click:', isVisible);

  if (isVisible) {
    const cells = page.locator('.ant-picker-cell');
    const count = await cells.count();
    console.log('Number of picker cells:', count);

    if (count > 10) {
      await cells.nth(10).click();
      await page.waitForTimeout(500);
    }

    const inputValue = await datePicker.locator('input').first().inputValue();
    console.log('DatePicker input value after selection:', inputValue);

    if (inputValue) {
      console.log('SUCCESS: DatePicker value set correctly');
    } else {
      console.log('FAIL: DatePicker value is empty after selection');
    }
  } else {
    console.log('FAIL: Picker panel did NOT open');
    const html = await datePicker.evaluate(el => el.outerHTML);
    console.log('DatePicker HTML:', html.substring(0, 500));
  }
} else {
  console.log('FAIL: DatePicker not visible');
}

// Test Select dropdowns in the table
await page.waitForTimeout(500);
const selects = page.locator('.ant-select');
const selectCount = await selects.count();
console.log('\nNumber of Select elements:', selectCount);

if (selectCount > 2) {
  const thirdSelect = selects.nth(2);
  const selVisible = await thirdSelect.isVisible().catch(() => false);
  console.log('Third select visible:', selVisible);

  if (selVisible) {
    await thirdSelect.click();
    await page.waitForTimeout(500);

    const dropdowns = await page.locator('.ant-select-dropdown:visible').count();
    console.log('Visible dropdowns:', dropdowns);

    if (dropdowns > 0) {
      const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option').count();
      console.log('Number of options:', options);
      console.log('SUCCESS: Dropdown opened correctly');
    } else {
      console.log('FAIL: No dropdown visible');
    }
  }
}

if (errors.length > 0) {
  console.log('\nErrors found:');
  errors.forEach(e => console.log(e));
} else {
  console.log('\nNo JS errors found');
}

await browser.close();
