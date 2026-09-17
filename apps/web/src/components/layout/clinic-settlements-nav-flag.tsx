import { hasLinkedProfessionalProfile } from '@/actions/professionals';
import { SettlementsNavFlagReceiver } from '@/components/layout/settlements-nav-context';

/**
 * Non-critical: resolves whether to show "Mis liquidaciones" after the shell paints.
 */
export async function ClinicSettlementsNavFlag() {
  let show = false;
  try {
    show = await hasLinkedProfessionalProfile();
  } catch {
    show = false;
  }
  return <SettlementsNavFlagReceiver show={show} />;
}
