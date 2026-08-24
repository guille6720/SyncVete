import { describe, expect, it } from 'vitest';
import { notificationListSchema } from '../schemas';
import {
  buildNotificationHref,
  isNotificationKind,
  isNotificationUnread,
  isSafeNotificationHref,
} from '../utils/notifications';

describe('notificationListSchema', () => {
  it('accepts unread filter and kind', () => {
    const result = notificationListSchema.safeParse({
      page: 1,
      kind: 'laboratorio',
      unreadOnly: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid kind', () => {
    const result = notificationListSchema.safeParse({ kind: 'email' });
    expect(result.success).toBe(false);
  });
});

describe('notification helpers', () => {
  it('builds in-app hrefs', () => {
    expect(buildNotificationHref('cita', 'abc')).toBe('/agenda/abc');
    expect(buildNotificationHref('stock', 'p1')).toBe('/inventario/p1');
    expect(buildNotificationHref('receta', 'r1')).toBe('/farmacia/r1');
    expect(buildNotificationHref('plan', 'ignored')).toBe('/configuracion?tab=plan');
    expect(buildNotificationHref('migracion', 'ignored')).toBe(
      '/configuracion?tab=import-export'
    );
  });

  it('detects kinds and unread state', () => {
    expect(isNotificationKind('factura')).toBe(true);
    expect(isNotificationKind('plan')).toBe(true);
    expect(isNotificationKind('migracion')).toBe(true);
    expect(isNotificationKind('push')).toBe(false);
    expect(isNotificationUnread(null)).toBe(true);
    expect(isNotificationUnread('2026-08-12T12:00:00.000Z')).toBe(false);
  });

  it('allows only relative app hrefs', () => {
    expect(isSafeNotificationHref('/laboratorio/1')).toBe(true);
    expect(isSafeNotificationHref('//evil.example')).toBe(false);
    expect(isSafeNotificationHref('https://evil.example')).toBe(false);
  });
});
