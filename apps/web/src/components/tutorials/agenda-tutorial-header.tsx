'use client';

import { TutorialLauncher } from '@/components/tutorials/tutorial-launcher';

export function AgendaTutorialHeader() {
  return (
    <div className="flex flex-wrap gap-2">
      <TutorialLauncher tutorialId="agenda-basico" label="Ver tutorial" />
      <TutorialLauncher
        tutorialId="agenda-basico"
        label="Ver demo"
        mode="demo"
        variant="ghost"
      />
    </div>
  );
}
