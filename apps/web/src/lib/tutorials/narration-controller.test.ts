import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSpeechNarrationEngineForTests, SpeechNarrationEngine } from '@/lib/tutorials/speech-narration';
import {
  __resetNarrationControllerForTests,
  NarrationController,
} from '@/lib/tutorials/narration-controller';
import {
  __resetPrerecordedAudioEngineForTests,
  PrerecordedAudioEngine,
} from '@/lib/tutorials/prerecorded-audio';
import { ElevenLabsAudioEngine } from '@/lib/tutorials/elevenlabs-audio';

function voice(partial: Partial<SpeechSynthesisVoice> & { name: string; lang: string }) {
  return {
    default: false,
    localService: true,
    voiceURI: partial.name,
    ...partial,
  } as SpeechSynthesisVoice;
}

type UtteranceFake = SpeechSynthesisUtterance & {
  onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
  text: string;
};

function installSpeechMocks() {
  const utteranceCtor = vi.fn(function (this: UtteranceFake, text: string) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
  });
  vi.stubGlobal('SpeechSynthesisUtterance', utteranceCtor);

  const fakeSynth = {
    speaking: false,
    paused: false,
    getVoices: () => [voice({ name: 'Paulina', lang: 'es-AR' })],
    speak: vi.fn((utter: UtteranceFake) => {
      fakeSynth.speaking = true;
      queueMicrotask(() => utter.onstart?.(new Event('start') as SpeechSynthesisEvent));
    }),
    cancel: vi.fn(() => {
      fakeSynth.speaking = false;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  return { fakeSynth: fakeSynth as unknown as SpeechSynthesis & typeof fakeSynth, utteranceCtor };
}

function mockEleven(speakResult = false) {
  const eleven = new ElevenLabsAudioEngine();
  vi.spyOn(eleven, 'speak').mockResolvedValue(speakResult);
  vi.spyOn(eleven, 'isAvailable').mockResolvedValue(speakResult);
  vi.spyOn(eleven, 'subscribe').mockImplementation((listener) => {
    listener('idle');
    return () => undefined;
  });
  vi.spyOn(eleven, 'stop').mockImplementation(() => undefined);
  vi.spyOn(eleven, 'setMuted').mockImplementation(() => undefined);
  vi.spyOn(eleven, 'setRate').mockImplementation(() => undefined);
  vi.spyOn(eleven, 'getStatus').mockReturnValue('idle');
  return eleven;
}

describe('narration controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetNarrationControllerForTests();
    __resetSpeechNarrationEngineForTests();
    __resetPrerecordedAudioEngineForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('falls back to browser speech with SyncVete spoken as Sinc Vete when ElevenLabs is off', async () => {
    const { fakeSynth } = installSpeechMocks();
    const browser = new SpeechNarrationEngine(fakeSynth);
    const audio = new PrerecordedAudioEngine();
    const eleven = mockEleven(false);
    vi.spyOn(audio, 'probe').mockResolvedValue(false);
    const controller = new NarrationController(browser, audio, eleven);
    await browser.ensureVoices();

    const source = await controller.speak('Bienvenido a SyncVete', {
      tutorialId: 'agenda-basico',
      clipId: 'welcome',
      voiceProfile: 'brian',
    });

    expect(source).toBe('browser');
    expect(fakeSynth.speak).toHaveBeenCalled();
    const uttered = fakeSynth.speak.mock.calls.at(-1)?.[0] as UtteranceFake;
    expect(uttered.text).toContain('Sinc Vete');
    expect(uttered.text).not.toContain('SyncVete');
  });

  it('does not fall back to browser when ElevenLabs is configured but a clip fails', async () => {
    const { fakeSynth } = installSpeechMocks();
    const browser = new SpeechNarrationEngine(fakeSynth);
    const audio = new PrerecordedAudioEngine();
    const eleven = mockEleven(false);
    vi.spyOn(eleven, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(audio, 'probe').mockResolvedValue(false);
    const controller = new NarrationController(browser, audio, eleven);

    const source = await controller.speak('Texto', {
      tutorialId: 'agenda-basico',
      clipId: 'welcome',
      voiceProfile: 'brian',
    });

    expect(source).toBe('none');
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('prefers ElevenLabs when available', async () => {
    const { fakeSynth } = installSpeechMocks();
    const browser = new SpeechNarrationEngine(fakeSynth);
    const audio = new PrerecordedAudioEngine();
    const eleven = mockEleven(true);
    vi.spyOn(eleven, 'getStatus').mockReturnValue('speaking');
    const controller = new NarrationController(browser, audio, eleven);

    const source = await controller.speak('Texto', {
      tutorialId: 'agenda-basico',
      clipId: 'welcome',
      voiceProfile: 'horacio',
    });

    expect(source).toBe('elevenlabs');
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('prefers prerecorded audio when ElevenLabs is down and clip exists', async () => {
    const { fakeSynth } = installSpeechMocks();
    const browser = new SpeechNarrationEngine(fakeSynth);
    const audio = new PrerecordedAudioEngine();
    const eleven = mockEleven(false);
    vi.spyOn(audio, 'probe').mockResolvedValue(true);
    vi.spyOn(audio, 'speak').mockResolvedValue(true);
    const controller = new NarrationController(browser, audio, eleven);

    const source = await controller.speak('Texto', {
      tutorialId: 'agenda-basico',
      clipId: 'welcome',
      voiceProfile: 'brian',
    });

    expect(source).toBe('prerecorded');
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });
});
