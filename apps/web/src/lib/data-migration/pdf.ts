import 'server-only';

import { extractText, getDocumentProxy } from 'unpdf';
import { pdfTextToCsv } from '@/lib/data-migration/pdf-text';

export { pdfTextToCsv };

export async function pdfBufferToCsv(buffer: Buffer | Uint8Array): Promise<string> {
  const bytes = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer;
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text)
    ? extracted.text.join('\n')
    : String(extracted.text ?? '');
  return pdfTextToCsv(text);
}
