'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Subscribes to waiting_room_entries changes (RLS-scoped) and polls as fallback.
 * Calls onChange when the queue may have changed.
 */
export function useWaitingRoomLive(onChange: () => void, enabled = true) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const notify = () => onChangeRef.current();
    const supabase = createBrowserClient();
    // Unique topic per mount — board + ops dashboard both subscribe on /sala-espera.
    const channel = supabase
      .channel(`waiting-room-live-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waiting_room_entries' },
        () => notify()
      )
      .subscribe();

    const pollId = window.setInterval(notify, 20_000);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
