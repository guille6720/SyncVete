/** Short two-tone chime for waiting-room TV call alerts (Web Audio). */
export function playWaitingRoomCallChime(): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    beep(880, now, 0.18);
    beep(1174.7, now + 0.2, 0.28);

    window.setTimeout(() => {
      void ctx.close();
    }, 800);
  } catch {
    // Ignore autoplay / AudioContext failures
  }
}

export const WAITING_ROOM_TV_MUTE_KEY = 'sincvete.waiting-room.tv-muted';

export function readWaitingRoomTvMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WAITING_ROOM_TV_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeWaitingRoomTvMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WAITING_ROOM_TV_MUTE_KEY, muted ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}
