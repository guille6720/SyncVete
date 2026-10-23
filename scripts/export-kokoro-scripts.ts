import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { listTutorials } from '../packages/shared/src/tutorials/registry';
import { normalizeSpokenText } from '../packages/shared/src/tutorials/spoken-text';
import { VOICE_PREVIEW_SAMPLE } from '../apps/web/src/lib/tutorials/voice-profiles';

const texts = new Set<string>();
const add = (text: string) => texts.add(normalizeSpokenText(text.trim()));
for (const tutorial of listTutorials()) {
  for (const step of tutorial.steps) add(step.narration?.trim() || step.body);
  for (const scene of tutorial.demoScenes ?? []) if (scene.narration) add(scene.narration);
  for (const scene of tutorial.videoScenes ?? []) add(scene.narration);
}
add(VOICE_PREVIEW_SAMPLE);
const clips = [...texts].sort().map((text) => ({
  text,
  id: createHash('sha256').update(text).digest('hex').slice(0, 24),
}));
mkdirSync('.kokoro', { recursive: true });
writeFileSync('.kokoro/scripts.json', JSON.stringify(clips, null, 2));
console.log(`${listTutorials().length} tutorials, ${clips.length} unique scripts`);
