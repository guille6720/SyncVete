'use server';

import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';

const DEMO_ORG_NAME_PATTERN = 'Academia Demo%';

/**
 * Returns an appointment id only when the current organization is an Academia
 * Demo clinic. Never picks appointments from other organizations.
 */
export async function getAcademiaDemoAppointmentId(): Promise<string | null> {
  const session = await getSessionContext();
  if (!session || session.kind !== 'staff' || !session.organizationId) {
    return null;
  }

  const supabase = await createClient();
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', session.organizationId)
    .ilike('name', DEMO_ORG_NAME_PATTERN)
    .maybeSingle();

  if (orgError || !org) {
    return null;
  }

  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .select('id')
    .eq('organization_id', session.organizationId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (apptError || !appointment?.id) {
    return null;
  }

  return appointment.id as string;
}
