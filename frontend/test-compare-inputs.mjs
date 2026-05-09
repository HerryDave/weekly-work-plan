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

// 进入项目周计划页面
await page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).click();
await page.waitForTimeout(2000);

// 点击项目情况 tab
const tab = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
await tab.click();
await page.waitForTimeout(1500);

// 测试1: 查找页面上的 DatePicker（顶部筛选栏），看它是否能用
console.log('=== Test: DatePicker in toolbar ===');
const datePicker = page.locator('.ant-picker').first();
const dpVisible = await datePicker.isVisible();
console.log('DatePicker visible:', dpVisible);
if (dpVisible) {
  await datePicker.click();
  await page.waitForTimeout(500);
  const dropdown = page.locator('.ant-picker-dropdown').first();
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  console.log('DatePicker dropdown visible:', dropdownVisible);
  if (dropdownVisible) {
    await page.keyboard.press('Escape');
  }
}

// 测试2: 查找顶部室组筛选的 Select
console.log('\n=== Test: Group Select in toolbar ===');
const groupSelect = page.locator('.ant-select').first();
const gsVisible = await groupSelect.isVisible();
console.log('Group Select visible:', gsVisible);
if (gsVisible) {
  await groupSelect.click();
  await page.waitForTimeout(500);
  const dropdown = page.locator('.ant-select-dropdown').first();
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  console.log('Select dropdown visible:', dropdownVisible);
  if (dropdownVisible) {
    const firstOpt = dropdown.locator('.ant-select-item').first();
    const optText = await firstOpt.textContent();
    console.log('First option:', optText);
    await firstOpt.click();
    await page.waitForTimeout(300);
    const selectedText = await groupSelect.locator('.ant-select-selection-item').textContent().catch(() => null);
    console.log('Selected value:', selectedText);
  }
}

// 测试3: Table 行内 Select（状态列）
console.log('\n=== Test: Table row Select ===');
const tableSelect = page.locator('.ant-table-row').nth(0).locator('td').nth(1).locator('.ant-select');
const tsVisible = await tableSelect.isVisible();
console.log('Table Select visible:', tsVisible);
if (tsVisible) {
  await tableSelect.click();
  await page.waitForTimeout(500);
  const dropdown = page.locator('.ant-select-dropdown').first();
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  console.log('Table Select dropdown visible:', dropdownVisible);
  if (dropdownVisible) {
    const options = dropdown.locator('.ant-select-item');
    const optCount = await options.count();
    console.log('Options count:', optCount);
    for (let i = 0; i < Math.min(optCount, 3); i++) {
      console.log(`  Option ${i}:`, await options.nth(i).textContent());
    }
    // 点击第二个选项（有风险）
    if (optCount > 1) {
      await options.nth(1).click();
      await page.waitForTimeout(500);
      const selectedText = await tableSelect.locator('.ant-select-selection-item').textContent().catch(() => 'null');
      console.log('After click, selected:', selectedText);
    }
  }
}

// 测试4: Table 行内 TextArea（在另一个列）
console.log('\n=== Test: Table row TextArea ===');
// 尝试 dayCols 之后的 textCols
const textCols = page.locator('.ant-table-row').nth(0).locator('td').nth(9);
const textarea = textCols.locator('textarea');
const taVisible = await textarea.isVisible();
console.log('TextArea visible:', taVisible);

if (taVisible) {
  // 获取行列信息
  const taBox = await textarea.boundingBox();
  console.log('TextArea position:', taBox);

  // 聚焦
  await textarea.focus();
  await page.waitForTimeout(300);

  // 检查焦点
  const focusedClass = await page.evaluate(() => document.activeElement?.className);
  console.log('Focused element class:', focusedClass?.substring(0, 50));

  // 尝试不同的输入方式
  await page.keyboard.type('T1');
  await page.waitForTimeout(300);
  const val1 = await textarea.inputValue();
  console.log('After keyboard.type("T1"):', val1);

  // 清空重试
  await textarea.fill('');
  await page.waitForTimeout(300);
  const val2 = await textarea.inputValue();
  console.log('After fill(""):', val2);

  // 试试在 textarea 内部直接用 mouse click
  if (taBox) {
    await page.mouse.click(taBox.x + taBox.width / 2, taBox.y + taBox.height / 2);
    await page.waitForTimeout(200);
    await page.keyboard.type('T2');
    await page.waitForTimeout(300);
    const val3 = await textarea.inputValue();
    console.log('After mouse click + type("T2"):', val3);
  }
}

// 测试5: 同一个 React 版本在 Efforts 页面测试（非 Table）
console.log('\n=== Test: Efforts page TextArea ===');
await page.locator('.ant-menu-item').filter({ hasText: '人员投入' }).click();
await page.waitForTimeout(2000);

// 检查 efforts 页面是否有 textarea
const effortsTextareas = page.locator('textarea');
const effTaCount = await effortsTextareas.count();
console.log('Efforts page textarea count:', effTaCount);

if (effTaCount > 0) {
  const effTa = effortsTextareas.first();
  await effTa.fill('efforts test');
  await page.waitForTimeout(500);
  const effVal = await effTa.inputValue();
  console.log('Efforts textarea value after fill:', effVal);
}

await browser.close();
console.log('\nDone');
