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
await page.waitForTimeout(1500);

// 进入项目周计划页面
await page.locator('.ant-menu-item').filter({ hasText: '项目周计划' }).click();
await page.waitForTimeout(2000);

// 确保在项目情况 tab
const projectStatusTab = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
if (await projectStatusTab.isVisible()) {
  await projectStatusTab.click();
  await page.waitForTimeout(1500);
}

console.log('=== 检查 Table 容器 overflow ===');
const tableWrapper = page.locator('.ant-table-wrapper').first();
const overflowStyle = await tableWrapper.evaluate(el => {
  const style = window.getComputedStyle(el);
  return { overflow: style.overflow, overflowX: style.overflowX, overflowY: style.overflowY, position: style.position };
});
console.log('Table wrapper overflow:', JSON.stringify(overflowStyle));

// 找到第一个 Select（状态列）
console.log('\n=== 测试 Select ===');
const statusSelect = page.locator('.ant-table-row').nth(0).locator('td').nth(1).locator('.ant-select');
const selectVisible = await statusSelect.isVisible();
const selectEnabled = await statusSelect.isEnabled();
console.log('Status Select visible:', selectVisible, 'enabled:', selectEnabled);

if (selectVisible) {
  // 检查 select 父容器是否有 overflow
  const parentOverflow = await statusSelect.evaluateHandle(el => el.parentElement);
  const parentStyle = await parentOverflow.evaluate((el) => {
    let parent = el;
    let results = [];
    for (let i = 0; i < 5 && parent; i++) {
      const style = window.getComputedStyle(parent);
      results.push({
        tag: parent.tagName,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        position: style.position
      });
      parent = parent.parentElement;
    }
    return results;
  });
  console.log('Select parent chain:', JSON.stringify(parentStyle, null, 2));

  // 点击 select 看 dropdown 是否出现
  await statusSelect.click();
  await page.waitForTimeout(800);
  const dropdown = page.locator('.ant-select-dropdown:visible');
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  console.log('Dropdown visible after click:', dropdownVisible);

  // 检查 dropdown 位置
  if (dropdownVisible) {
    const dropdownBounds = await dropdown.boundingBox();
    const selectBounds = await statusSelect.boundingBox();
    console.log('Select bounds:', JSON.stringify(selectBounds));
    console.log('Dropdown bounds:', JSON.stringify(dropdownBounds));

    // dropdown 是否在可视区域内
    const viewportHeight = page.viewportSize().height;
    console.log('Viewport height:', viewportHeight);
    console.log('Dropdown bottom:', dropdownBounds?.y + dropdownBounds?.height);
    console.log('Dropdown clipped?', dropdownBounds && (dropdownBounds.y + dropdownBounds.height > viewportHeight));
  }
}

console.log('\n=== 测试 TextArea ===');
const riskTa = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea');
const taVisible = await riskTa.isVisible();
const taEnabled = await riskTa.isEnabled();
console.log('TextArea visible:', taVisible, 'enabled:', taEnabled);

if (taVisible) {
  // 检查 textarea 父容器
  const taParentStyle = await riskTa.evaluateHandle(el => el.parentElement);
  const parentStyle = await taParentStyle.evaluate((el) => {
    let parent = el;
    let results = [];
    for (let i = 0; i < 5 && parent; i++) {
      const style = window.getComputedStyle(parent);
      results.push({
        tag: parent.tagName,
        overflow: style.overflow,
        position: style.position,
        width: style.width,
        height: style.height
      });
      parent = parent.parentElement;
    }
    return results;
  });
  console.log('TextArea parent chain:', JSON.stringify(parentStyle, null, 2));

  // 尝试 fill
  await riskTa.scrollIntoViewIfNeeded();
  await riskTa.fill('test via fill()');
  await page.waitForTimeout(500);
  const valAfterFill = await riskTa.inputValue();
  console.log('Value after fill():', valAfterFill);

  // 尝试 keyboard.type
  await riskTa.click();
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('test via keyboard');
  await page.waitForTimeout(500);
  const valAfterType = await riskTa.inputValue();
  console.log('Value after keyboard.type():', valAfterType);
}

await browser.close();
