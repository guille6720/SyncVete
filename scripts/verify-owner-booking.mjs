import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
// Exercise the real booking component; SQL integration tests verify the server boundary.
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {OwnerProfessionalBooking} from '@/components/portal/owner-professional-booking';
      const slots=['one','two'].map(id=>({schedule_id:'schedule-'+id,professional_id:'professional-'+id,professional_name:id==='one'?'Dra. Ana':'Dr. Pedro',branch_name:'IMILVET',branch_id:'branch',starts_at:'2026-10-06T18:00:00Z',ends_at:'2026-10-06T18:30:00Z'})); slots.push({...slots[1],starts_at:'2026-10-06T18:30:00Z',ends_at:'2026-10-06T19:00:00Z'});
      createRoot(document.getElementById('root')).render(<OwnerProfessionalBooking patients={[{id:'pet-luna',name:'Luna',isDeceased:false}]} availability={{date:'2026-10-06',minDate:'2026-10-05',maxDate:'2026-11-04',timezone:'America/Argentina/Buenos_Aires',professionals:[{id:'professional-one',name:'Dra. Ana',specialty:'Clínica'},{id:'professional-two',name:'Dr. Pedro',specialty:null}],slots}}/>);`,
    loader: 'tsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { '@': path.resolve('apps/web/src') },
  plugins: [
    {
      name: 'mock-booking-action',
      setup(builder) {
        builder.onResolve({ filter: /^@\/actions\/owner-app$/ }, () => ({
          path: 'action',
          namespace: 'test',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
          contents: `export async function bookOwnerProfessionalSlot(previous,form){ window.bookingPayload=Object.fromEntries(form.entries()); return {success:true}; }`,
          loader: 'js',
        }));
      },
    },
  ],
});
const cssRoot = 'apps/web/.next/static/css';
const cssFiles = (await readdir(cssRoot, { recursive: true })).filter((file) =>
  file.endsWith('.css')
);
const css = (
  await Promise.all(cssFiles.map((file) => readFile(path.join(cssRoot, file), 'utf8')))
).join('\n');
const output = process.env.OWNER_APP_SCREENSHOT_DIR || '/tmp/owner-agenda-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.OWNER_APP_CHROME_PATH,
  headless: true,
  args: [
    '--no-sandbox',
    '--single-process',
    '--no-zygote',
    '--in-process-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
try {
  const page = await browser.newPage();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent(
      '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main id="root" style="max-width:640px;margin:24px auto;padding:16px"></main></body></html>'
    );
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel('Profesional', { exact: true }).selectOption('professional-two');
    await page.getByLabel('Horario disponible').selectOption('schedule-two:2026-10-06T18:30:00Z');
    if ((await page.locator('input[name="professional"]').inputValue()) !== 'professional-two')
      throw new Error('Professional selection lost when changing date');
    await page.getByRole('button', { name: 'Confirmar turno' }).click();
    await page.getByRole('status').filter({ hasText: 'Turno confirmado' }).waitFor();
    const payload = await page.evaluate(() => window.bookingPayload);
    if (
      JSON.stringify(payload) !==
      JSON.stringify({
        scheduleId: 'schedule-two',
        startsAt: '2026-10-06T18:30:00Z',
        patientId: 'pet-luna',
      })
    )
      throw new Error(JSON.stringify(payload));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    if (overflow || errors.length) throw new Error(JSON.stringify({ overflow, errors }));
    await page.screenshot({ path: `${output}/owner-professionals-${width}.png`, fullPage: true });
    console.log(
      JSON.stringify({
        width,
        professionalSelection: true,
        bookingPayload: true,
        confirmation: true,
        overflow,
        errors,
      })
    );
  }
} finally {
  await browser.close();
}
