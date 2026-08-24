import { WHATSAPP_DEFAULT_COUNTRY_CODE } from '../constants/whatsapp';
import {
  WHATSAPP_TEMPLATE_BODIES,
  type WhatsAppTemplateKey,
} from '../constants/whatsapp';

export interface WhatsAppTemplateVars {
  owner?: string;
  patient?: string;
  clinic?: string;
  date?: string;
  time?: string;
  vaccine?: string;
  invoice?: string;
  amount?: string;
  portal?: string;
  room?: string;
}

export function normalizeWhatsAppPhone(
  raw: string | null | undefined,
  countryCode: string = WHATSAPP_DEFAULT_COUNTRY_CODE
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.startsWith(countryCode) && digits.length >= 11 && digits.length <= 15) {
    return digits;
  }

  if (digits.startsWith('15') && digits.length === 10) {
    digits = `11${digits.slice(2)}`;
  }

  if (digits.length === 10) {
    digits = `${countryCode}9${digits}`;
  } else if (digits.length === 8) {
    digits = `${countryCode}911${digits}`;
  } else {
    digits = `${countryCode}${digits}`;
  }

  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export function pickOwnerWhatsAppPhone(
  phoneWhatsapp?: string | null,
  phone?: string | null
): string | null {
  return normalizeWhatsAppPhone(phoneWhatsapp) ?? normalizeWhatsAppPhone(phone);
}

export function formatWhatsAppRoomSuffix(room?: string | null): string {
  const value = room?.trim();
  if (!value) return '';
  return ` · Consultorio ${value}`;
}

export function renderWhatsAppTemplate(
  templateKey: WhatsAppTemplateKey,
  vars: WhatsAppTemplateVars = {}
): string {
  const template = WHATSAPP_TEMPLATE_BODIES[templateKey] ?? WHATSAPP_TEMPLATE_BODIES.mensaje_libre;
  const values: Record<string, string> = {
    owner: vars.owner?.trim() || 'te',
    patient: vars.patient?.trim() || 'tu mascota',
    clinic: vars.clinic?.trim() || 'la clínica',
    date: vars.date?.trim() || 'la fecha acordada',
    time: vars.time?.trim() || 'el horario acordado',
    vaccine: vars.vaccine?.trim() || 'indicada',
    invoice: vars.invoice?.trim() || '',
    amount: vars.amount?.trim() || '',
    portal: vars.portal?.trim() || '',
    room: formatWhatsAppRoomSuffix(vars.room),
  };

  return template.replace(/\{([a-z]+)\}/gi, (_, key: string) => values[key] ?? '');
}

export function buildWhatsAppUrl(phoneE164: string, body: string): string {
  const text = encodeURIComponent(body);
  return `https://wa.me/${phoneE164}?text=${text}`;
}
