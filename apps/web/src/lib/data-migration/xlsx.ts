import 'server-only';

import * as XLSX from 'xlsx';
import { toCsv } from '@sincvete/shared';

export function workbookFirstSheetToCsv(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo XLSX no tiene hojas');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Hoja XLSX inválida');
  return XLSX.utils.sheet_to_csv(sheet);
}

export function rowsToXlsxBase64(
  sheetName: string,
  headers: string[],
  rows: Array<Record<string, unknown>>
): { base64: string; filename: string } {
  const aoa: unknown[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((header) => row[header] ?? ''));
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31) || 'data');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;
  return {
    base64,
    filename: `syncvete-export-${sheetName.toLowerCase()}-${Date.now()}.xlsx`,
  };
}

export function csvTextToXlsxBase64(sheetName: string, csvText: string): {
  base64: string;
  filename: string;
} {
  // Preserve CSV semantics by re-parsing through sheet_to_json path
  const workbookFromCsv = XLSX.read(csvText, { type: 'string', FS: ',' });
  const first = workbookFromCsv.SheetNames[0];
  const sheet = first ? workbookFromCsv.Sheets[first] : null;
  if (!sheet) {
    const empty = toCsv(['empty'], []);
    return csvTextToXlsxBase64(sheetName, empty);
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31) || 'data');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;
  return {
    base64,
    filename: `syncvete-export-${sheetName.toLowerCase()}-${Date.now()}.xlsx`,
  };
}
