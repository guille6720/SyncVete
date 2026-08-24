'use client';

import { useState } from 'react';
import { SettingsTabs, type SettingsTab } from '@/components/settings/settings-tabs';
import { ClinicSettingsForm } from '@/components/settings/clinic-settings-form';
import { BranchesPanel } from '@/components/settings/branches-panel';
import { TeamPanel } from '@/components/settings/team-panel';
import { RolesPanel } from '@/components/settings/roles-panel';
import { PlanBillingPanel } from '@/components/settings/plan-billing-panel';
import { SettingsLegalPanel } from '@/components/settings/settings-legal-panel';
import { SettingsSuperadminManualPanel } from '@/components/settings/settings-superadmin-manual-panel';
import { DataMigrationPanel } from '@/components/settings/data-migration-panel';
import type { PlanBillingState } from '@/actions/plan-billing';
import type {
  Branch,
  OrganizationInvitation,
  OrganizationSettings,
  PaginatedResult,
  SeatUsageMeter,
  TeamMemberRow,
} from '@sincvete/shared';

interface SettingsPageClientProps {
  availableTabs: SettingsTab[];
  defaultTab: SettingsTab;
  canImportData?: boolean;
  canExportData?: boolean;
  clinic?: {
    organizationName: string;
    settings: OrganizationSettings;
  };
  branches?: PaginatedResult<Branch>;
  team?: {
    members: PaginatedResult<TeamMemberRow>;
    invitations: OrganizationInvitation[];
    branches: Branch[];
  };
  seats?: SeatUsageMeter[];
  planBilling?: PlanBillingState;
  checkoutBanner?: string | null;
}

export function SettingsPageClient({
  availableTabs,
  defaultTab,
  canImportData = false,
  canExportData = false,
  clinic,
  branches,
  team,
  seats = [],
  planBilling,
  checkoutBanner,
}: SettingsPageClientProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Administrá tu clínica, plan, sucursales, equipo, permisos, importación/exportación y
          documentos legales
        </p>
      </div>

      <SettingsTabs active={activeTab} onChange={setActiveTab} availableTabs={availableTabs} />

      {activeTab === 'clinica' && clinic && (
        <ClinicSettingsForm
          organizationName={clinic.organizationName}
          settings={clinic.settings}
        />
      )}

      {activeTab === 'sucursales' && branches && (
        <BranchesPanel initialData={branches} seatMeter={seats.find((meter) => meter.featureKey === 'branches.max')} />
      )}

      {activeTab === 'equipo' && team && (
        <TeamPanel
          members={team.members}
          invitations={team.invitations}
          branches={team.branches}
          seatMeters={seats.filter(
            (meter) => meter.featureKey === 'users.max' || meter.featureKey === 'professionals.max'
          )}
        />
      )}

      {activeTab === 'roles' && <RolesPanel />}
      {activeTab === 'import-export' && (canImportData || canExportData) ? (
        <DataMigrationPanel canImport={canImportData} canExport={canExportData} />
      ) : null}
      {activeTab === 'legal' && <SettingsLegalPanel />}
      {activeTab === 'guia-superadmin' && availableTabs.includes('guia-superadmin') ? (
        <SettingsSuperadminManualPanel />
      ) : null}
      {activeTab === 'plan' && planBilling ? (
        <PlanBillingPanel state={planBilling} checkoutBanner={checkoutBanner} />
      ) : activeTab === 'plan' ? (
        <p className="text-sm text-muted-foreground">
          No se pudo cargar el plan. Superadmin puede asignarlo mientras tanto.
        </p>
      ) : null}
    </div>
  );
}
