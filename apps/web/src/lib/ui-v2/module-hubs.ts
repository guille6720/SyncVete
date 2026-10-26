import type { DashboardNavGroupId } from '@/components/dashboard/dashboard-nav-catalog';
import { DASHBOARD_NAV_GROUPS } from '@/components/dashboard/dashboard-nav-catalog';

/** Pretty Spanish slugs for module hub routes (`/modulos/clinica`). */
export const MODULE_HUB_SLUG_BY_GROUP: Record<DashboardNavGroupId, string> = {
  clinical: 'clinica',
  patients: 'pacientes',
  agenda: 'agenda',
  hospitalization: 'internacion',
  management: 'gestion',
  professionals: 'profesionales',
  reports: 'reportes',
  communication: 'comunicacion',
  users: 'usuarios',
  settings: 'configuracion',
};

const GROUP_BY_SLUG = Object.fromEntries(
  Object.entries(MODULE_HUB_SLUG_BY_GROUP).map(([groupId, slug]) => [slug, groupId])
) as Record<string, DashboardNavGroupId>;

export function getModuleHubPath(groupId: DashboardNavGroupId): string {
  return `/modulos/${MODULE_HUB_SLUG_BY_GROUP[groupId]}`;
}

export function getModuleGroupIdFromSlug(slug: string): DashboardNavGroupId | null {
  return GROUP_BY_SLUG[slug] ?? null;
}

export function getModuleGroupById(groupId: DashboardNavGroupId) {
  return DASHBOARD_NAV_GROUPS.find((group) => group.id === groupId) ?? null;
}

/** Short operational blurbs for hub tiles — keep synthetic, not marketing fluff. */
export const MODULE_ITEM_BLURB: Record<string, string> = {
  '/sala-espera': 'Flujo del día y check-in',
  '/consultas': 'Atención y notas clínicas',
  '/historia-clinica': 'Historial del paciente',
  '/laboratorio': 'Órdenes y resultados',
  '/imagenes': 'Estudios e imágenes',
  '/farmacia': 'Recetas y dispensa',
  '/ia-clinica': 'Asistencia con IA',
  '/tutores': 'Dueños y contactos',
  '/pacientes': 'Fichas y búsqueda',
  '/agenda': 'Calendario de lo agendado',
  '/agenda/turnos': 'Elegir profesional y dar turno',
  '/vacunacion': 'Planes y vencimientos',
  '/cirugias': 'Quirofano y seguimiento',
  '/recordatorios': 'Avisos pendientes',
  '/internacion': 'Internados y altas',
  '/inventario': 'Stock y productos',
  '/facturacion': 'Facturas y cobros',
  '/caja': 'Sesiones de caja',
  '/profesionales': 'Equipo clínico',
  '/interconsultas': 'Consultas entre colegas',
  '/liquidaciones': 'Pagos a profesionales',
  '/liquidaciones/mis-liquidaciones': 'Mis liquidaciones',
  '/reportes': 'Indicadores de la clínica',
  '/auditoria': 'Registro de eventos',
  '/whatsapp': 'Mensajería',
  '/notificaciones': 'Bandeja interna',
  '/academia': 'Tutoriales guiados',
  '/configuracion': 'Ajustes de la clínica',
  '/usuarios': 'Invitaciones, roles y permisos por módulo',
};

export function getModuleItemBlurb(href: string): string {
  return MODULE_ITEM_BLURB[href] ?? 'Abrir módulo';
}
