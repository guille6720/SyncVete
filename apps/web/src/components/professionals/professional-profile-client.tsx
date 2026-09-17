'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProfessionalProfileTabs, type ProfessionalProfileTab } from '@/components/professionals/professional-profile-tabs';
import { ProfessionalForm } from '@/components/professionals/professional-form';
import { ProfessionalSummaryStrip } from '@/components/professionals/professional-summary-strip';
import { CompensationPanel } from '@/components/professionals/compensation-panel';
import { ProfessionalSettlementsLink } from '@/components/professionals/professional-settlements-link';
import { ProfessionalAccessPanel } from '@/components/professionals/professional-access-panel';
import { AppointmentAvailabilityBoard } from '@/components/appointments/appointment-availability-board';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PROFESSIONAL_RELATIONSHIP_LABELS,
  type AssignableStaffMember,
  type CompensationRule,
  type CompensationScheme,
  type Professional,
  type ProfessionalSchedule,
  type ProfessionalSettlement,
  type ProfessionalSettlementSummary,
  type ProfessionalTimeBlock,
} from '@sincvete/shared';

interface AccessState {
  userId: string | null;
  membershipId: string | null;
  role: string | null;
  isActive: boolean | null;
  email: string | null;
  fullName: string | null;
}

interface ProfessionalProfileClientProps {
  professional: Professional;
  branches: Array<{ id: string; name: string; is_active?: boolean }>;
  branchIds: string[];
  staff: AssignableStaffMember[];
  canWrite: boolean;
  canReadComp: boolean;
  canWriteComp: boolean;
  canReadSettlements: boolean;
  canManageUsers: boolean;
  canWriteAppointments: boolean;
  currency: string;
  settlementSummary: ProfessionalSettlementSummary | null;
  schemes: CompensationScheme[];
  rulesByScheme: Record<string, CompensationRule[]>;
  recentSettlements: ProfessionalSettlement[];
  access: AccessState;
  schedules: ProfessionalSchedule[];
  blocks: ProfessionalTimeBlock[];
  defaultBranchId?: string | null;
  historySlot: React.ReactNode;
  defaultTab?: ProfessionalProfileTab;
}

export function ProfessionalProfileClient({
  professional,
  branches,
  branchIds,
  staff,
  canWrite,
  canReadComp,
  canWriteComp,
  canReadSettlements,
  canManageUsers,
  canWriteAppointments,
  currency,
  settlementSummary,
  schemes,
  rulesByScheme,
  recentSettlements,
  access,
  schedules,
  blocks,
  defaultBranchId,
  historySlot,
  defaultTab = 'resumen',
}: ProfessionalProfileClientProps) {
  const availableTabs = useMemo(() => {
    const tabs: ProfessionalProfileTab[] = ['resumen', 'datos', 'agenda', 'acceso', 'historial'];
    if (canReadComp) tabs.splice(3, 0, 'honorarios');
    if (canReadSettlements) {
      const honorariosIndex = tabs.indexOf('honorarios');
      tabs.splice(honorariosIndex >= 0 ? honorariosIndex + 1 : 3, 0, 'liquidaciones');
    }
    return tabs;
  }, [canReadComp, canReadSettlements]);

  const [tab, setTab] = useState<ProfessionalProfileTab>(
    availableTabs.includes(defaultTab) ? defaultTab : 'resumen'
  );

  const linkedStaff = staff.filter((member) => member.userId === professional.user_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {professional.last_name}, {professional.first_name}
        </h1>
        <p className="text-muted-foreground">
          {PROFESSIONAL_RELATIONSHIP_LABELS[professional.relationship_type]}
          {professional.specialty ? ` · ${professional.specialty}` : ''}
          {!professional.is_active ? ' · Inactivo' : ''}
        </p>
      </div>

      <ProfessionalProfileTabs active={tab} onChange={setTab} availableTabs={availableTabs} />

      {tab === 'resumen' ? (
        <div className="space-y-4">
          {settlementSummary ? (
            <ProfessionalSummaryStrip
              professionalId={professional.id}
              summary={settlementSummary}
              currency={currency}
              canCalculate={canWriteComp}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
                <CardDescription>
                  Completá datos, vinculá acceso y configurá honorarios para operar liquidaciones.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setTab('datos')}>
              Editar datos
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setTab('acceso')}>
              Gestionar acceso
            </Button>
            {canReadComp ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setTab('honorarios')}>
                Honorarios
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/agenda?assigned=${professional.user_id ?? ''}`}>Ver en agenda</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'datos' ? (
        canWrite ? (
          <ProfessionalForm
            mode="edit"
            professional={professional}
            branches={branches}
            branchIds={branchIds}
            staff={staff.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
            hideUserLink
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Datos</CardTitle>
              <CardDescription>Solo lectura</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <p>DNI: {professional.document_number ?? '—'}</p>
              <p>Matrícula: {professional.professional_license ?? '—'}</p>
              <p>Teléfono: {professional.phone ?? '—'}</p>
              <p>Email: {professional.email ?? '—'}</p>
              <p>Especialidad: {professional.specialty ?? '—'}</p>
              <p>Estado: {professional.is_active ? 'Activo' : 'Inactivo'}</p>
            </CardContent>
          </Card>
        )
      ) : null}

      {tab === 'agenda' ? (
        professional.user_id ? (
          <AppointmentAvailabilityBoard
            schedules={schedules}
            blocks={blocks}
            staff={linkedStaff.length > 0 ? linkedStaff : staff}
            branches={branches}
            defaultBranchId={defaultBranchId}
            canWrite={canWriteAppointments}
            lockedUserId={professional.user_id}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Agenda</CardTitle>
              <CardDescription>
                Primero vinculá un usuario en la pestaña Acceso para configurar horarios y bloqueos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => setTab('acceso')}>
                Ir a Acceso
              </Button>
            </CardContent>
          </Card>
        )
      ) : null}

      {tab === 'honorarios' && canReadComp ? (
        <CompensationPanel
          professionalId={professional.id}
          schemes={schemes}
          rulesByScheme={rulesByScheme}
          canWrite={canWriteComp}
          currency={currency}
        />
      ) : null}

      {tab === 'liquidaciones' && canReadSettlements ? (
        <ProfessionalSettlementsLink
          professionalId={professional.id}
          recentSettlements={recentSettlements}
          currency={currency}
        />
      ) : null}

      {tab === 'acceso' ? (
        <ProfessionalAccessPanel
          professionalId={professional.id}
          access={access}
          staff={staff.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
          branches={branches}
          defaultBranchId={defaultBranchId}
          canWrite={canWrite}
          canManageUsers={canManageUsers}
        />
      ) : null}

      {tab === 'historial' ? historySlot : null}
    </div>
  );
}
