import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
try {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3100', { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByText('模型已就绪', { exact: false }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: 'artifacts/studio-desktop.png', fullPage: true });
  const report = { errors, text: await page.locator('body').innerText(), canvas: await page.locator('canvas').count() };
  await writeFile('artifacts/first-inspection.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
