// Local speech-to-text for voice notes. Runs OpenAI's open-source Whisper model on this
// server via transformers.js (ONNX runtime). No audio is sent to any third-party API.
// The model weights (~80 MB) are downloaded once on first use and cached under data/models.
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const MODEL = process.env.WHISPER_MODEL || 'Xenova/whisper-base';
export const SAMPLE_RATE = 16000;
let loading = null;

export function loadTranscriber(cacheDir) {
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      mkdirSync(cacheDir, { recursive: true });
      env.cacheDir = cacheDir;
      env.allowLocalModels = true;
      return pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8', device: 'cpu' });
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** @param {Float32Array} audio mono PCM at 16 kHz  @param {string} language '' = auto-detect */
export async function transcribe(audio, cacheDir, language = '') {
  const asr = await loadTranscriber(cacheDir);
  const opts = { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
  if (language) opts.language = language;
  const out = await asr(audio, opts);
  return String(Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text || '')
    .replace(/\[(?:BLANK_AUDIO|MUSIC|NOISE|SOUND)\]|\((?:music|silence)\)/gi, '')
    .replace(/\s+/g, ' ').trim();
}

export const modelCacheDir = dataDir => path.join(dataDir, 'models');
