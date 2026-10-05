import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
const route = path.resolve('apps/web/src/app/portal/activar/visual/page.tsx');
await mkdir(path.dirname(route), { recursive: true });
await copyFile('apps/web/e2e/fixtures/owner-app-visual.tsx', route);
const server = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    'apps/web',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3017',
  ],
  { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
);
let logs = '';
server.stdout.on('data', (chunk) => {
  logs += chunk;
});
server.stderr.on('data', (chunk) => {
  logs += chunk;
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(logs)), 30000);
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Dev server exited ${code}: ${logs}`));
    });
  });
  browser = await chromium.launch({
    executablePath: process.env.OWNER_APP_CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  await mkdir('docs/owner-app/screenshots', { recursive: true });
  for (const width of [390, 1440]) {
    for (const view of ['home', 'install', 'all']) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`http://127.0.0.1:3017/portal/activar/visual?view=${view}`, {
        waitUntil: 'networkidle',
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      if (overflow || errors.length)
        throw new Error(JSON.stringify({ width, view, overflow, errors }));
      if (view === 'install') {
        await page.getByRole('button', { name: 'Instalar app-IMILVET' }).click();
        await page.getByText('En iPhone, abrí el enlace en Safari').waitFor();
        if (await page.getByText('Registrá tu clínica').count())
          throw new Error('Administrative registration leaked into owner login');
      } else {
        await page.getByRole('navigation', { name: 'App del propietario' }).waitFor();
        for (const name of ['Inicio', 'Mascotas', 'Salud', 'Turnos', 'Avisos'])
          await page
            .getByRole('navigation', { name: 'App del propietario' })
            .getByRole('link', { name, exact: true })
            .waitFor();
      }
      if (view === 'all') {
        await page.getByRole('button', { name: 'Confirmar turno' }).waitFor();
        await page.getByRole('button', { name: 'Mes siguiente' }).click();
        await page.getByRole('button', { name: 'Mes anterior' }).click();
      }
      await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
      await page.screenshot({
        path: `docs/owner-app/screenshots/owner-${view}-${width}.png`,
        fullPage: true,
      });
      console.log(JSON.stringify({ width, view, overflow, errors, status: 'passed' }));
      await page.close();
    }
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await unlink(route);
  await unlink(path.resolve('apps/web/.next/types/app/portal/activar/visual/page.ts')).catch(
    (error) => {
      if (error.code !== 'ENOENT') throw error;
    }
  );
}
