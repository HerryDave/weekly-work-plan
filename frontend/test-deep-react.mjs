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

// 直接导航到项目周计划
await page.goto('http://localhost:5173/project-weekly-plan');
await page.waitForTimeout(2000);

// 点击项目情况 tab
const tab = page.locator('.ant-tabs-tab').filter({ hasText: '项目情况' });
await tab.click();
await page.waitForTimeout(1500);

// 核心测试：尝试点击 table cell 内的元素并输入
console.log('=== 核心问题定位 ===');

// 检查是否有 React DevTools 报错
const reactVersion = await page.evaluate(() => {
  // 尝试获取 React 内部信息
  const root = document.getElementById('root');
  if (!root) return 'no root';
  const key = Object.keys(root).find(k => k.startsWith('__reactFiber'));
  if (!key) return 'no fiber';
  const fiber = root[key];
  return fiber?.constructor?.name || 'found';
});
console.log('React fiber type:', reactVersion);

// 检查 antd 的实际版本
const antdInfo = await page.evaluate(() => {
  // antd 组件通常会在 DOM 上留下版本标记
  const allElements = document.querySelectorAll('[class*="ant-"]');
  const versions = new Set();
  allElements.forEach(el => {
    const match = el.className.match(/antd@[\d.]+/);
    if (match) versions.add(match[0]);
  });
  return Array.from(versions).slice(0, 5);
});
console.log('antd classes found (sample):', antdInfo.slice(0, 3));

// 核心测试：找一个简单的方法来触发 onChange
// antd Input 组件通常通过内部的 <input> 或 <textarea> 元素触发 onChange
// 让我们看看是否有内部 input 元素
const textareaInfo = await page.evaluate(() => {
  const ta = document.querySelector('.ant-table-row td:nth-child(10) textarea');
  if (!ta) return 'not found';
  return {
    tagName: ta.tagName,
    value: ta.value,
    id: ta.id,
    name: ta.name,
    form: ta.form ? 'has form' : 'no form',
    // 检查是否有 antd 的内部标记
    dataAntD: Object.keys(ta.dataset).filter(k => k.startsWith('antd')),
    // 检查 children (antd sometimes uses nested structure)
    childCount: ta.children.length,
    innerHTML: ta.innerHTML.substring(0, 100)
  };
});
console.log('TextArea DOM info:', JSON.stringify(textareaInfo, null, 2));

// 检查 antd 的 rc-component 内部是否有特殊处理
const rcInputInfo = await page.evaluate(() => {
  const ta = document.querySelector('.ant-table-row td:nth-child(10) textarea');
  if (!ta) return 'not found';
  // antd Input.TextArea uses rc-textarea
  const parent = ta.parentElement;
  return {
    parentClass: parent?.className,
    parentTag: parent?.tagName,
    // 检查是否有 rc-textarea 相关的内部状态
    rcKeys: Object.keys(ta).filter(k => k.startsWith('__rc')),
    // 检查是否在 ant-input-textarea 容器内
    grandparentClass: parent?.parentElement?.className
  };
});
console.log('rc-input info:', JSON.stringify(rcInputInfo, null, 2));

// 最终方案：直接通过 React 的 onChange prop 触发
// 找到 textarea 对应的 fiber，并直接调用其 onChange
const triggerResult = await page.evaluate(() => {
  const ta = document.querySelector('.ant-table-row td:nth-child(10) textarea');
  if (!ta) return 'textarea not found';

  // 获取 React fiber
  const fiberKey = Object.keys(ta).find(k => k.startsWith('__reactFiber'));
  if (!fiberKey) return 'no fiber key';
  const fiber = ta[fiberKey];

  // 尝试通过 fiber 找到 onChange
  let onChangeFound = false;
  let detail = '';

  // React fiber 结构：return.child.sibling
  let current = fiber;
  for (let i = 0; i < 10 && current; i++) {
    if (current.memoizedProps?.onChange) {
      onChangeFound = true;
      detail = `found at depth ${i}, stateNode: ${current.stateNode?.constructor?.name}`;
      // 尝试调用
      try {
        const event = new InputEvent('input', { bubbles: true, cancelable: true, data: 'REACT_TEST' });
        current.memoizedProps.onChange(event);
        detail += ' - called successfully';
      } catch (e) {
        detail += ` - error: ${e.message}`;
      }
      break;
    }
    current = current.return;
  }

  return { onChangeFound, detail };
});
console.log('Trigger onChange result:', JSON.stringify(triggerResult, null, 2));

await browser.close();
console.log('\nDone');
