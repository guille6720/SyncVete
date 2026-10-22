import {
  INTERCONSULTATION_STATUS_TRANSITIONS,
  type InterconsultationStatus,
} from '../constants/interconsultations';

export function canTransitionInterconsultationStatus(
  from: InterconsultationStatus,
  to: InterconsultationStatus
): boolean {
  if (from === to) return true;
  return INTERCONSULTATION_STATUS_TRANSITIONS[from].includes(to);
}

export function computeInterconsultationClientAmount(params: {
  professionalBaseAmount: number;
  clinicMarkupPercentage: number;
}): {
  clinicMarkupAmount: number;
  clientFinalAmount: number;
} {
  const base = Math.max(0, Number(params.professionalBaseAmount) || 0);
  const pct = Math.max(0, Number(params.clinicMarkupPercentage) || 0);
  const clinicMarkupAmount = Math.round(((base * pct) / 100) * 100) / 100;
  const clientFinalAmount = Math.round((base + clinicMarkupAmount) * 100) / 100;
  return { clinicMarkupAmount, clientFinalAmount };
}

export function formatInterconsultationMoney(
  amount: number,
  currency = 'ARS',
  locale = 'es-AR'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function buildInterconsultationInvoiceDescription(title: string): string {
  const clean = title.trim() || 'Interconsulta profesional';
  return `Interconsulta profesional - ${clean}`;
}

export function buildInterconsultationWhatsAppRequestMessage(params: {
  professionalName: string;
  clinicName: string;
  patientName: string;
  url: string;
}): string {
  return `Hola ${params.professionalName}. ${params.clinicName} te envió una solicitud de interconsulta para ${params.patientName}. Podés revisar la información y responder desde este enlace seguro: ${params.url}`;
}

export function buildInterconsultationWhatsAppAcceptedMessage(params: {
  patientName: string;
}): string {
  return `Tu presupuesto para la interconsulta de ${params.patientName} fue aceptado.`;
}

export function buildInterconsultationWhatsAppCompletedMessage(params: {
  patientName: string;
}): string {
  return `La interconsulta de ${params.patientName} fue completada.`;
}
