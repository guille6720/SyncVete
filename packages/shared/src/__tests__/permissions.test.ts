import { describe, expect, it } from 'vitest';
import { hasPermission, slugify, getPermissionsForRole } from '../index';

describe('hasPermission', () => {
  it('returns true when user has required permission', () => {
    expect(hasPermission(['patients:read', 'patients:write'], 'patients:read')).toBe(true);
  });

  it('returns false when user lacks permission', () => {
    expect(hasPermission(['patients:read'], 'billing:write')).toBe(false);
  });

  it('checks all permissions when array provided', () => {
    expect(hasPermission(['patients:read', 'billing:read'], ['patients:read', 'billing:read'])).toBe(
      true
    );
    expect(hasPermission(['patients:read'], ['patients:read', 'billing:read'])).toBe(false);
  });
});

describe('slugify', () => {
  it('normalizes spanish characters', () => {
    expect(slugify('Clínica Veterinaria São Paulo')).toBe('clinica-veterinaria-sao-paulo');
  });

  it('removes special characters', () => {
    expect(slugify('Dr. Flow & Co!')).toBe('dr-flow-co');
  });
});

describe('getPermissionsForRole', () => {
  it('returns role defaults when no custom permissions', () => {
    const perms = getPermissionsForRole('receptionist');
    expect(perms).toContain('appointments:write');
    expect(perms).toContain('whatsapp:send');
    expect(perms).toContain('waiting_room:write');
    expect(perms).not.toContain('audit:read');
  });

  it('returns custom permissions when provided', () => {
    const perms = getPermissionsForRole('readonly', ['billing:write']);
    expect(perms).toEqual(['billing:write']);
  });
});
