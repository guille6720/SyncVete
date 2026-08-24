'use client';

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  readWaitingRoomBoardMuted,
  writeWaitingRoomBoardMuted,
} from '@/lib/waiting-room-chime';

interface WaitingRoomStaffSoundToggleProps {
  enabled: boolean;
  variant?: 'light' | 'dark';
  className?: string;
}

export function WaitingRoomStaffSoundToggle({
  enabled,
  variant = 'light',
  className,
}: WaitingRoomStaffSoundToggleProps) {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(readWaitingRoomBoardMuted());
  }, []);

  if (!enabled) return null;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writeWaitingRoomBoardMuted(next);
  };

  const dark = variant === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleMute}
      aria-pressed={muted}
      aria-label={muted ? 'Activar sonido de sala' : 'Silenciar sonido de sala'}
      className={cn(
        dark && 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white',
        className
      )}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {muted ? 'Silenciado' : 'Sonido activo'}
    </Button>
  );
}
