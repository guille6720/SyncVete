import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AGENDA_BASICO_TUTORIAL } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isAcademiaEnabled } from '@/lib/tutorials/feature-flag';

export default function AgendaVideoScriptPage() {
  if (!isAcademiaEnabled()) redirect('/dashboard');

  const scenes = [...AGENDA_BASICO_TUTORIAL.videoScenes].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guion de video — Agenda</h1>
          <p className="text-muted-foreground">
            Narración y storyboard para producción. No hay MP4 generado en este entregable.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/academia">Volver a Tutoriales</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Escenas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scenes.map((scene) => (
            <article key={scene.id} className="rounded-md border p-4">
              <h2 className="font-semibold">
                {scene.order}. {scene.title}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  (~{scene.durationSec}s)
                </span>
              </h2>
              <p className="mt-2 text-sm">
                <span className="font-medium">Narración: </span>
                {scene.narration}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Caption: </span>
                {scene.caption}
              </p>
              {scene.layoutNotes ? (
                <p className="mt-1 text-xs text-muted-foreground">Layout: {scene.layoutNotes}</p>
              ) : null}
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
