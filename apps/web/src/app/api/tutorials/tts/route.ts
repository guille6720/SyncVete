import { NextResponse } from 'next/server';
import { isAcademiaEnabled } from '@/lib/tutorials/feature-flag';
import {
  getTutorialTtsProvider,
  isTutorialNeuralTtsConfigured,
  synthesizeTutorialSpeech,
} from '@/lib/tutorials/tutorial-tts';
import { NARRATION_VOICE_PROFILES, type NarrationVoiceProfileId } from '@sincvete/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isVoiceProfile(value: unknown): value is NarrationVoiceProfileId {
  return (
    typeof value === 'string' &&
    (NARRATION_VOICE_PROFILES as readonly string[]).includes(value)
  );
}

/** Lightweight probe — does not spend ElevenLabs credits. */
export async function GET() {
  if (!isAcademiaEnabled()) {
    return NextResponse.json({ configured: false }, { status: 404 });
  }
  const provider = getTutorialTtsProvider();
  return NextResponse.json({
    configured: Boolean(provider),
    provider,
    voices: ['brian', 'horacio'],
  });
}

/**
 * Tutoriales TTS — ElevenLabs Brian/Horacio, or free Edge neural stand-ins.
 * Only tutorial narration scripts (no patient payloads).
 */
export async function POST(request: Request) {
  if (!isAcademiaEnabled()) {
    return NextResponse.json({ error: 'Tutoriales no habilitado' }, { status: 404 });
  }
  if (!isTutorialNeuralTtsConfigured()) {
    return NextResponse.json(
      { error: 'Narración neural no configurada' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const text =
    typeof body === 'object' && body && 'text' in body && typeof body.text === 'string'
      ? body.text
      : '';
  const voiceProfile =
    typeof body === 'object' &&
    body &&
    'voiceProfile' in body &&
    isVoiceProfile(body.voiceProfile)
      ? body.voiceProfile
      : null;

  if (!text.trim() || !voiceProfile) {
    return NextResponse.json(
      { error: 'text y voiceProfile (brian|horacio) son requeridos' },
      { status: 400 }
    );
  }

  try {
    const { audio, contentType, provider } = await synthesizeTutorialSpeech({
      text,
      voiceProfile,
    });
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
        'X-Syncvete-Tts-Provider': provider,
      },
    });
  } catch (error) {
    console.error('[tutorials/tts]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error de narración' },
      { status: 502 }
    );
  }
}
