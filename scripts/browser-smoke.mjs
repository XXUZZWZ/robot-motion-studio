import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], checks = [], memorySamples = [];
let simulator;
page.on('pageerror', error => errors.push(error.message));
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const waitText = (selector, text) => page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent?.includes(text), { selector, text }, { timeout: 15000 });
async function launchTestSimulator() {
  const child = spawn(process.execPath, ['server/simulator.mjs'], { env: { ...process.env, SIM_PORT: '3102' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test simulator startup timeout')), 10000);
    child.stdout.on('data', data => { if (String(data).includes('20 Hz')) { clearTimeout(timer); resolve(); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { if (code) { clearTimeout(timer); reject(new Error(`test simulator exit ${code}`)); } });
  });
  return child;
}
try {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3100/studio', { waitUntil: 'networkidle', timeout: 60000 });
  await waitText('.viewport-info', '模型已就绪');
  assert.equal(await page.locator('canvas').count(), 1);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/studio-desktop.png', fullPage: true });
  check('URDF model loads in WebGL without page errors');

  const previousTip = await page.locator('.tip-readout').innerText();
  await page.getByLabel('肩部俯仰角度数值', { exact: true }).fill('-');
  await page.getByLabel('肩部俯仰角度数值', { exact: true }).pressSequentially('30');
  await page.getByLabel('肩部俯仰角度数值', { exact: true }).press('Tab');
  assert.equal(Number(await page.getByLabel('肩部俯仰角度数值', { exact: true }).inputValue()), -30);
  await page.waitForFunction(text => document.querySelector('.tip-readout').innerText !== text, previousTip);
  await page.getByLabel('肩部俯仰角度数值', { exact: true }).fill('45');
  assert.equal(Number(await page.getByLabel('肩部俯仰角度数值', { exact: true }).inputValue()), 45);
  await page.getByRole('button', { name: '记录姿态', exact: true }).click();
  await waitText('[role=status]', '已更新');
  check('joint control and existing keyframe update');

  await page.getByLabel('播放位置', { exact: true }).evaluate(el => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '3');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitText('[data-testid=current-time]', '3.00');
  await page.getByLabel('肩部俯仰角度数值', { exact: true }).fill('60');
  await page.getByRole('button', { name: '记录姿态', exact: true }).click();
  await waitText('.timeline-title', '6 个关键帧');
  await page.getByLabel('关键帧时间', { exact: true }).fill('3.5');
  await page.getByLabel('关键帧时间', { exact: true }).press('Tab');
  await waitText('[data-testid=current-time]', '3.50');
  check('seek, record new keyframe and retime');

  await page.getByRole('button', { name: '播放动作', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid=current-time]').textContent) > 3.7);
  await page.getByRole('button', { name: '暂停动作', exact: true }).click();
  const pausedTime = await page.getByTestId('current-time').textContent();
  await page.waitForTimeout(250);
  assert.equal(await page.getByTestId('current-time').textContent(), pausedTime);
  check('playback advances and pause holds time');

  await page.getByRole('button', { name: 'J1 3.50秒关键帧', exact: true }).click();
  assert.equal(Number(await page.getByLabel('肩部俯仰角度数值', { exact: true }).inputValue()), 60);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await waitText('.timeline-title', '6 个关键帧');
  await page.getByRole('button', { name: 'J1 3.50秒关键帧', exact: true }).click();
  assert.equal(Number(await page.getByLabel('肩部俯仰角度数值', { exact: true }).inputValue()), 60);
  check('local save and restore retain edited pose');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出动作', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.keyframes.length, 6);
  assert.equal(exported.modelId, 'rms-arm-6');
  const invalid = structuredClone(exported); invalid.keyframes[0].pose.joint_1 = 999;
  await page.getByLabel('导入动作文件', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await waitText('[role=status]', '超出关节限位');
  exported.name = '导入验证动作';
  await page.getByLabel('导入动作文件', { exact: true }).setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await waitText('[role=status]', '已导入');
  assert.equal(await page.getByLabel('动作名称', { exact: true }).inputValue(), '导入验证动作');
  check('JSON export, invalid import rejection and valid import');

  await page.getByRole('button', { name: 'J1 3.50秒关键帧', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await waitText('.timeline-title', '5 个关键帧');
  check('delete selected keyframe');

  await page.getByRole('button', { name: '显示关节坐标轴', exact: true }).click();
  await page.getByRole('button', { name: '显示关节坐标轴', exact: true }).click();
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '重新加载模型', exact: true }).click();
    await waitText('.viewport-info', '模型已就绪');
    await page.waitForTimeout(1300);
    memorySamples.push(Number((await page.locator('.status-bar').innerText()).match(/(\d+) geometries/)[1]));
    console.log(`Geometry sample ${i}: ${memorySamples.at(-1)}`);
  }
  assert.ok(Math.max(...memorySamples) - Math.min(...memorySamples) <= 2, JSON.stringify(memorySamples));
  check('model reload keeps geometry count stable');

  simulator = await launchTestSimulator();
  await page.getByLabel('WebSocket 地址', { exact: true }).fill('ws://127.0.0.1:3102');
  await page.getByRole('button', { name: '连接模拟设备', exact: true }).click();
  await waitText('.mode-badge', '实时监看');
  assert.ok(await page.getByLabel('肩部俯仰角度数值', { exact: true }).isDisabled());
  const angle = await page.getByLabel('肩部俯仰角度数值', { exact: true }).inputValue();
  await page.waitForTimeout(450);
  assert.notEqual(await page.getByLabel('肩部俯仰角度数值', { exact: true }).inputValue(), angle);
  check('real WebSocket stream moves model and locks editing');
  simulator.kill(); simulator = undefined;
  await waitText('.device-card', '连接中断');
  simulator = await launchTestSimulator();
  await waitText('.mode-badge', '实时监看');
  await page.getByRole('button', { name: '断开连接', exact: true }).click();
  assert.ok(await page.getByLabel('肩部俯仰角度数值', { exact: true }).isEnabled());
  check('automatic reconnect after server restart and manual disconnect');

  await page.getByRole('button', { name: '学习指南', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '关闭学习指南', exact: true }).click();
  check('learning dialog opens and closes');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByRole('button', { name: '学习指南', exact: true }).isVisible());
  await page.screenshot({ path: 'artifacts/studio-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('mobile layout has no horizontal overflow');
  assert.deepEqual(errors, []);
  await writeFile('artifacts/browser-checks.json', JSON.stringify({ checks, errors, memorySamples, note: 'Headless Edge; functional checks, not a hardware performance benchmark.' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, memorySamples, errors }));
} catch (error) {
  console.error(error.stack);
  console.error(JSON.stringify({ checks, errors, memorySamples }));
  await page.screenshot({ path: 'artifacts/smoke-failure.png', fullPage: true });
  await writeFile('artifacts/browser-failure.json', JSON.stringify({ error: error.message, checks, errors, memorySamples }, null, 2));
  process.exitCode = 1;
} finally {
  simulator?.kill();
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  process.exit(process.exitCode || 0);
}
