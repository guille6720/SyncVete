'use client';

interface TutorialProgressIndicatorProps {
  current: number;
  total: number;
}

export function TutorialProgressIndicator({ current, total }: TutorialProgressIndicatorProps) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.round(((current + 1) / safeTotal) * 100);
  return (
    <div className="space-y-1" aria-label={`Paso ${current + 1} de ${total}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Paso {current + 1} de {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
