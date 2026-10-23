# Tutoriales: Kokoro pre-generated narration

Kokoro-82M v1.0 generates the Spanish tutorial scripts locally. Production serves
static MP3 files; there is no paid synthesis API or model running in Vercel.
Only the versioned tutorial registry and the voice preview are synthesized.
Unknown text is rejected. Existing browser speech remains an emergency fallback.

The persisted profile IDs `brian` and `horacio` are retained for compatibility;
they now select Kokoro `em_alex` (Alex) and `em_santa` (Santa), respectively.
The legacy player class name is retained to avoid changing playback orchestration.
No ElevenLabs or Edge request is made by the tutorial player or TTS route.

## Regeneration

From the repository root, with Node dependencies installed:

1. Run `npx tsx@4.20.6 scripts/export-kokoro-scripts.ts`.
2. Run `pip install -r scripts/requirements-kokoro.txt` in an isolated Python 3.12 environment.
3. Download `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin` from the
   [upstream model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).
4. Run `python scripts/generate-kokoro.py --models /path/to/models`.
5. Run `npm run test:unit --workspace=@sincvete/web -- src/lib/tutorials/kokoro-clips.test.ts`.

The generator validates decoded duration, sample rate and non-silent finite samples.
For parallel generation use distinct `--shard` values with the same `--shards` count,
then run once with `--verify-only` to validate completeness and emit the manifest.
It writes the content-addressed MP3s, text lookup manifest, and `build.json` with
model checksums. Keep models and Python environments outside the deployment.
When changing models, voices, speed or pronunciation, increment the output version
and regenerate rather than reusing the previous cached filenames.

Kokoro model: Apache-2.0; kokoro-onnx: MIT. See
[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) and
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx).
Static hosting/bandwidth remains subject to the existing Vercel plan.
