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

console.log('=== Table Select 详细检查 ===');

// 找状态列的 Select
const statusSelect = page.locator('.ant-table-row').nth(0).locator('td').nth(1).locator('.ant-select');
const ssExists = await statusSelect.count() > 0;
console.log('Status Select exists:', ssExists);

if (ssExists) {
  // 检查 Select 的 DOM 结构
  const selectDomInfo = await statusSelect.evaluate(el => {
    const reactPropsKey = Object.keys(el).find(k => k.startsWith('__reactProps'));
    const props = reactPropsKey ? el[reactPropsKey] : null;
    return {
      tagName: el.tagName,
      className: el.className,
      childrenCount: el.children.length,
      innerHTML: el.innerHTML.substring(0, 200),
      hasReactProps: !!reactPropsKey,
      onChangeType: props?.onChange ? typeof props.onChange : null,
      value: props?.value,
      // 检查 ant-select-selection 内部
      selectionInnerHTML: el.querySelector('.ant-select-selection')?.innerHTML?.substring(0, 200)
    };
  });
  console.log('Status Select DOM info:', JSON.stringify(selectDomInfo, null, 2));

  // 点击之前检查当前值
  const beforeClickHTML = await statusSelect.innerHTML();
  console.log('Before click HTML:', beforeClickHTML.substring(0, 200));

  // 点击
  await statusSelect.click();
  await page.waitForTimeout(1000);

  // 检查点击后的状态
  const afterClickHTML = await statusSelect.evaluate(el => el.innerHTML.substring(0, 300));
  console.log('After click HTML:', afterClickHTML);

  // 检查所有下拉框
  const allDropdowns = await page.evaluate(() => {
    const drops = document.querySelectorAll('.ant-select-dropdown');
    return Array.from(drops).map(d => ({
      class: d.className,
      style: d.getAttribute('style'),
      visible: d.offsetParent !== null,
      rect: d.getBoundingClientRect()
    }));
  });
  console.log('All dropdowns after click:', JSON.stringify(allDropdowns, null, 2));

  // 检查 ant-select-open 类
  const hasOpenClass = await statusSelect.evaluate(el => el.classList.contains('ant-select-open'));
  console.log('Has ant-select-open class:', hasOpenClass);

  // 检查 isFocus
  const hasFocus = await statusSelect.evaluate(el => el.classList.contains('ant-select-focused'));
  console.log('Has ant-select-focused class:', hasFocus);

  // 如果下拉可见，测试选择
  const openDropdown = page.locator('.ant-select-dropdown:visible');
  const dropdownCount = await openDropdown.count();
  console.log('Visible dropdowns count:', dropdownCount);

  if (dropdownCount > 0) {
    const optionsInfo = await openDropdown.first().evaluate(dropdown => {
      const items = dropdown.querySelectorAll('.ant-select-item');
      return Array.from(items).map(item => ({
        text: item.textContent?.trim(),
        class: item.className,
        rect: item.getBoundingClientRect()
      }));
    });
    console.log('Dropdown options:', JSON.stringify(optionsInfo, null, 2));

    // 点击第一个选项
    if (optionsInfo.length > 0) {
      const firstOption = openDropdown.first().locator('.ant-select-item').first();
      await firstOption.click();
      await page.waitForTimeout(500);

      // 检查值是否更新
      const afterSelectHTML = await statusSelect.innerHTML();
      console.log('After select HTML:', afterSelectHTML.substring(0, 200));

      const selectedItem = await statusSelect.locator('.ant-select-selection-item').textContent().catch(() => 'null');
      console.log('Selected item text:', selectedItem);
    }
  } else {
    console.log('No visible dropdown found - dropdown may be hidden or positioned off-screen');

    // 检查所有 dropdown 的位置
    const allDrops = await page.evaluate(() => {
      const drops = document.querySelectorAll('.ant-select-dropdown');
      return Array.from(drops).map(d => {
        const rect = d.getBoundingClientRect();
        return {
          class: d.className.substring(0, 50),
          rect,
          inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth
        };
      });
    });
    console.log('All dropdowns positions:', JSON.stringify(allDrops, null, 2));
  }
}

await browser.close();
console.log('\nDone');
