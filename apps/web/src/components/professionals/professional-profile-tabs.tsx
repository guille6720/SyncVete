'use client';

import { cn } from '@/lib/utils';

export type ProfessionalProfileTab =
  | 'resumen'
  | 'datos'
  | 'agenda'
  | 'honorarios'
  | 'liquidaciones'
  | 'acceso'
  | 'historial';

const TABS: Array<{ id: ProfessionalProfileTab; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'datos', label: 'Datos' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'honorarios', label: 'Honorarios' },
  { id: 'liquidaciones', label: 'Liquidaciones' },
  { id: 'acceso', label: 'Acceso' },
  { id: 'historial', label: 'Historial' },
];

interface ProfessionalProfileTabsProps {
  active: ProfessionalProfileTab;
  onChange: (tab: ProfessionalProfileTab) => void;
  availableTabs: ProfessionalProfileTab[];
}

export function ProfessionalProfileTabs({
  active,
  onChange,
  availableTabs,
}: ProfessionalProfileTabsProps) {
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
