import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const apiCalls = [];
page.on('response', async (resp) => {
  if (resp.url().includes('/api/v1/')) {
    const body = await resp.text().catch(() => '');
    apiCalls.push({ url: resp.url(), status: resp.status(), body: body.substring(0, 200) });
  }
});

await page.goto('http://localhost:5173/plans', { timeout: 10000, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 800));
console.log('Body:', bodyText);
console.log('API calls:', JSON.stringify(apiCalls.slice(0, 8), null, 2));

await browser.close();
