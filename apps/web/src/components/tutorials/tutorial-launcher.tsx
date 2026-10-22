'use client';

import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOptionalTutorial } from '@/components/tutorials/tutorial-provider';
import type { TutorialMode } from '@sincvete/shared';

interface TutorialLauncherProps {
  tutorialId: string;
  label?: string;
  mode?: TutorialMode;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function TutorialLauncher({
  tutorialId,
  label = 'Ver tutorial',
  mode = 'interactive',
  variant = 'outline',
  size = 'sm',
  className,
}: TutorialLauncherProps) {
  const tutorial = useOptionalTutorial();
  if (!tutorial) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => tutorial.start(tutorialId, mode)}
      data-tour="tutorial-launcher"
    >
      <GraduationCap className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
