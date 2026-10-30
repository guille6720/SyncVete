import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import type { ProfessionalHoursInput } from './professional-schedule-input';

export async function saveProfessionalSchedules(params: {
  userId: string;
  branchIds: string[];
  schedules: ProfessionalHoursInput[];
}): Promise<string | null> {
  const branchIds = [...new Set(params.branchIds)];
  if (!branchIds.length) return 'Seleccioná una sucursal para guardar los horarios';
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('replace_professional_schedules', {
    p_user_id: params.userId,
    p_branch_ids: branchIds,
    p_schedules: params.schedules.map((row) => ({
      weekday: row.weekday,
      start_time: row.startTime.length === 5 ? `${row.startTime}:00` : row.startTime,
      end_time: row.endTime.length === 5 ? `${row.endTime}:00` : row.endTime,
      slot_duration_minutes: row.slotDurationMinutes,
    })),
  });
  if (error) {
    if (/schema cache|does not exist|Could not find the/i.test(error.message)) {
      return 'No se guardaron los horarios: falta actualizar el módulo de agenda en este entorno';
    }
    return error.message.replace(/^.*ERROR:\s*/i, '').replace(/\s+CONTEXT:[\s\S]*$/i, '');
  }
  if (typeof data !== 'number' || data !== branchIds.length * params.schedules.length) {
    return 'No se pudo confirmar el guardado de los horarios. Recargá la ficha para revisarlos';
  }
  for (const path of ['/agenda', '/agenda/turnos', '/agenda/nueva', '/agenda/disponibilidad']) {
    revalidatePath(path);
  }
  return null;
}
