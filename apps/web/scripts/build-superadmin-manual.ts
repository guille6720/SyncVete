/**
 * Regenera el HTML y el PDF del manual Superadmin en public/manual/
 *
 * npx tsx --tsconfig scripts/tsconfig.json scripts/build-superadmin-manual.ts
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { MANUAL_CSS } from '../src/components/manual/manual-css';
import { SuperadminManual } from '../src/components/manual/superadmin-manual';

const ASSETS: Array<[src: string, mime: string]> = [['/brand/logo.png', 'image/png']];

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(webRoot, 'public');
const outHtml = path.join(publicDir, 'manual', 'manual-superadmin-syncvete.html');
const outPdf = path.join(publicDir, 'manual', 'manual-superadmin-syncvete.pdf');

function inlineAssets(html: string) {
  let out = html;
  for (const [src, mime] of ASSETS) {
    const filePath = path.join(publicDir, src.replace(/^\//, ''));
    if (!existsSync(filePath)) continue;
    const buf = readFileSync(filePath);
    out = out.split(src).join(`data:${mime};base64,${buf.toString('base64')}`);
  }
  return out;
}

async function writePdf(htmlPath: string, pdfPath: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '10mm', bottom: '14mm', left: '10mm' },
  });
  await browser.close();
}

async function main() {
  const body = renderToStaticMarkup(createElement(SuperadminManual));
  const html = `<!DOCTYPE html><html lang="es-AR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Manual Superadmin · SyncVete</title><style>${MANUAL_CSS}</style></head><body>${body}</body></html>`;

  mkdirSync(path.dirname(outHtml), { recursive: true });
  writeFileSync(outHtml, inlineAssets(html), 'utf8');
  console.log(`Wrote ${outHtml}`);

  await writePdf(outHtml, outPdf);
  console.log(`Wrote ${outPdf}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
