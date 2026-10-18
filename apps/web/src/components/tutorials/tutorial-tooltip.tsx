'use client';

import type { TutorialPlacement, TutorialStep } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { TutorialProgressIndicator } from '@/components/tutorials/tutorial-progress-indicator';

interface TutorialTooltipProps {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  targetMissing: boolean;
  modeLabel?: string;
  demoExtra?: React.ReactNode;
  /** Compact voice narration controls (shared by tutorial + demo). */
  voiceControls?: React.ReactNode;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onRestart: () => void;
}

function resolvePlacement(
  placement: TutorialPlacement | undefined,
  rect: DOMRect | null
): { top: number; left: number } {
  const pad = 12;
  const tooltipW = 340;
  const tooltipH = 220;
  if (!rect) {
    return {
      top: Math.max(pad, window.innerHeight / 2 - tooltipH / 2),
      left: Math.max(pad, window.innerWidth / 2 - tooltipW / 2),
    };
  }
  const place = placement === 'auto' || !placement ? 'bottom' : placement;
  let top = rect.bottom + pad;
  let left = rect.left + rect.width / 2 - tooltipW / 2;

  if (place === 'top') top = rect.top - tooltipH - pad;
  if (place === 'left') {
    top = rect.top;
    left = rect.left - tooltipW - pad;
  }
  if (place === 'right') {
    top = rect.top;
    left = rect.right + pad;
  }
  if (place === 'center') {
    top = window.innerHeight / 2 - tooltipH / 2;
    left = window.innerWidth / 2 - tooltipW / 2;
  }

  top = Math.min(Math.max(pad, top), window.innerHeight - tooltipH - pad);
  left = Math.min(Math.max(pad, left), window.innerWidth - tooltipW - pad);
  return { top, left };
}

export function TutorialTooltip({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  targetMissing,
  modeLabel,
  demoExtra,
  voiceControls,
  onNext,
  onPrevious,
  onSkip,
  onRestart,
}: TutorialTooltipProps) {
  const pos = resolvePlacement(step.placement, targetRect);
  const isLast = stepIndex >= totalSteps - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-step-title"
      className="fixed z-[70] w-[min(100vw-1.5rem,340px)] rounded-lg border bg-background p-4 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <TutorialProgressIndicator current={stepIndex} total={totalSteps} />
      {modeLabel ? (
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-primary">{modeLabel}</p>
      ) : null}
      <h2 id="tutorial-step-title" className="mt-2 text-base font-semibold">
        {step.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
      {targetMissing ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Este elemento no está visible ahora (permiso o pantalla distinta). Podés continuar igual.
        </p>
      ) : null}
      {voiceControls}
      {demoExtra}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
          Saltar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRestart}>
          Reiniciar
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={stepIndex === 0}
          >
            Anterior
          </Button>
          <Button type="button" size="sm" onClick={onNext}>
            {isLast ? 'Finalizar' : 'Siguiente'}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Teclado: ← → para navegar, Esc para saltar
      </p>
    </div>
  );
}
