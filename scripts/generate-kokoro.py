import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

parser = argparse.ArgumentParser()
parser.add_argument('--models', type=Path, required=True)
parser.add_argument('--limit', type=int)
parser.add_argument('--shard', type=int, default=0)
parser.add_argument('--shards', type=int, default=1)
parser.add_argument('--verify-only', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
clips = json.loads((root / '.kokoro/scripts.json').read_text(encoding='utf-8'))
session_options = ort.SessionOptions()
session_options.intra_op_num_threads = 2
session = ort.InferenceSession(str(args.models / 'kokoro-v1.0.int8.onnx'), sess_options=session_options, providers=['CPUExecutionProvider'])
run_session = session.run
input_types = {item.name: item.type for item in session.get_inputs()}

def run_typed(output_names, inputs, run_options=None):
    if input_types.get('speed') == 'tensor(float)':
        inputs['speed'] = np.asarray(inputs['speed'], dtype=np.float32)
    return run_session(output_names, inputs, run_options)

session.run = run_typed
engine = Kokoro.from_session(session, str(args.models / 'voices-v1.0.bin'))
voices = {'brian': 'em_alex', 'horacio': 'em_santa'}
output = root / 'apps/web/public/academia/kokoro/v2'
manifest = {}
for index, clip in enumerate(clips[:args.limit]):
    if index % args.shards != args.shard:
        continue
    manifest[clip['text']] = {}
    for profile, voice in voices.items():
        target = output / voice / (clip['id'] + '.mp3')
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            if args.verify_only:
                raise RuntimeError(f'Missing audio: {target}')
            samples, sample_rate = engine.create(clip['text'], voice=voice, speed=1.0, lang='es')
            if not len(samples) or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 0.001:
                raise RuntimeError(f'Invalid audio: {clip["id"]} {voice}')
            sf.write(str(target), samples, sample_rate, format='MP3')
        info = sf.info(str(target))
        if info.duration < 0.5 or info.samplerate != 24000:
            raise RuntimeError(f'Invalid encoded audio: {target}')
        manifest[clip['text']][profile] = f'/academia/kokoro/v2/{voice}/{clip["id"]}.mp3'
    print(f'{index + 1}/{len(clips)} {clip["id"]}', flush=True)
if args.limit is None and args.shards == 1:
    target = root / 'apps/web/src/lib/tutorials/kokoro-manifest.json'
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    evidence = {
        'provider': 'kokoro', 'model': 'Kokoro-82M v1.0', 'language': 'es', 'voices': voices,
        'quantization': 'int8', 'onnxruntime': ort.__version__, 'soundfile': sf.__version__,
        'scripts': len(clips), 'audioFiles': len(clips) * len(voices),
        'modelSha256': hashlib.sha256((args.models / 'kokoro-v1.0.int8.onnx').read_bytes()).hexdigest(),
        'voicesSha256': hashlib.sha256((args.models / 'voices-v1.0.bin').read_bytes()).hexdigest(),
    }
    (output / 'build.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
