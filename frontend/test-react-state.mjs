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

// 使用 evaluate 直接操作 React 状态（绕过 onChange 问题）
console.log('=== 直接通过 React state 修改 ===');
const stateUpdate = await page.evaluate(() => {
  // 找到 React 组件实例
  const root = document.querySelector('#root');
  const keys = Object.keys(root).filter(k => k.startsWith('_react') || k.startsWith('__react'));
  return { keys, rootChildren: root?.children.length };
});
console.log('React root info:', JSON.stringify(stateUpdate));

// 尝试使用 page.evaluate 注入原生 input 事件
console.log('\n=== TextArea 原生事件测试 ===');
const textarea = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').first();
const textareaExists = await textarea.count() > 0;
console.log('TextArea found:', textareaExists);

if (textareaExists) {
  // 方法1: 使用 focus + type（React 应该能捕获）
  await textarea.click();
  await page.waitForTimeout(300);

  // 全选删除
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(100);

  // 使用 keyboard.type 输入
  await page.keyboard.type('REACT_TEST_INPUT');
  await page.waitForTimeout(500);

  const value = await textarea.inputValue();
  console.log('TextArea value after keyboard.type:', value);

  // 触发 blur 让 React 捕获变化
  await textarea.blur();
  await page.waitForTimeout(500);

  const valueAfterBlur = await textarea.inputValue();
  console.log('TextArea value after blur:', valueAfterBlur);
}

// 现在检查 Select
console.log('\n=== Select 原生事件测试 ===');
const select = page.locator('.ant-table-row').nth(0).locator('td').nth(1).locator('.ant-select').first();
const selectExists = await select.count() > 0;
console.log('Select found:', selectExists);

if (selectExists) {
  await select.click();
  await page.waitForTimeout(500);

  // 检查下拉是否出现
  const dropdown = page.locator('.ant-select-dropdown').first();
  const dropdownVisible = await dropdown.isVisible().catch(() => false);
  console.log('Dropdown visible:', dropdownVisible);

  if (dropdownVisible) {
    // 点击第一个选项
    const firstOption = dropdown.locator('.ant-select-item').first();
    const optionText = await firstOption.textContent();
    console.log('First option text:', optionText);
    await firstOption.click();
    await page.waitForTimeout(500);

    // 检查选中值
    const selectValue = await select.locator('.ant-select-selection-item').textContent().catch(() => null);
    console.log('Selected value:', selectValue);
  }
}

// 保存测试
console.log('\n=== 保存测试 ===');
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
} else {
  console.log('Save button not visible');
}

await browser.close();
