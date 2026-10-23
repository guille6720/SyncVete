/**
 * Split long narration into spoken phrases for browser TTS.
 * Prefer a single utterance when possible — chunk seams sound robotic.
 */

const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=[¡¿A-ZÁÉÍÓÚÜÑ"«])|(?<=[.!?…])\s+/u;

/** Soft clause split for very long sentences without terminal punctuation. */
const CLAUSE_SPLIT = /(?<=[,;:])\s+/u;

/** Only split when the full script is longer than this. */
const PREFER_SINGLE_UTTERANCE_CHARS = 360;
const MAX_CHUNK_CHARS = 280;

export function splitNarrationChunks(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // One continuous utterance keeps prosody more natural on browser voices.
  if (normalized.length <= PREFER_SINGLE_UTTERANCE_CHARS) {
    return [normalized];
  }

  const sentences = normalized
    .split(SENTENCE_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    const next = buffer ? `${buffer} ${sentence}` : sentence;
    if (next.length > MAX_CHUNK_CHARS && buffer) {
      chunks.push(buffer);
      buffer = sentence;
    } else {
      buffer = next;
    }
  }
  if (buffer) chunks.push(buffer);

  // Last resort: clause-split an oversized leftover.
  const refined: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= MAX_CHUNK_CHARS) {
      refined.push(chunk);
      continue;
    }
    const clauses = chunk
      .split(CLAUSE_SPLIT)
      .map((part) => part.trim())
      .filter(Boolean);
    let clauseBuffer = '';
    for (const clause of clauses) {
      const next = clauseBuffer ? `${clauseBuffer} ${clause}` : clause;
      if (next.length > MAX_CHUNK_CHARS && clauseBuffer) {
        refined.push(clauseBuffer);
        clauseBuffer = clause;
      } else {
        clauseBuffer = next;
      }
    }
    if (clauseBuffer) refined.push(clauseBuffer);
  }

  return refined.length > 0 ? refined : [normalized];
}
