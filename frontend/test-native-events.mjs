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

console.log('=== 测试 page.evaluate 分发原生 input 事件 ===');
const textarea = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').first();

// 方法：通过 page.evaluate 分发原生事件
const nativeInputResult = await textarea.evaluate(el => {
  // 聚焦
  el.focus();

  // 分发 input 事件
  const nativeInputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: 'NATIVE_INPUT_TEST'
  });
  el.value = 'NATIVE_INPUT_TEST';
  el.dispatchEvent(nativeInputEvent);

  return { value: el.value };
});
console.log('After native input event, DOM value:', nativeInputResult.value);
await page.waitForTimeout(500);

// 检查 React state 是否更新（通过 React fiber）
const reactStateUpdated = await page.evaluate(() => {
  // 尝试读取 React 内部 state
  const root = document.querySelector('#root');
  const reactKey = Object.keys(root).find(k => k.startsWith('__reactContainer'));
  if (!reactKey) return 'no react key';
  const container = root[reactKey];
  if (!container) return 'no container';
  return 'found';
});
console.log('React fiber check:', reactStateUpdated);

console.log('\n=== 测试 Select 选择 ===');
const select = page.locator('.ant-table-row').nth(0).locator('td').nth(1).locator('.ant-select').first();
await select.click();
await page.waitForTimeout(800);

const dropdown = page.locator('.ant-select-dropdown').first();
const dropdownVisible = await dropdown.isVisible().catch(() => false);
console.log('Dropdown visible:', dropdownVisible);

if (dropdownVisible) {
  // 找到 "有风险" 选项（value="risk"）
  const riskOption = dropdown.locator('.ant-select-item').filter({ hasText: '有风险' });
  const riskOptionExists = await riskOption.count() > 0;
  console.log('Risk option exists:', riskOptionExists);

  if (riskOptionExists) {
    // 通过 evaluate 点击，绕过 React 合成事件
    await riskOption.evaluate(el => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      el.click();
    });
    await page.waitForTimeout(500);

    const selectText = await select.locator('.ant-select-selection-item').textContent().catch(() => 'null');
    console.log('Select text after evaluate click:', selectText);
  }

  // ESC 关闭下拉
  await page.keyboard.press('Escape');
}

await browser.close();
console.log('\n测试完成');
