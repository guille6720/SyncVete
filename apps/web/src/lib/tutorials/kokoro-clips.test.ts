import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listTutorials, NARRATION_VOICE_PROFILES } from '@sincvete/shared';
import { getKokoroClipPath, hasKokoroClips } from './kokoro-clips';
import { VOICE_PREVIEW_SAMPLE } from './voice-profiles';

describe('Kokoro tutorial catalog', () => {
  it('contains both voices for every guided, demo, video and preview script', () => {
    expect(hasKokoroClips()).toBe(true);
    const scripts = [VOICE_PREVIEW_SAMPLE];
    for (const tutorial of listTutorials()) {
      scripts.push(...tutorial.steps.map((step) => step.narration?.trim() || step.body));
      scripts.push(
        ...(tutorial.demoScenes ?? []).flatMap((scene) =>
          scene.narration ? [scene.narration] : []
        )
      );
      scripts.push(...(tutorial.videoScenes ?? []).map((scene) => scene.narration));
    }
    for (const text of scripts) {
      for (const voice of NARRATION_VOICE_PROFILES) {
        const url = getKokoroClipPath(text, voice);
        expect(url, text).toMatch(/^\/academia\/kokoro\/v2\/em_(alex|santa)\/[a-f0-9]{24}\.mp3$/);
        const file = path.join(process.cwd(), 'public', url!);
        expect(existsSync(file), file).toBe(true);
        expect(readFileSync(file).length).toBeGreaterThan(1000);
      }
    }
  });

  it('does not send unknown text or patient data to a synthesis service', () => {
    expect(getKokoroClipPath('Un paciente privado no forma parte del guion', 'brian')).toBeNull();
    expect(getKokoroClipPath('__proto__', 'brian')).toBeNull();
    expect(getKokoroClipPath('', 'brian')).toBeNull();
  });

  it('normalizes brand spelling and preserves legacy voice preferences', () => {
    expect(getKokoroClipPath(VOICE_PREVIEW_SAMPLE, 'brian')).toContain('/em_alex/');
    expect(getKokoroClipPath(VOICE_PREVIEW_SAMPLE, 'horacio')).toContain('/em_santa/');
  });
});
