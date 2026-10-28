import { z } from 'zod';
import {
  APP_TIMEZONE,
  CLINICAL_ENTRY_TYPE_LABELS,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
  type ClinicalEntry,
} from '@sincvete/shared';

export function clinicalDay(value: string | Date = new Date()): string {
  return toLocalDateTimeInput(value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

export function isClinicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const historyExportSchema = z.object({
  patientId: z.string().uuid(),
  date: z.string().refine(isClinicalDate, 'Fecha inválida').optional(),
});

export function clinicalDayRange(date: string) {
  if (!isClinicalDate(date)) throw new Error('Fecha inválida');
  const from = fromLocalDateTimeInput(`${date}T00:00`);
  return { from, to: new Date(new Date(from).getTime() + 86_400_000).toISOString() };
}

export interface HistoryReportEntry extends ClinicalEntry {
  professionalName: string | null;
  branchName: string | null;
}

export interface ClinicalHistoryReport {
  clinicName: string;
  patient: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
    sex: string;
    birth_date: string | null;
    microchip: string | null;
  };
  ownerName: string;
  date?: string;
  generatedAt: string;
  entries: HistoryReportEntry[];
}

export function historyScopeLabel(date?: string): string {
  return date
    ? `Atenciones del ${date.split('-').reverse().join('/')}`
    : 'Historia clínica completa';
}

export function historyEntryHeading(entry: HistoryReportEntry): string {
  const date = new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(entry.entry_date));
  return `${date} · ${CLINICAL_ENTRY_TYPE_LABELS[entry.entry_type]}`;
}

export function historyEntryFields(entry: HistoryReportEntry): Array<[string, string]> {
  const text: Array<[string, string | null | undefined]> = [
    ['Título / motivo', entry.title],
    ['Profesional', entry.original_professional_name || entry.professionalName],
    ['Sucursal', entry.branchName],
    ['Peso', entry.weight_kg == null ? null : `${entry.weight_kg} kg`],
    ['Temperatura', entry.temperature_c == null ? null : `${entry.temperature_c} °C`],
    ['Anamnesis', entry.anamnesis],
    ['Examen físico', entry.physical_exam],
    ['Diagnóstico', entry.diagnosis],
    ['Tratamiento', entry.treatment],
    ['Plan / seguimiento', entry.plan],
    ['Notas', entry.notes],
  ];
  return text.filter((row): row is [string, string] => row[1] != null && row[1].trim() !== '');
}

export function historyExportUrl(patientId: string, date?: string, print = false): string {
  const query = new URLSearchParams({ patientId });
  if (date) query.set('date', date);
  return `${print ? '/historia-clinica/imprimir' : '/api/historia-clinica/pdf'}?${query}`;
}

export function historyPdfFilename(report: ClinicalHistoryReport): string {
  const name =
    report.patient.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'paciente';
  return `historia-${name}-${report.date ?? 'completa'}.pdf`;
}
