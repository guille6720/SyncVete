'use client';

import Link from 'next/link';
import { BookOpen, CirclePlay, GraduationCap } from 'lucide-react';
import type { AcademyModuleCard } from '@sincvete/shared';
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

export function AcademiaClient({ cards }: AcademiaClientProps) {
  const engine = useOptionalTutorial();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const status = card.progress?.status ?? 'not_started';
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
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => engine?.start(card.tutorialId, 'interactive')}
                  disabled={!engine}
                >
                  <CirclePlay className="mr-2 h-4 w-4" />
                  Iniciar tutorial
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => engine?.start(card.tutorialId, 'demo')}
                  disabled={!engine}
                >
                  Ver demo
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild>
                  <Link href="/academia/agenda/guion">
                    <BookOpen className="mr-2 h-4 w-4" />
                    Guion de video
                  </Link>
                </Button>
              </div>
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
