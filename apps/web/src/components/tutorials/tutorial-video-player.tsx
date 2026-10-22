'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { getTutorialById, type VideoScene } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { useTutorialNarration } from '@/components/tutorials/use-tutorial-narration';
import { getNarrationController } from '@/lib/tutorials/narration-controller';
import { waitForDemoSceneAdvance } from '@/lib/tutorials/demo-scene-advance';
import { cn } from '@/lib/utils';

interface TutorialVideoPlayerProps {
  tutorialId: string;
  open: boolean;
  onClose: () => void;
}

function sortedScenes(tutorialId: string): VideoScene[] {
  const tutorial = getTutorialById(tutorialId);
  if (!tutorial) return [];
  return [...tutorial.videoScenes].sort((a, b) => a.order - b.order);
}

export function TutorialVideoPlayer({
  tutorialId,
  open,
  onClose,
}: TutorialVideoPlayerProps) {
  const tutorial = useMemo(() => getTutorialById(tutorialId), [tutorialId]);
  const scenes = useMemo(() => sortedScenes(tutorialId), [tutorialId]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const cancelledRef = useRef(false);
  const playingRef = useRef(playing);
  const runIdRef = useRef(0);

  playingRef.current = playing;

  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setIndex(0);
    setPlaying(true);
    setFinished(false);
    return () => {
      cancelledRef.current = true;
      getNarrationController().stop();
    };
  }, [open, tutorialId]);

  const scene = scenes[index] ?? null;

  const narration = useTutorialNarration({
    text: scene?.narration ?? null,
    ready: open && Boolean(scene) && !finished,
    active: open,
    paused: !playing,
    tutorialId,
    clipId: scene?.id ?? null,
  });

  useEffect(() => {
    if (!open || !scene || finished) return;

    const runId = ++runIdRef.current;
    cancelledRef.current = false;
    const controller = getNarrationController();
    const minMs = Math.max(2_400, Math.round((scene.durationSec || 8) * 700));
    const waitForNarration = !narration.muted && narration.supported;

    void (async () => {
      const ok = await waitForDemoSceneAdvance({
        engine: controller,
        minMs,
        waitForNarration,
        isCancelled: () => cancelledRef.current || runId !== runIdRef.current,
        isPaused: () => !playingRef.current,
      });
      if (!ok || runId !== runIdRef.current) return;

      if (index >= scenes.length - 1) {
        setFinished(true);
        setPlaying(false);
        return;
      }
      setIndex((prev) => prev + 1);
    })();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muted/supported read once per scene
  }, [open, scene?.id, index, scenes.length, finished]);

  if (!open || !tutorial) return null;

  const progressLabel =
    scenes.length > 0 ? `${Math.min(index + 1, scenes.length)} / ${scenes.length}` : '0 / 0';
  const pct =
    scenes.length === 0
      ? 0
      : Math.round(((finished ? scenes.length : index + 1) / scenes.length) * 100);

  const handleClose = () => {
    cancelledRef.current = true;
    narration.stop();
    onClose();
  };

  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= scenes.length) return;
    cancelledRef.current = true;
    runIdRef.current += 1;
    setFinished(false);
    setIndex(nextIndex);
    setPlaying(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        aria-label="Cerrar explicación"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-video-title"
        className={cn(
          'relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card shadow-2xl',
          'max-h-[min(78vh,560px)]'
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Explicación del módulo
            </p>
            <h2
              id="tutorial-video-title"
              className="truncate text-base font-semibold text-foreground"
            >
              {tutorial.title}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative aspect-video w-full bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950">
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
            <p className="text-[11px] uppercase tracking-[0.14em] text-teal-200/90">
              SyncVete · {progressLabel}
            </p>
            <p className="mt-3 text-lg font-semibold leading-snug">
              {finished ? 'Fin de la explicación' : scene?.title ?? 'Sin escenas'}
            </p>
            <p className="mt-2 max-w-sm text-sm text-slate-200/90">
              {finished
                ? 'Podés volver a reproducir o cerrar esta ventana.'
                : scene?.caption ?? ''}
            </p>
          </div>
        </div>

        <div className="space-y-3 border-t px-4 py-3">
          <label className="block space-y-1.5">
            <span className="sr-only">Barra de desplazamiento del video</span>
            <input
              type="range"
              min={0}
              max={Math.max(scenes.length - 1, 0)}
              step={1}
              value={finished ? Math.max(scenes.length - 1, 0) : index}
              disabled={scenes.length === 0}
              onChange={(event) => goTo(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              aria-valuetext={`Escena ${index + 1} de ${scenes.length}`}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>La explicación sigue sola · {pct}%</span>
              <span>{progressLabel}</span>
            </div>
          </label>

          <p className="min-h-[3rem] text-sm leading-relaxed text-muted-foreground">
            {finished
              ? 'Explicación completa. Usá Repetir o cerrá para volver a Tutoriales.'
              : scene?.narration ?? 'Este módulo todavía no tiene escenas de video.'}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {playing && !finished ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  narration.pause();
                }}
              >
                <Pause className="mr-1.5 h-4 w-4" />
                Pausar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={scenes.length === 0}
                onClick={() => {
                  if (finished) {
                    goTo(0);
                    return;
                  }
                  setPlaying(true);
                  narration.resume();
                }}
              >
                <Play className="mr-1.5 h-4 w-4" />
                {finished ? 'Repetir' : 'Continuar'}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={narration.toggleMute}
              aria-label={narration.muted ? 'Activar voz' : 'Silenciar voz'}
            >
              {narration.muted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
