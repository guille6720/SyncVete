# Tutoriales narration

## Best quality (recommended for Production)

| Perfil UI | Voice | ElevenLabs ID (default) |
|-----------|-------|-------------------------|
| Brian C   | BRIAN / Brian C. Latin narration | `XgQWNZcJ8SRkxXwwhPTo` |
| Horacio   | Horacio - Seguro & Confiable | `57D8YIbQSuE3REDPO6Vm` |

```
ELEVENLABS_API_KEY=...
# optional
ELEVENLABS_VOICE_BRIAN_ID=
ELEVENLABS_VOICE_HORACIO_ID=
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
# or proxy to a deployment that already has the key:
# TUTORIALS_TTS_UPSTREAM_URL=https://your-staging-host
```

## Free fallback (no API key)

Microsoft Edge neural voices (no Google Translate — too robotic):

| Perfil UI | Edge voice |
|-----------|------------|
| Brian     | `es-AR-TomasNeural` |
| Horacio   | `es-MX-JorgeNeural` |

Disable with `EDGE_TTS_ENABLED=false`.

## Optional static MP3 fallback

```
/academia/narration/{tutorialId}/{brian|horacio}/{clipId}.mp3
```

Tutorial scripts never include patient data.
