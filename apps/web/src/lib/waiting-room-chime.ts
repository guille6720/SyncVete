/** Short two-tone chime for waiting-room TV call alerts (Web Audio). */
export function playWaitingRoomCallChime(): void {
  playChime([
    { freq: 880, start: 0, duration: 0.18 },
    { freq: 1174.7, start: 0.2, duration: 0.28 },
  ]);
}

/** Softer single tone when a patient moves to payment pending on TV. */
export function playWaitingRoomPaymentChime(): void {
  playChime([{ freq: 659.25, start: 0, duration: 0.35 }]);
}

type ChimeTone = { freq: number; start: number; duration: number };

function playChime(tones: ChimeTone[]): void {
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

    for (const tone of tones) {
      beep(tone.freq, now + tone.start, tone.duration);
    }

    const totalMs = Math.max(...tones.map((tone) => (tone.start + tone.duration) * 1000)) + 200;
    window.setTimeout(() => {
      void ctx.close();
    }, totalMs);
  } catch {
    // Ignore autoplay / AudioContext failures
  }
}

export const WAITING_ROOM_TV_MUTE_KEY = 'sincvete.waiting-room.tv-muted';
export const WAITING_ROOM_BOARD_MUTE_KEY = 'sincvete.waiting-room.board-muted';

export type WaitingRoomChimeEntry = {
  waiting_room_entry_id: string;
  waiting_room_status: string;
};

export function detectWaitingRoomChimeTransition(
  prev: WaitingRoomChimeEntry[],
  next: WaitingRoomChimeEntry[]
): 'called' | 'payment' | null {
  const prevCalled = new Set(
    prev.filter((row) => row.waiting_room_status === 'called').map((row) => row.waiting_room_entry_id)
  );
  const prevPaymentPending = new Set(
    prev
      .filter((row) => row.waiting_room_status === 'payment_pending')
      .map((row) => row.waiting_room_entry_id)
  );
  const newlyCalled = next.find(
    (row) => row.waiting_room_status === 'called' && !prevCalled.has(row.waiting_room_entry_id)
  );
  if (newlyCalled) return 'called';
  const newlyPaymentPending = next.find(
    (row) =>
      row.waiting_room_status === 'payment_pending' &&
      !prevPaymentPending.has(row.waiting_room_entry_id)
  );
  if (newlyPaymentPending) return 'payment';
  return null;
}

/** Play staff chime when Realtime refresh detects a new call or payment-pending transition. */
export function playWaitingRoomStaffChimesOnRefresh(
  prev: WaitingRoomChimeEntry[],
  next: WaitingRoomChimeEntry[],
  options: { enabled: boolean }
): void {
  if (!options.enabled || readWaitingRoomBoardMuted()) return;
  const transition = detectWaitingRoomChimeTransition(prev, next);
  if (transition === 'called') {
    playWaitingRoomCallChime();
  } else if (transition === 'payment') {
    playWaitingRoomPaymentChime();
  }
}

/** Play TV chime when Realtime refresh detects a new call or payment-pending transition. */
export function playWaitingRoomTvChimesOnRefresh(
  prev: WaitingRoomChimeEntry[],
  next: WaitingRoomChimeEntry[]
): 'called' | 'payment' | null {
  if (readWaitingRoomTvMuted()) return null;
  const transition = detectWaitingRoomChimeTransition(prev, next);
  if (transition === 'called') {
    playWaitingRoomCallChime();
  } else if (transition === 'payment') {
    playWaitingRoomPaymentChime();
  }
  return transition;
}

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

export function readWaitingRoomBoardMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WAITING_ROOM_BOARD_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeWaitingRoomBoardMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WAITING_ROOM_BOARD_MUTE_KEY, muted ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}
