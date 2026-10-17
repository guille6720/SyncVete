'use client';

import type { TutorialEngineApi } from '@/components/tutorials/use-tutorial-engine';
import { TutorialTooltip } from '@/components/tutorials/tutorial-tooltip';
import { Button } from '@/components/ui/button';

interface TutorialOverlayProps {
  engine: TutorialEngineApi;
}

export function TutorialOverlay({ engine }: TutorialOverlayProps) {
  const { state, next, previous, skip, restart, pause, resume } = engine;
  if (!state.active || !state.tutorial || !state.step) return null;

  const rect = state.targetRect;
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

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div className="pointer-events-auto absolute inset-0 bg-black/50" aria-hidden />
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background"
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

      <div className="pointer-events-auto">
        <TutorialTooltip
          step={state.step}
          stepIndex={state.stepIndex}
          totalSteps={state.tutorial.steps.length}
          targetRect={state.targetRect}
          targetMissing={state.targetMissing}
          modeLabel={state.mode === 'demo' ? 'Demostración automática (sin guardar datos)' : undefined}
          demoExtra={
            demoScene ? (
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
            ) : null
          }
          onNext={next}
          onPrevious={previous}
          onSkip={skip}
          onRestart={restart}
        />
      </div>
    </div>
  );
}
