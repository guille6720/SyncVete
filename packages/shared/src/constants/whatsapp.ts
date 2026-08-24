export const WHATSAPP_TEMPLATES = [
  'recordatorio_cita',
  'confirmar_cita',
  'vacuna_vencida',
  'factura_saldo',
  'lab_listo',
  'portal_invite',
  'sala_espera_llamado',
  'mensaje_libre',
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATES)[number];

export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsAppTemplateKey, string> = {
  recordatorio_cita: 'Recordatorio de turno',
  confirmar_cita: 'Confirmar turno',
  vacuna_vencida: 'Vacuna vencida / por vencer',
  factura_saldo: 'Saldo de factura',
  lab_listo: 'Resultados de laboratorio',
  portal_invite: 'Invitación al portal',
  sala_espera_llamado: 'Sala de espera · llamado',
  mensaje_libre: 'Mensaje libre',
};

export const WHATSAPP_TEMPLATE_BODIES: Record<WhatsAppTemplateKey, string> = {
  recordatorio_cita:
    'Hola {owner}, te recordamos el turno de {patient} el {date} a las {time} en {clinic}. ¡Te esperamos!',
  confirmar_cita:
    'Hola {owner}, ¿confirmás el turno de {patient} el {date} a las {time} en {clinic}?',
  vacuna_vencida:
    'Hola {owner}, la vacuna {vaccine} de {patient} está vencida o por vencer ({date}). Escribinos para agendar el refuerzo en {clinic}.',
  factura_saldo:
    'Hola {owner}, la factura {invoice} de {patient} tiene un saldo de {amount}. Cualquier consulta, estamos en {clinic}.',
  lab_listo:
    'Hola {owner}, ya están los resultados de laboratorio de {patient}. Podés pasar a retirarlos o consultarlos en {clinic}.',
  portal_invite:
    'Hola {owner}, en {clinic} podés ver turnos, vacunas y facturas de {patient} desde el portal del tutor. Pedinos el enlace de acceso.',
  sala_espera_llamado:
    'Hola {owner}, ¡ya estamos llamando a {patient} en {clinic}{room}! Acercate por favor.',
  mensaje_libre: 'Hola {owner}, te escribimos desde {clinic}.',
};

export const WHATSAPP_RELATED_TYPES = [
  'none',
  'appointment',
  'invoice',
  'lab_order',
  'vaccination',
  'portal',
] as const;

export type WhatsAppRelatedType = (typeof WHATSAPP_RELATED_TYPES)[number];

export const WHATSAPP_RELATED_TYPE_LABELS: Record<WhatsAppRelatedType, string> = {
  none: 'Mensaje',
  appointment: 'Turno',
  invoice: 'Factura',
  lab_order: 'Laboratorio',
  vaccination: 'Vacuna',
  portal: 'Portal',
};

export const WHATSAPP_DEFAULT_COUNTRY_CODE = '54';

export function buildWhatsAppComposePath(params: {
  ownerId?: string;
  patientId?: string;
  template?: WhatsAppTemplateKey;
  appointmentId?: string;
  invoiceId?: string;
  labOrderId?: string;
  vaccinationId?: string;
  room?: string;
}): string {
  const search = new URLSearchParams();
  if (params.ownerId) search.set('ownerId', params.ownerId);
  if (params.patientId) search.set('patientId', params.patientId);
  if (params.template) search.set('template', params.template);
  if (params.appointmentId) search.set('appointmentId', params.appointmentId);
  if (params.invoiceId) search.set('invoiceId', params.invoiceId);
  if (params.labOrderId) search.set('labOrderId', params.labOrderId);
  if (params.vaccinationId) search.set('vaccinationId', params.vaccinationId);
  if (params.room?.trim()) search.set('room', params.room.trim());
  const query = search.toString();
  return query ? `/whatsapp?${query}` : '/whatsapp';
}
