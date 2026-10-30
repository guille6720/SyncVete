import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { APP_TIMEZONE } from '@sincvete/shared';
import {
  historyEntryFields,
  historyEntryHeading,
  historyScopeLabel,
  type ClinicalHistoryReport,
} from './clinical-history-report';

const teal = rgb(0.02, 0.4, 0.42);
const ink = rgb(0.12, 0.16, 0.2);
const muted = rgb(0.38, 0.42, 0.46);

async function loadFont(name: string): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), 'public/fonts', name));
  } catch {
    return readFile(path.join(process.cwd(), 'apps/web/public/fonts', name));
  }
}

/** Reflows every clinical field over as many A4 pages as necessary. */
export async function buildClinicalHistoryPdf(report: ClinicalHistoryReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Historia clínica · ${report.patient.name}`);
  pdf.setAuthor(report.clinicName);
  pdf.setCreator('SyncVete');
  const [regularBytes, boldBytes] = await Promise.all([
    loadFont('NotoSans-Regular.ttf'),
    loadFont('NotoSans-Bold.ttf'),
  ]);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  const safe = (value: string) =>
    Array.from(value.normalize('NFC'))
      .map((char) => {
        if (char === '\n' || char === '\r' || char === '\t' || supported.has(char.codePointAt(0)!))
          return char;
        return `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`;
      })
      .join('');
  const width = 595.28;
  const height = 841.89;
  const margin = 46;
  const contentWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - 84;
  function pageHeader() {
    page.drawText('SyncVete  |  Historia clínica', {
      x: margin,
      y: height - 40,
      font: bold,
      size: 11,
      color: teal,
    });
    page.drawLine({
      start: { x: margin, y: height - 49 },
      end: { x: width - margin, y: height - 49 },
      color: rgb(0.77, 0.84, 0.84),
      thickness: 0.7,
    });
    let patientLabel = safe(`Paciente: ${report.patient.name}`).replace(/\s+/g, ' ');
    while (regular.widthOfTextAtSize(patientLabel, 8) > contentWidth) {
      patientLabel = `${patientLabel.slice(0, -2)}…`;
    }
    page.drawText(patientLabel, {
      x: margin,
      y: height - 64,
      font: regular,
      size: 8,
      color: muted,
    });
  }
  function space(amount: number) {
    if (y - amount < 54) {
      page = pdf.addPage([width, height]);
      y = height - 84;
      pageHeader();
    }
  }
  function wrap(text: string, font: PDFFont, size: number): string[] {
    const result: string[] = [];
    for (const paragraph of safe(text).replace(/\r\n?/g, '\n').split('\n')) {
      let line = '';
      for (const token of paragraph.split(/\s+/).filter(Boolean)) {
        if (font.widthOfTextAtSize(`${line}${line ? ' ' : ''}${token}`, size) <= contentWidth) {
          line += `${line ? ' ' : ''}${token}`;
          continue;
        }
        if (line) {
          result.push(line);
          line = '';
        }
        for (const char of token) {
          if (line && font.widthOfTextAtSize(line + char, size) > contentWidth) {
            result.push(line);
            line = '';
          }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function write(text: string, size = 10, strong = false, color = ink) {
    const font = strong ? bold : regular;
    const leading = size * 1.45;
    for (const line of wrap(text, font, size)) {
      space(leading);
      if (line) page.drawText(line, { x: margin, y, font, size, color });
      y -= leading;
    }
  }
  pageHeader();
  write(report.clinicName, 17, true, teal);
  write(historyScopeLabel(report.date), 12, true);
  y -= 8;
  write(`Paciente: ${report.patient.name}`, 12, true);
  write(
    `Especie: ${report.patient.species} · Raza: ${report.patient.breed ?? 'No registrada'} · Sexo: ${report.patient.sex}`
  );
  if (report.patient.birth_date)
    write(`Nacimiento: ${report.patient.birth_date.split('-').reverse().join('/')}`);
  if (report.patient.microchip) write(`Microchip: ${report.patient.microchip}`);
  write(`Tutor: ${report.ownerName}`);
  write(
    `${report.entries.length} entrada${report.entries.length === 1 ? '' : 's'} · Zona horaria de la clínica: ${APP_TIMEZONE}`,
    9,
    false,
    muted
  );
  y -= 14;
  if (!report.entries.length) write('No hay atenciones registradas para la fecha seleccionada.');
  for (const entry of report.entries) {
    space(65);
    write(historyEntryHeading(entry), 11, true, teal);
    for (const [label, value] of historyEntryFields(entry)) {
      space(35);
      write(label, 9, true);
      write(value);
      y -= 5;
    }
    y -= 12;
  }
  const issued = new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(report.generatedAt));
  for (const [index, current] of pdf.getPages().entries()) {
    current.drawText(`Confidencial · Emitido ${issued}`, {
      x: margin,
      y: 27,
      font: regular,
      size: 8,
      color: muted,
    });
    const number = `Página ${index + 1} de ${pdf.getPageCount()}`;
    current.drawText(number, {
      x: width - margin - regular.widthOfTextAtSize(number, 8),
      y: 27,
      font: regular,
      size: 8,
      color: muted,
    });
  }
  return pdf.save();
}
