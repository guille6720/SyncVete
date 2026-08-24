'use client';

import { cn } from '@/lib/utils';

export type SettingsTab =
  | 'clinica'
  | 'sucursales'
  | 'equipo'
  | 'roles'
  | 'plan'
  | 'legal'
  | 'import-export'
  | 'guia-superadmin';

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'clinica', label: 'Clínica' },
  { id: 'plan', label: 'Plan' },
  { id: 'sucursales', label: 'Sucursales' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'roles', label: 'Roles' },
  { id: 'import-export', label: 'Importar / Exportar' },
  { id: 'legal', label: 'Legal' },
  { id: 'guia-superadmin', label: 'Guía Superadmin' },
];

interface SettingsTabsProps {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  availableTabs: SettingsTab[];
}

export function SettingsTabs({ active, onChange, availableTabs }: SettingsTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b pb-2">
      {TABS.filter((tab) => availableTabs.includes(tab.id)).map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === tab.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export { TABS };
