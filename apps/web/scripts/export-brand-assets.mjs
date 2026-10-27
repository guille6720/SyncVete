import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const source = process.argv[2] ?? path.join(publicDir, 'brand/logo.png');
const master = await readFile(source);
const logoPath = path.join(publicDir, 'brand/logo.png');

await sharp(master).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(logoPath);
await copyFile(logoPath, path.join(publicDir, 'brand/logo-dark.png'));

async function exportIcon(filename, size) {
  const inner = Math.round(size * 0.8);
  const before = Math.floor((size - inner) / 2);
  const after = size - inner - before;
  await sharp(master)
    .resize(inner, inner)
    .extend({ top: before, bottom: after, left: before, right: after, background: '#0f1714' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, filename));
}

await exportIcon('icons/syncvete-192.png', 192);
await exportIcon('icons/syncvete-512.png', 512);
await exportIcon('icons/syncvete-maskable-512.png', 512);
await exportIcon('icons/apple-touch-icon.png', 180);
await exportIcon('favicon.png', 32);

const icon = await readFile(path.join(publicDir, 'icons/syncvete-512.png'));
await writeFile(
  path.join(publicDir, 'icons/syncvete.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>SyncVete</title><image width="512" height="512" href="data:image/png;base64,${icon.toString('base64')}"/></svg>\n`
);
console.log('Updated shared logos, installed-app icons, Apple icon and favicon.');
