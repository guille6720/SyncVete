export const WAITING_ROOM_STATUSES = [
  'waiting',
  'called',
  'in_consultation',
  'payment_pending',
  'completed',
] as const;

export type WaitingRoomStatus = (typeof WAITING_ROOM_STATUSES)[number];

export const WAITING_ROOM_STATUS_LABELS: Record<WaitingRoomStatus, string> = {
  waiting: 'En espera',
  called: 'Llamado',
  in_consultation: 'En consulta',
  payment_pending: 'Pago pendiente',
  completed: 'Completado',
};

export const WAITING_ROOM_STATUS_VARIANT: Record<
  WaitingRoomStatus,
  'default' | 'success' | 'destructive' | 'warning'
> = {
  waiting: 'default',
  called: 'warning',
  in_consultation: 'warning',
  payment_pending: 'warning',
  completed: 'success',
};

export const WAITING_ROOM_NEXT_ACTION_LABELS: Record<
  Exclude<WaitingRoomStatus, 'completed'>,
  string
> = {
  waiting: 'Llamar',
  called: 'Iniciar consulta',
  in_consultation: 'Pasar a pago',
  payment_pending: 'Completar',
};

export const PORTAL_WAITING_ROOM_STATUS_MESSAGES: Record<WaitingRoomStatus, string> = {
  waiting: 'Tu mascota está en la sala de espera',
  called: '¡Te están llamando! Acercate a la clínica',
  in_consultation: 'Tu mascota está en consulta',
  payment_pending: 'Atención lista · pendiente de pago en recepción',
  completed: 'Atención finalizada',
};

/** Valid sequential transitions for Waiting Room workflow. */
export const WAITING_ROOM_TRANSITIONS: Record<WaitingRoomStatus, WaitingRoomStatus | null> = {
  waiting: 'called',
  called: 'in_consultation',
  in_consultation: 'payment_pending',
  payment_pending: 'completed',
  completed: null,
};

export function isWaitingRoomStatus(value: string): value is WaitingRoomStatus {
  return (WAITING_ROOM_STATUSES as readonly string[]).includes(value);
}

export function canTransitionWaitingRoomStatus(
  from: WaitingRoomStatus,
  to: WaitingRoomStatus
): boolean {
  return WAITING_ROOM_TRANSITIONS[from] === to;
}

export function appointmentStatusAfterWaitingRoom(
  status: WaitingRoomStatus
): 'en_curso' | 'completada' | null {
  if (status === 'in_consultation') return 'en_curso';
  if (status === 'completed') return 'completada';
  return null;
}
