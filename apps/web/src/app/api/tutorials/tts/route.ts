import { NextResponse } from 'next/server';
import { isAcademiaEnabled } from '@/lib/tutorials/feature-flag';
import { getKokoroClipPath, hasKokoroClips } from '@/lib/tutorials/kokoro-clips';
import { NARRATION_VOICE_PROFILES, type NarrationVoiceProfileId } from '@sincvete/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isVoiceProfile(value: unknown): value is NarrationVoiceProfileId {
  return (
    typeof value === 'string' && (NARRATION_VOICE_PROFILES as readonly string[]).includes(value)
  );
}

export async function GET() {
  if (!isAcademiaEnabled()) {
    return NextResponse.json({ configured: false }, { status: 404 });
  }
  const provider = hasKokoroClips() ? 'kokoro' : null;
  return NextResponse.json({
    configured: Boolean(provider),
    provider,
    voices: ['brian', 'horacio'],
    voiceNames: { brian: 'Alex', horacio: 'Santa' },
  });
}

export async function POST(request: Request) {
  if (!isAcademiaEnabled()) {
    return NextResponse.json({ error: 'Tutoriales no habilitado' }, { status: 404 });
  }
  if (!hasKokoroClips()) {
    return NextResponse.json({ error: 'Narración neural no configurada' }, { status: 503 });
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
    typeof body === 'object' && body && 'voiceProfile' in body && isVoiceProfile(body.voiceProfile)
      ? body.voiceProfile
      : null;

  if (!text.trim() || !voiceProfile) {
    return NextResponse.json(
      { error: 'text y voiceProfile (brian|horacio) son requeridos' },
      { status: 400 }
    );
  }

  const path = getKokoroClipPath(text, voiceProfile);
  if (!path) {
    return NextResponse.json({ error: 'Guion de tutorial no disponible' }, { status: 404 });
  }
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path, 'X-Syncvete-Tts-Provider': 'kokoro' },
  });
}
