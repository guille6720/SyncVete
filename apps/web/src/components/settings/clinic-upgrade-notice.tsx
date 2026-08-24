'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dismissClinicUpgradeNotice } from '@/actions/plan-billing';
import type { ClinicPlanRecommendationNotice } from '@/lib/plan-recommendations';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export function ClinicUpgradeRecommendationNotice({
  notice,
}: {
  notice: ClinicPlanRecommendationNotice;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <div className="rounded-lg border border-teal-700/25 bg-teal-50/80 px-4 py-3 text-sm text-teal-950 dark:border-teal-700/40 dark:bg-teal-950/30 dark:text-teal-50">
      <p className="font-medium">
        Tu plan actual es {notice.currentPlan ?? 'el actual'}. Según el uso,{' '}
        {notice.recommendedPlan} puede encajar mejor.
      </p>
      {notice.reasons.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 opacity-90">
          {notice.reasons.slice(0, 4).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {notice.gainsPreview?.length ? (
        <p className="mt-2 text-xs opacity-80">
          En {notice.recommendedPlan} suele sumar: {notice.gainsPreview.join(', ')}.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const recommended = notice.recommendedPlan
              ? document.getElementById(`plan-recomendado-${notice.recommendedPlan}`)
              : null;
            const el = recommended ?? document.getElementById('planes-disponibles');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          Ver plan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            void run(async () => {
              const result = await dismissClinicUpgradeNotice();
              if (result.success) {
                setHidden(true);
                router.refresh();
              }
              return result;
            });
          }}
        >
          Ahora no
        </Button>
      </div>
      <p className="mt-2 text-[11px] opacity-70">
        Si elegís “Ahora no”, el aviso se oculta por un tiempo. No cambia tu plan.
      </p>
    </div>
  );
}
