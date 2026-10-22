# Tutoriales narration (ElevenLabs)

Primary voices for Tutoriales SyncVete:

| Perfil UI | Voice | ElevenLabs ID (default) |
|-----------|-------|-------------------------|
| Brian C   | BRIAN / Brian C. Latin narration | `XgQWNZcJ8SRkxXwwhPTo` |
| Horacio   | Horacio - Seguro & Confiable | `57D8YIbQSuE3REDPO6Vm` |

Runtime path: browser → `POST /api/tutorials/tts` → ElevenLabs (server key).

Required env (staging Preview only, never Production):

```
ELEVENLABS_API_KEY=...
# optional overrides
ELEVENLABS_VOICE_BRIAN_ID=
ELEVENLABS_VOICE_HORACIO_ID=
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Optional static MP3 fallback (if present):

```
/academia/narration/{tutorialId}/{brian|horacio}/{clipId}.mp3
```

If ElevenLabs is not configured, the app falls back to browser Speech Synthesis
(not shown in the voice selector). Tutorial scripts never include patient data.
