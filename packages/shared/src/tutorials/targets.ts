/** Canonical data-tour attribute values used by Agenda and clinic modules. */
export const TOUR_TARGETS = {
  AGENDA_ROOT: 'agenda-root',
  AGENDA_HEADER: 'agenda-header',
  AGENDA_DAY_LIST: 'agenda-day-list',
  AGENDA_WEEK_NAV: 'agenda-week-nav',
  AGENDA_WEEK_NAV_TODAY: 'agenda-week-nav-today',
  AGENDA_FILTER_STATUS: 'agenda-filter-status',
  AGENDA_FILTER_PROFESSIONAL: 'agenda-filter-professional',
  AGENDA_NEW_BUTTON: 'agenda-new-button',
  AGENDA_FORM: 'agenda-form',
  AGENDA_FORM_PATIENT: 'agenda-form-patient',
  AGENDA_FORM_SCHEDULE: 'agenda-form-schedule',
  AGENDA_DETAIL: 'agenda-detail',
  AGENDA_DETAIL_STATUS: 'agenda-detail-status',
  AGENDA_DETAIL_ACTIONS: 'agenda-detail-actions',
  ACADEMIA_ROOT: 'academia-root',
} as const;

export type TourTargetId = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

/** Stable tour anchors for standard module tutorials (root / header / content). */
export function moduleTourTargets(moduleId: string) {
  return {
    root: `${moduleId}-root`,
    header: `${moduleId}-header`,
    content: `${moduleId}-content`,
  } as const;
}

/** Action-level anchors: e.g. pacientes-search, facturacion-new */
export function moduleActionTarget(moduleId: string, actionId: string): string {
  return `${moduleId}-${actionId}`;
}

export function tourSelector(target: string): string {
  return `[data-tour="${target}"]`;
}
