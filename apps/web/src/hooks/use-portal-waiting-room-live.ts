'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Subscribes to owner_portal_alerts (RLS-scoped for portal tutors) and polls as fallback.
 * Calls onChange when queue state or alerts may have changed.
 */
export function usePortalWaitingRoomLive(
  onChange: () => void,
  enabled = true,
  pollIntervalMs = 30_000
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const notify = () => onChangeRef.current();
    const supabase = createBrowserClient();
    const channel = supabase
      .channel('portal-waiting-room-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'owner_portal_alerts' },
        () => notify()
      )
      .subscribe();

    const pollId = window.setInterval(notify, pollIntervalMs);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [enabled, pollIntervalMs]);
}
