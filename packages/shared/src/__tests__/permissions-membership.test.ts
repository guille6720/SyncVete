import { describe, expect, it } from 'vitest';
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  mapProfessionalsWriteDbError,
  pickEffectiveBranchMembership,
  roleHasProfessionalsWrite,
  roleLabelForMembership,
  SQL_HAS_PERMISSION_ROLE_KEYS,
  type Role,
} from '../index';

describe('ROLE_PERMISSIONS ↔ professionals write (parity with has_permission SQL)', () => {
  it('owner and admin include professionals:write', () => {
    expect(roleHasProfessionalsWrite('owner')).toBe(true);
    expect(roleHasProfessionalsWrite('admin')).toBe(true);
    expect(ROLE_PERMISSIONS.owner).toEqual(expect.arrayContaining([...SQL_HAS_PERMISSION_ROLE_KEYS]));
    expect(ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining([...SQL_HAS_PERMISSION_ROLE_KEYS]));
  });

  it('veterinarian does not include professionals:write by default', () => {
    expect(roleHasProfessionalsWrite('veterinarian')).toBe(false);
    expect(getPermissionsForRole('veterinarian')).not.toContain('professionals:write');
  });

  it('explicit custom professionals:write works for veterinarian', () => {
    expect(roleHasProfessionalsWrite('veterinarian', ['professionals:write'])).toBe(true);
    expect(getPermissionsForRole('veterinarian', ['professionals:write'])).toEqual([
      'professionals:write',
    ]);
  });

  it('empty custom permissions fall back to role defaults', () => {
    expect(getPermissionsForRole('veterinarian', [])).toEqual(ROLE_PERMISSIONS.veterinarian);
    expect(getPermissionsForRole('owner', null)).toEqual(ROLE_PERMISSIONS.owner);
  });
});

describe('pickEffectiveBranchMembership (session ↔ RLS)', () => {
  const memberships = [
    {
      branch_id: 'branch-old',
      role: 'veterinarian' as Role,
      permissions: [] as const,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      branch_id: 'branch-active',
      role: 'owner' as Role,
      permissions: null,
      created_at: '2026-02-01T00:00:00Z',
    },
  ];

  it('prefers active_branch_id membership', () => {
    const picked = pickEffectiveBranchMembership(memberships, 'branch-active');
    expect(picked?.role).toBe('owner');
    expect(roleLabelForMembership(picked?.role)).toBe(ROLE_LABELS.owner);
  });

  it('falls back to earliest membership when active branch missing', () => {
    const picked = pickEffectiveBranchMembership(memberships, 'branch-missing');
    expect(picked?.branch_id).toBe('branch-old');
    expect(picked?.role).toBe('veterinarian');
    expect(roleLabelForMembership(picked?.role)).toBe(ROLE_LABELS.veterinarian);
  });

  it('UI role label matches effective branch role', () => {
    const effective = pickEffectiveBranchMembership(memberships, 'branch-active');
    expect(roleLabelForMembership(effective?.role)).toBe('Propietario');
    expect(roleLabelForMembership('veterinarian')).toBe('Veterinario');
  });
});

describe('mapProfessionalsWriteDbError', () => {
  it('maps RLS violations to Spanish authz message', () => {
    expect(
      mapProfessionalsWriteDbError({
        message: 'new row violates row-level security policy for table "professionals"',
        code: '42501',
      })
    ).toBe('No tenés permisos para crear profesionales en esta clínica.');
  });

  it('does not leak raw postgres text for unknown errors', () => {
    const msg = mapProfessionalsWriteDbError({
      message: 'permission denied for table secrets_xyz',
    });
    expect(msg).toBe('No tenés permisos para crear profesionales en esta clínica.');
  });
});
