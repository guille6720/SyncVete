import type { OrganizationSettings } from '../types';

const MAX_WAITING_ROOM_ROOMS = 20;
const MAX_WAITING_ROOM_ROOM_LEN = 40;

export function normalizeWaitingRoomRooms(
  input: string | string[] | null | undefined
): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\n,;]+/)
      : [];
  const seen = new Set<string>();
  const rooms: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const room = item.trim().replace(/\s+/g, ' ').slice(0, MAX_WAITING_ROOM_ROOM_LEN);
    if (!room) continue;
    const key = room.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rooms.push(room);
    if (rooms.length >= MAX_WAITING_ROOM_ROOMS) break;
  }
  return rooms;
}

export function formatWaitingRoomRoomsText(rooms: string[] | null | undefined): string {
  return (rooms ?? []).join('\n');
}

export function parseOrganizationSettings(
  settings: Record<string, unknown> | null | undefined
): OrganizationSettings {
  if (!settings || typeof settings !== 'object') return {};

  const rooms = normalizeWaitingRoomRooms(
    Array.isArray(settings.waitingRoomRooms)
      ? (settings.waitingRoomRooms as string[])
      : typeof settings.waitingRoomRooms === 'string'
        ? settings.waitingRoomRooms
        : undefined
  );

  let waitingRoomMinutesPerPatient: number | null | undefined;
  const rawMinutes = settings.waitingRoomMinutesPerPatient;
  if (rawMinutes == null) {
    waitingRoomMinutesPerPatient = undefined;
  } else if (typeof rawMinutes === 'number' && Number.isFinite(rawMinutes) && rawMinutes > 0) {
    waitingRoomMinutesPerPatient = Math.min(120, Math.round(rawMinutes));
  } else if (typeof rawMinutes === 'string' && /^\d+$/.test(rawMinutes.trim())) {
    const parsed = Number(rawMinutes.trim());
    waitingRoomMinutesPerPatient = parsed > 0 ? Math.min(120, parsed) : undefined;
  }

  let waitingRoomPortalAlertsEnabled: boolean | undefined;
  const rawPortalAlerts = settings.waitingRoomPortalAlertsEnabled;
  if (rawPortalAlerts === false || rawPortalAlerts === 'false') {
    waitingRoomPortalAlertsEnabled = false;
  } else if (rawPortalAlerts === true || rawPortalAlerts === 'true') {
    waitingRoomPortalAlertsEnabled = true;
  }

  let waitingRoomWhatsAppAutoEnabled: boolean | undefined;
  const rawWhatsAppAuto = settings.waitingRoomWhatsAppAutoEnabled;
  if (rawWhatsAppAuto === true || rawWhatsAppAuto === 'true') {
    waitingRoomWhatsAppAutoEnabled = true;
  } else if (rawWhatsAppAuto === false || rawWhatsAppAuto === 'false') {
    waitingRoomWhatsAppAutoEnabled = false;
  }

  let waitingRoomBoardSoundEnabled: boolean | undefined;
  const rawBoardSound = settings.waitingRoomBoardSoundEnabled;
  if (rawBoardSound === true || rawBoardSound === 'true') {
    waitingRoomBoardSoundEnabled = true;
  } else if (rawBoardSound === false || rawBoardSound === 'false') {
    waitingRoomBoardSoundEnabled = false;
  }

  return {
    timezone: typeof settings.timezone === 'string' ? settings.timezone : undefined,
    currency: typeof settings.currency === 'string' ? settings.currency : undefined,
    phone: typeof settings.phone === 'string' ? settings.phone : undefined,
    email: typeof settings.email === 'string' ? settings.email : undefined,
    taxId: typeof settings.taxId === 'string' ? settings.taxId : undefined,
    waitingRoomRooms: rooms.length > 0 ? rooms : undefined,
    waitingRoomMinutesPerPatient,
    waitingRoomPortalAlertsEnabled,
    waitingRoomWhatsAppAutoEnabled,
    waitingRoomBoardSoundEnabled,
  };
}

/** Default true when unset in org JSON settings. */
export function isWaitingRoomPortalAlertsEnabled(
  settings: Record<string, unknown> | OrganizationSettings | null | undefined
): boolean {
  if (!settings || typeof settings !== 'object') return true;
  if ('waitingRoomPortalAlertsEnabled' in settings) {
    return settings.waitingRoomPortalAlertsEnabled !== false;
  }
  return true;
}

export function mergeOrganizationSettings(
  current: Record<string, unknown> | null | undefined,
  patch: OrganizationSettings
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(current && typeof current === 'object' ? current : {}),
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null || value === '') {
      delete next[key];
      continue;
    }
    if (key === 'waitingRoomRooms' && Array.isArray(value) && value.length === 0) {
      delete next[key];
      continue;
    }
    if (key === 'waitingRoomPortalAlertsEnabled' && value === true) {
      delete next[key];
      continue;
    }
    if (key === 'waitingRoomWhatsAppAutoEnabled' && value === false) {
      delete next[key];
      continue;
    }
    if (key === 'waitingRoomBoardSoundEnabled' && value === false) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }

  return next;
}

export function generateBranchCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()
    .slice(0, 12) || 'SUC';
}
