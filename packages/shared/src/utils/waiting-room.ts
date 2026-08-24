import type { WaitingRoomListRow } from '../types/waiting-room';

/**
 * Default Waiting Room ordering:
 * 1. highest priority
 * 2. lowest queue_position (nulls last)
 * 3. oldest checked_in_at
 */
export function compareWaitingRoomQueue(
  a: Pick<WaitingRoomListRow, 'priority' | 'queue_position' | 'checked_in_at'>,
  b: Pick<WaitingRoomListRow, 'priority' | 'queue_position' | 'checked_in_at'>
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const posA = a.queue_position;
  const posB = b.queue_position;
  if (posA == null && posB != null) return 1;
  if (posA != null && posB == null) return -1;
  if (posA != null && posB != null && posA !== posB) return posA - posB;
  return a.checked_in_at.localeCompare(b.checked_in_at);
}

export function sortWaitingRoomQueue<T extends Pick<WaitingRoomListRow, 'priority' | 'queue_position' | 'checked_in_at'>>(
  rows: T[]
): T[] {
  return [...rows].sort(compareWaitingRoomQueue);
}
