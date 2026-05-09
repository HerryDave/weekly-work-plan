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

// 横向滚动到右侧，让 TextArea 进入视野
// 先看看表格的滚动容器
console.log('=== 横向滚动诊断 ===');
const scrollContainer = page.locator('.ant-table-body');
const beforeScroll = await scrollContainer.evaluate(el => ({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }));
console.log('Before scroll:', JSON.stringify(beforeScroll));

// 滚动到最右边，让最后一列（操作列）进入视野
await scrollContainer.evaluate(el => el.scrollLeft = el.scrollWidth);
await page.waitForTimeout(500);
const afterScroll = await scrollContainer.evaluate(el => ({ scrollLeft: el.scrollLeft }));
console.log('After scroll:', JSON.stringify(afterScroll));

// 现在回到左侧，检查 TextArea 区域的 overflow
await scrollContainer.evaluate(el => el.scrollLeft = 0);
await page.waitForTimeout(300);

// 检查 textarea 聚焦能力
console.log('\n=== TextArea focus test ===');
const riskTa = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea');
await riskTa.scrollIntoViewIfNeeded();
await riskTa.click();
await page.waitForTimeout(500);

const focused = await page.evaluate(() => document.activeElement?.tagName);
console.log('Focused element:', focused);

// 尝试清空并输入
await page.keyboard.press('Control+a');
await page.waitForTimeout(200);
await page.keyboard.type('CLEARED');
await page.waitForTimeout(500);
const valAfter = await riskTa.inputValue();
console.log('After Ctrl+A + type:', valAfter);

// 现在检查 antd textarea 的真实 DOM 结构
console.log('\n=== TextArea DOM 结构 ===');
const taDomInfo = await riskTa.evaluate(el => {
  return {
    tagName: el.tagName,
    value: el.value,
    disabled: el.disabled,
    readOnly: el.readOnly,
    className: el.className,
    'data-reactid': el.getAttribute('data-reactid'),
    parentClass: el.parentElement?.className,
    parentTag: el.parentElement?.tagName
  };
});
console.log('TextArea DOM:', JSON.stringify(taDomInfo, null, 2));

// 检查是否有 react 19 的特殊属性
const reactProps = await riskTa.evaluate(el => {
  const keys = Object.keys(el).filter(k => k.startsWith('__react') || k.startsWith('_react'));
  return keys;
});
console.log('React internal props:', reactProps);

// 检查 input 事件是否被触发
console.log('\n=== 监听原生 input 事件 ===');
await riskTa.click();
await page.waitForTimeout(200);
const inputEvents = [];
await page.evaluate(() => {
  const ta = document.querySelector('.ant-table-row:nth-child(1) td:nth-child(10) textarea');
  if (ta) {
    ta.addEventListener('input', (e) => {
      window._lastInputEvent = { type: e.inputType, data: e.data, targetValue: e.target.value };
    });
  }
});
await page.keyboard.press('Control+a');
await page.keyboard.type('XYZ');
await page.waitForTimeout(500);
const lastEvent = await page.evaluate(() => window._lastInputEvent);
console.log('Last input event:', JSON.stringify(lastEvent));

// 尝试保存，看发送的 body
console.log('\n=== 保存测试 ===');
let saveBody = '';
page.on('response', async resp => {
  if (resp.url().includes('/project-weekly-plan/projects/status') && resp.request().method() === 'POST') {
    saveBody = await resp.text();
  }
});
const saveBtn = page.locator('.ant-table-row').nth(0).locator('td').nth(12).locator('button');
await saveBtn.click();
await page.waitForTimeout(2000);
console.log('Save response:', saveBody);

await browser.close();
