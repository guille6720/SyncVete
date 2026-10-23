import { chromium } from '@playwright/test';
import { mkdir, copyFile, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const output = path.resolve('docs/owner-app/screenshots');
const fixtureRoute = path.resolve('apps/web/src/app/portal/activar/visual/page.tsx');
try {
  await access(fixtureRoute);
  throw new Error('The fixture route already exists; refusing to overwrite it');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(path.dirname(fixtureRoute), { recursive: true });
await copyFile(path.resolve('apps/web/e2e/fixtures/owner-app-visual.tsx'), fixtureRoute);
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.OWNER_APP_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-breakpad', '--disable-crash-reporter'],
  });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().startsWith('http://localhost:3017'))
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto('http://localhost:3017/portal/activar/visual', { waitUntil: 'networkidle' });
    await page.getByText('app-IMILVET', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Confirmar turno' }).waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    const failedImages = await page
      .locator('img')
      .evaluateAll((images) =>
        images
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.src)
      );
    if (overflow || errors.length || failedImages.length)
      throw new Error(JSON.stringify({ viewport, overflow, errors, failedImages }));
    await page.screenshot({
      path: path.join(output, `owner-app-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    console.log(JSON.stringify({ viewport, overflow, errors, failedImages, status: 'passed' }));
    await page.close();
  }
} finally {
  await browser?.close();
  await unlink(fixtureRoute);
  await unlink(path.resolve('apps/web/.next/types/app/portal/activar/visual/page.ts')).catch(
    (error) => {
      if (error.code !== 'ENOENT') throw error;
    }
  );
  await promisify(execFile)(process.execPath, [
    path.resolve('node_modules/next/dist/bin/next'),
    'typegen',
    'apps/web',
  ]);
}
