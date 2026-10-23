'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { isAcademiaDemoSettings } from '@/lib/academia-demo-marker';

/**
 * Returns an appointment id only when the authenticated staff session belongs
 * to the explicit Academia Demo organization (settings marker), and the
 * appointment is scoped to that same organization_id.
 *
 * Never matches by organization name (rename-safe).
 * Never auto-updates appointment status.
 */
export async function getAcademiaDemoAppointmentId(): Promise<string | null> {
  const session = await getSessionContext();
  if (!session || session.kind !== 'staff' || !session.organizationId) {
    return null;
  }

  const supabase = await createServerClient();
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, settings')
    .eq('id', session.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (orgError || !org?.id) {
    return null;
  }

  if (!isAcademiaDemoSettings(org.settings as Record<string, unknown> | null)) {
    return null;
  }

  if (org.id !== session.organizationId) {
    return null;
  }

  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .select('id, organization_id')
    .eq('organization_id', session.organizationId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (apptError || !appointment?.id) {
    return null;
  }

  if (appointment.organization_id !== session.organizationId) {
    return null;
  }

  return appointment.id as string;
}
