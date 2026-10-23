import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'https://syncvete.opusorg.com';
const manifest = JSON.parse(
  readFileSync(new URL('../apps/web/src/lib/tutorials/kokoro-manifest.json', import.meta.url))
);
const paths = [...new Set(Object.values(manifest).flatMap(Object.values))];
const results = [];
const queue = [...paths];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const path = queue.shift();
      const response = await fetch(new URL(path, base), { method: 'HEAD', redirect: 'manual' });
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') ?? '', /audio\/(mpeg|mp3)/);
      assert.equal(response.headers.get('x-syncvete-tts-provider'), 'kokoro');
      results.push({
        path,
        status: response.status,
        bytes: response.headers.get('content-length'),
      });
    }
  })
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.KOKORO_BROWSER_CHANNEL || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const playback = [];
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  for (const voice of ['brian', 'horacio']) {
    const clipPath = Object.values(manifest)[0][voice];
    const result = await page.evaluate(async (path) => {
      const audio = new Audio(path);
      audio.volume = 0;
      await audio.play();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const progressed = audio.currentTime > 0;
      audio.pause();
      const pausedAt = audio.currentTime;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const paused = audio.paused && Math.abs(audio.currentTime - pausedAt) < 0.05;
      audio.playbackRate = 1.1;
      await audio.play();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const resumed = audio.currentTime > pausedAt;
      const duration = audio.duration;
      audio.pause();
      return { progressed, paused, resumed, duration, rate: audio.playbackRate };
    }, new URL(clipPath, base).href);
    assert.ok(result.progressed && result.paused && result.resumed);
    assert.ok(result.duration > 0);
    playback.push({ voice, ...result });
  }
} finally {
  await browser.close();
}
const evidence = {
  base,
  checkedAt: new Date().toISOString(),
  files: results.length,
  playback,
  results,
};
writeFileSync('.kokoro/production-verification.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ base, files: results.length, playback }, null, 2));
