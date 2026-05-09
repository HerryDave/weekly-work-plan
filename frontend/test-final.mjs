import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// 捕获所有 console 消息
page.on('console', msg => console.log('BROWSER:', msg.text()));
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

// 检查 textarea 是否被其他元素遮挡
console.log('\n=== 检查 TextArea 遮挡 ===');
const ta = page.locator('.ant-table-row').nth(0).locator('td').nth(9).locator('textarea').first();
const taBox = await ta.boundingBox();
console.log('TextArea bounding box:', taBox);

// 检查 textarea 的 pointer-events
const taPointerEvents = await ta.evaluate(el => window.getComputedStyle(el).pointerEvents);
console.log('pointer-events:', taPointerEvents);

// 检查父容器
const parentPointerEvents = await ta.evaluate(el => {
  let parent = el.parentElement;
  let info = [];
  for (let i = 0; i < 3; i++) {
    if (!parent) break;
    const style = window.getComputedStyle(parent);
    info.push({ tag: parent.tagName, pointerEvents: style.pointerEvents, overflow: style.overflow });
    parent = parent.parentElement;
  }
  return info;
});
console.log('Parent chain:', JSON.stringify(parentPointerEvents));

// 检查是否有 fixed 或 sticky 定位的遮罩层
const overlays = await page.evaluate(() => {
  const overlays = document.querySelectorAll('[class*="mask"],[class*="overlay"],[class*="backdrop"]');
  return Array.from(overlays).map(el => ({
    tag: el.tagName,
    class: el.className,
    style: {
      position: window.getComputedStyle(el).position,
      pointerEvents: window.getComputedStyle(el).pointerEvents
    }
  }));
});
console.log('Overlays:', JSON.stringify(overlays));

// 尝试聚焦 textarea 看焦点是否真的在上面
console.log('\n=== 测试聚焦 ===');
await ta.click();
await page.waitForTimeout(300);
const focused = await page.evaluate(() => ({
  activeTag: document.activeElement?.tagName,
  activeClass: document.activeElement?.className,
  activeId: document.activeElement?.id
}));
console.log('Focused element:', JSON.stringify(focused));

// 尝试分发 input 事件（模拟真实用户输入）
console.log('\n=== 分发原生 input 事件 ===');
const inputResult = await ta.evaluate(el => {
  // 聚焦
  el.focus();

  // 模拟键盘输入 - 在 value 上直接操作并分发 input 事件
  const originalValue = el.value;
  el.setSelectionRange(originalValue.length, originalValue.length);

  // 创建并分发 input 事件
  const inputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: 'X'
  });

  // 直接设置值
  el.value = originalValue + 'X';
  el.dispatchEvent(inputEvent);

  return { value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd };
});
console.log('After dispatch:', JSON.stringify(inputResult));
await page.waitForTimeout(500);

const valueAfterDispatch = await ta.inputValue();
console.log('Value after dispatchEvent:', valueAfterDispatch);

await browser.close();
console.log('\nDone');
