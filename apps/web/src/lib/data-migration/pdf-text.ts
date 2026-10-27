import { INVENTORY_PRODUCT_IMPORT_FIELDS } from '@sincvete/shared';

const INVENTORY_HEADER_ALIASES = new Set(
  INVENTORY_PRODUCT_IMPORT_FIELDS.flatMap((field) => [
    field.key.toLowerCase(),
    field.label.toLowerCase(),
    ...field.aliases.map((alias) => alias.toLowerCase()),
  ])
);

function splitDelimited(line: string): string[] | null {
  if (line.includes('\t')) {
    return line.split('\t').map((cell) => cell.trim());
  }
  if (line.includes(';') && line.split(';').length >= 2) {
    return line.split(';').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  }
  if (line.includes(',') && line.split(',').length >= 2) {
    return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  }
  return null;
}

function splitWhitespaceColumns(line: string): string[] {
  return line
    .trim()
    .split(/\s{2,}|\t+/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function looksLikeHeader(cells: string[]): boolean {
  if (cells.length < 2) return false;
  const hits = cells.filter((cell) => INVENTORY_HEADER_ALIASES.has(cell.toLowerCase())).length;
  return hits >= 2;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

/** Convert extracted PDF text into CSV for inventory product import. */
export function pdfTextToCsv(text: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('El PDF no tiene texto extraíble (¿está escaneado sin OCR?)');
  }

  const delimitedRows: string[][] = [];
  for (const line of lines) {
    const cells = splitDelimited(line);
    if (cells && cells.length >= 2) delimitedRows.push(cells);
  }
  if (delimitedRows.length >= 2) return rowsToCsv(delimitedRows);

  const spacedRows = lines.map(splitWhitespaceColumns).filter((row) => row.length >= 2);
  const headerIndex = spacedRows.findIndex(looksLikeHeader);
  if (headerIndex >= 0) {
    const header = spacedRows[headerIndex]!;
    const body = spacedRows
      .slice(headerIndex + 1)
      .filter((row) => row.length === header.length || row.length >= Math.max(2, header.length - 1));
    if (body.length === 0) {
      throw new Error('Se detectó cabecera en el PDF pero no hay filas de productos');
    }
    return rowsToCsv([header, ...body.map((row) => row.slice(0, header.length))]);
  }

  if (spacedRows.length >= 2 && spacedRows[0]!.length >= 3) {
    return rowsToCsv(spacedRows);
  }

  throw new Error(
    'No se pudo detectar una tabla de productos en el PDF. Probá CSV/Excel, o un PDF con columnas claras.'
  );
}
