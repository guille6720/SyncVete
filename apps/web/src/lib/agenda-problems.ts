export interface AgendaProblem {
  title: string;
  message: string;
  action: 'hours' | 'slots' | 'permission' | 'retry' | 'review';
  label: string;
}

/** Turn expected failures into a reason and a concrete next step. Never expose SQL. */
export function explainAgendaProblem(raw?: string | null): AgendaProblem {
  const value = raw?.trim() ?? '';
  if (/no tiene horarios|sin horarios|cargá días|agregá.*día/i.test(value))
    return {
      title: 'Faltan días y horarios',
      message: value || 'Agregá días y horarios en la ficha del profesional.',
      action: 'hours',
      label: 'Cargar horarios',
    };
  if (/ocup|ya tiene una cita|overlap/i.test(value))
    return {
      title: 'El horario acaba de ocuparse',
      message: 'Elegí otro horario disponible. Tus datos siguen cargados.',
      action: 'slots',
      label: 'Ver horarios disponibles',
    };
  if (/fuera de|bloqueo|no hay franjas|no disponible.*horario/i.test(value))
    return {
      title: 'Ese horario no está disponible',
      message: value,
      action: 'slots',
      label: 'Ver próximos horarios',
    };
  if (/permiso|sin acceso|no tenés acceso/i.test(value))
    return {
      title: 'Necesitás un permiso',
      message: /administrador|habilit/i.test(value)
        ? value
        : `${value}. Pedile a un administrador que revise tus permisos para esta sucursal.`,
      action: 'permission',
      label: 'Ver permiso necesario',
    };
  if (/plan|límite|limit|cupo/i.test(value))
    return {
      title: 'Revisá el plan de la clínica',
      message: `${value} Un administrador puede revisar el plan desde Configuración.`,
      action: 'review',
      label: 'Revisar datos',
    };
  if (/schema|PGRST|does not exist|could not find|base de datos.*esquema/i.test(value))
    return {
      title: 'La agenda necesita una actualización',
      message:
        'Este entorno todavía no tiene la actualización de Agenda. Avisá al administrador para que la aplique. Conservamos lo que completaste.',
      action: 'retry',
      label: 'Reintentar',
    };
  if (/cargar la agenda|comprobar los horarios|conexión|reintent/i.test(value))
    return {
      title: 'No pudimos completar la operación',
      message: value,
      action: 'retry',
      label: 'Reintentar',
    };
  if (
    /constraint|SQL|relation|column|function|unexpected|fetch|network|timeout/i.test(value) ||
    !value
  )
    return {
      title: 'No se pudo guardar',
      message:
        'No pudimos confirmar el guardado. Revisá tu conexión y reintentá sin cerrar el formulario. Tus datos siguen cargados.',
      action: 'retry',
      label: 'Reintentar',
    };
  return { title: 'Revisá estos datos', message: value, action: 'review', label: 'Revisar datos' };
}
