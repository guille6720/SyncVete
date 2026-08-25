import { redirect } from 'next/navigation';
import { canSendWhatsAppReminders } from '@/actions/whatsapp';
import { canReadReminders, listClinicReminders } from '@/actions/reminders';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { RemindersBoard } from '@/components/reminders/reminders-board';
import { FeatureUnavailableNotice } from '@/components/entitlements/feature-gate';
import { countPendingReminders } from '@sincvete/shared';

export default async function RecordatoriosPage() {
  const canRead = await canReadReminders();
  if (!canRead) redirect('/dashboard');

  const [board, canSend, session, branches] = await Promise.all([
    listClinicReminders(),
    canSendWhatsAppReminders(),
    getSessionContext(),
    getUserBranches(),
  ]);
  const pending = countPendingReminders(board);
  const branchName =
    branches.find((branch) => branch.id === session?.branchId)?.name ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recordatorios</h1>
        <p className="text-muted-foreground">
          Avisos de turnos, vacunas y saldos
          {branchName ? ` · ${branchName}` : ''}
          {`. ${pending} pendiente${pending !== 1 ? 's' : ''}.`}
        </p>
      </div>
      {!canSend ? (
        <FeatureUnavailableNotice
          title="Recordatorios WhatsApp no incluidos"
          description="Podés ver la lista, pero el envío por WhatsApp requiere un plan superior."
        />
      ) : null}
      <RemindersBoard board={board} canSend={canSend} branchName={branchName} />
    </div>
  );
}
