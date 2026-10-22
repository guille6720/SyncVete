'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, Clapperboard, GraduationCap, MonitorPlay } from 'lucide-react';
import { getTutorialById, type AcademyModuleCard, type VideoScene } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOptionalTutorial } from '@/components/tutorials/tutorial-provider';

const DIFFICULTY_LABEL: Record<AcademyModuleCard['difficulty'], string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Sin empezar',
  in_progress: 'En curso',
  completed: 'Completado',
  skipped: 'Omitido',
};

interface AcademiaClientProps {
  cards: AcademyModuleCard[];
}

function moduleVideoScenes(tutorialId: string): VideoScene[] {
  const tutorial = getTutorialById(tutorialId);
  if (!tutorial) return [];
  return [...tutorial.videoScenes].sort((a, b) => a.order - b.order);
}

export function AcademiaClient({ cards }: AcademiaClientProps) {
  const engine = useOptionalTutorial();

  const sceneCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const card of cards) {
      map.set(card.tutorialId, moduleVideoScenes(card.tutorialId).length);
    }
    return map;
  }, [cards]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const status = card.progress?.status ?? 'not_started';
        const scenes = moduleVideoScenes(card.tutorialId);
        const sceneCount = sceneCounts.get(card.tutorialId) ?? 0;
        return (
          <Card key={card.tutorialId}>
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{card.title}</CardTitle>
                <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{DIFFICULTY_LABEL[card.difficulty]}</Badge>
                <Badge variant="warning">~{card.estimatedMinutes} min</Badge>
                <Badge variant={status === 'completed' ? 'success' : 'default'}>
                  {STATUS_LABEL[status] ?? status}
                </Badge>
                <Badge variant="default">{sceneCount} pasos</Badge>
              </div>

              {scenes.length > 0 ? (
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Clapperboard className="h-3.5 w-3.5" aria-hidden />
                    Recorrido del módulo
                  </p>
                  <ol className="space-y-1 text-xs text-muted-foreground">
                    {scenes.map((scene, sceneIndex) => (
                      <li key={scene.id} className="flex gap-2">
                        <span className="w-4 shrink-0 tabular-nums text-foreground/70">
                          {sceneIndex + 1}.
                        </span>
                        <span>{scene.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Todavía no hay explicación para este módulo.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => engine?.start(card.tutorialId, 'demo')}
                  disabled={!engine || scenes.length === 0}
                >
                  <MonitorPlay className="mr-2 h-4 w-4" />
                  Reproducir
                </Button>
                {card.tutorialId === 'agenda-basico' ? (
                  <Button type="button" size="sm" variant="ghost" asChild>
                    <Link href="/academia/agenda/guion">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Guion de video
                    </Link>
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Reproducción continua con voz: se avanza solo. Solo tenés que pausar o terminar.
              </p>
              <Button type="button" variant="ghost" className="h-auto px-0 text-sm" asChild>
                <Link href={card.startRoute}>Ir al módulo</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
