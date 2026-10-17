'use client';

import { useEffect, useRef } from 'react';
import type { TutorialEngineApi } from '@/components/tutorials/use-tutorial-engine';
import { TutorialTooltip } from '@/components/tutorials/tutorial-tooltip';
import { Button } from '@/components/ui/button';

interface TutorialOverlayProps {
  engine: TutorialEngineApi;
}

export function TutorialOverlay({ engine }: TutorialOverlayProps) {
  const { state, next, previous, skip, restart, pause, resume } = engine;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state.active || state.navigating) return;
    const node = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    node?.focus({ preventScroll: true });
  }, [state.active, state.stepIndex, state.navigating]);

  if (!state.active || !state.tutorial || !state.step) return null;

  const rect = state.targetRect;
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hole = rect
    ? {
        top: Math.max(0, rect.top - 6),
        left: Math.max(0, rect.left - 6),
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : null;

  const demoScene =
    state.mode === 'demo'
      ? state.tutorial.demoScenes[
          Math.min(state.demoSceneIndex, state.tutorial.demoScenes.length - 1)
        ]
      : null;

  const fallbackPanel =
    state.demoFallbackActive && state.step.allowDemoFallback ? (
      <div className="mt-3 rounded-md border border-dashed border-amber-500/50 bg-amber-50/80 p-3 text-sm dark:bg-amber-950/30">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Demostración etiquetada (sin datos reales)
        </p>
        <p className="mt-1 text-muted-foreground">
          Todavía no hay un turno de la organización Academia Demo en esta clínica. Se muestra un
          ejemplo ficticio: Luna (canino) · María Ejemplo · Dra. Ana Demo. No se abre ni modifica
          ninguna cita real.
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">estado:</span> confirmada (simulado)
          </li>
          <li>
            <span className="font-medium text-foreground">horario:</span> Martes 10:30 (simulado)
          </li>
        </ul>
      </div>
    ) : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div
        className={`pointer-events-auto absolute inset-0 bg-black/50 ${
          reduceMotion ? '' : 'transition-opacity duration-300'
        }`}
        aria-hidden
      />
      {hole && !state.navigating ? (
        <div
          className={`pointer-events-none absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background ${
            reduceMotion ? '' : 'transition-[top,left,width,height] duration-300 ease-out'
          }`}
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
          aria-hidden
        />
      ) : null}

      <div className="pointer-events-auto" ref={dialogRef}>
        {state.navigating ? (
          <div
            role="status"
            aria-live="polite"
            className="fixed left-1/2 top-1/2 z-[70] w-[min(100vw-1.5rem,320px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 text-center shadow-lg"
          >
            <p className="text-sm font-medium">Cargando el siguiente paso…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Esperando a que la pantalla y el elemento estén listos.
            </p>
          </div>
        ) : (
          <TutorialTooltip
            step={state.step}
            stepIndex={state.stepIndex}
            totalSteps={state.tutorial.steps.length}
            targetRect={state.targetRect}
            targetMissing={state.targetMissing && !state.demoFallbackActive}
            modeLabel={
              state.mode === 'demo'
                ? 'Demostración automática (sin guardar datos)'
                : undefined
            }
            demoExtra={
              <>
                {fallbackPanel}
                {demoScene ? (
                  <div className="mt-3 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
                    <p className="font-medium">{demoScene.headline}</p>
                    <p className="mt-1 text-muted-foreground">{demoScene.body}</p>
                    {demoScene.mockLabels ? (
                      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {Object.entries(demoScene.mockLabels).map(([k, v]) => (
                          <li key={k}>
                            <span className="font-medium text-foreground">{k}:</span> {v}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      {state.paused ? (
                        <Button type="button" size="sm" variant="outline" onClick={resume}>
                          Reanudar
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={pause}>
                          Pausar
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            }
            onNext={next}
            onPrevious={previous}
            onSkip={skip}
            onRestart={restart}
          />
        )}
      </div>
    </div>
  );
}
