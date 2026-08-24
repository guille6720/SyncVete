'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  PROFESSIONAL_RELATIONSHIP_LABELS,
  type Professional,
} from '@sincvete/shared';

interface ProfessionalsListProps {
  professionals: Professional[];
}

export function ProfessionalsList({ professionals }: ProfessionalsListProps) {
  if (professionals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Todavía no hay profesionales registrados.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {professionals.map((professional) => (
        <Link
          key={professional.id}
          href={`/profesionales/${professional.id}`}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
        >
          <div>
            <p className="font-medium">
              {professional.last_name}, {professional.first_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {PROFESSIONAL_RELATIONSHIP_LABELS[professional.relationship_type]}
              {professional.specialty ? ` · ${professional.specialty}` : ''}
            </p>
          </div>
          <Badge variant={professional.is_active ? 'success' : 'default'}>
            {professional.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
