# Academia narration assets (neural / prerecorded)

Static MP3 clips for the Agenda tutorial. The app never sends patient data to
external TTS APIs at runtime; clips are generated offline and committed here.

## Path convention

```
/academia/narration/{tutorialId}/{voiceProfile}/{clipId}.mp3
```

Example:

```
/academia/narration/agenda-basico/female/welcome.mp3
/academia/narration/agenda-basico/male/demo-welcome.mp3
```

## Required clips for `agenda-basico`

Voice profiles: `female`, `male`

Clip ids:

- Steps: `welcome`, `day-overview`, `week-nav`, `filter-professional`, `filter-status`, `new-appointment`, `appointment-form`, `appointment-detail`, `status-actions`, `closing`
- Demo scenes: `demo-welcome`, `demo-create`, `demo-status`

When a file is missing, the client falls back to browser Speech Synthesis with
spoken-text normalization (`SyncVete` → `Sinc Vete`).

## Generation (offline, approval required)

Recommended provider for Argentine Spanish: **Azure AI Speech** voices
`es-AR-ElenaNeural` (female) and `es-AR-TomasNeural` (male).

Do not generate paid audio or store API credentials until explicitly approved.
