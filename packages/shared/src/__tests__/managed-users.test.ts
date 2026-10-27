import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMPLIED_PERMISSIONS,
  INVITABLE_ROLES,
  PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_MATRIX,
  ROLES,
  ROLE_PERMISSIONS,
  activityModuleForEntity,
  describeActivity,
  getPermissionsForRole,
  managedUserErrorMessage,
  summarizeUserAgent,
  type Role,
} from '../index';

const MIGRATION = resolve(
  __dirname,
  '../../../../supabase/migrations/20261014120000_central_admin_managed_users.sql'
);
const migrationsDir = resolve(__dirname, '../../../../supabase/migrations');
const agendaRoleSql = readFileSync(
  resolve(
    migrationsDir,
    readdirSync(migrationsDir).find((name) =>
      name.endsWith('_veterinarian_professional_agendas.sql')
    )!
  ),
  'utf8'
);

function sqlArray(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  expect(start, `marker ${marker}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('ARRAY[', start);
  const close = source.indexOf(']', open);
  return [...source.slice(open, close).matchAll(/'([a-z_]+:[a-z_]+)'/g)].map((m) => m[1]!).sort();
}

describe('getPermissionsForRole with restrictions', () => {
  it('lets veterinarians consult colleagues and agendas without managing staff or finances', () => {
    const permissions = getPermissionsForRole('veterinarian');
    expect(permissions).toContain('appointments:read');
    expect(permissions).toContain('professionals:read');
    for (const permission of [
      'professionals:write',
      'professional_compensation:read',
      'professional_compensation:write',
      'professional_settlements:read',
      'professional_settlements:approve',
      'professional_settlements:pay',
      'users:manage',
    ]) {
      expect(permissions).not.toContain(permission);
    }
    expect(getPermissionsForRole('veterinarian', null, ['professionals:read'])).not.toContain(
      'professionals:read'
    );
    expect(getPermissionsForRole('veterinarian', ['appointments:read'])).not.toContain(
      'professionals:read'
    );
  });
  it('removes denied permissions and never adds new ones', () => {
    const base = getPermissionsForRole('receptionist');
    const restricted = getPermissionsForRole('receptionist', null, ['whatsapp:send', 'audit:read']);
    expect(restricted).not.toContain('whatsapp:send');
    expect(restricted).not.toContain('audit:read');
    expect(restricted.every((p) => base.includes(p))).toBe(true);
    expect(restricted.length).toBe(base.length - 1);
  });

  it('denying a parent also removes implied children', () => {
    const perms = getPermissionsForRole('veterinarian', null, ['appointments:write']);
    expect(perms).not.toContain('appointments:write');
    expect(perms).not.toContain('appointments:cancel');
    expect(perms).toContain('appointments:read');
  });

  it('denying only the child keeps the parent', () => {
    const perms = getPermissionsForRole('cashier', null, ['billing:cancel']);
    expect(perms).toContain('billing:write');
    expect(perms).not.toContain('billing:cancel');
  });

  it('expands implied children from role grants', () => {
    const perms = getPermissionsForRole('receptionist');
    expect(perms).toContain('appointments:cancel');
    expect(perms).toContain('patients:delete');
  });

  it('never restricts the Central Admin (owner)', () => {
    const perms = getPermissionsForRole('owner', null, ['users:manage', 'billing:write']);
    expect(perms).toContain('users:manage');
    expect(perms).toContain('billing:write');
  });

  it('readonly cannot gain write through restrictions', () => {
    const perms = getPermissionsForRole('readonly', null, ['patients:read']);
    expect(perms.some((p) => p.endsWith(':write'))).toBe(false);
  });
});

describe('SQL / TypeScript permission parity', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('permission_catalog() matches PERMISSIONS', () => {
    const catalog = sqlArray(sql, 'FUNCTION public.permission_catalog()');
    expect(catalog).toEqual([...PERMISSIONS].sort());
  });

  it.each(ROLES.filter((r) => r !== 'owner'))(
    'role_permissions(%s) matches ROLE_PERMISSIONS',
    (role) => {
      const block = agendaRoleSql.slice(agendaRoleSql.indexOf('FUNCTION public.role_permissions('));
      const sqlPerms = sqlArray(block, `WHEN '${role}'`);
      expect(sqlPerms).toEqual([...ROLE_PERMISSIONS[role as Role]].sort());
    }
  );

  it('owner holds the full catalog', () => {
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('implied permissions match permission_parent()', () => {
    for (const [child, parent] of Object.entries(IMPLIED_PERMISSIONS)) {
      expect(sql).toMatch(new RegExp(`WHEN '${child}' THEN '${parent}'`));
    }
  });
});

describe('managed-user catalog', () => {
  it('permission matrix only references real permission keys with labels', () => {
    for (const module of PERMISSION_MATRIX) {
      for (const action of module.actions) {
        expect(PERMISSIONS).toContain(action.permission);
        expect(PERMISSION_LABELS[action.permission]).toBeTruthy();
      }
    }
  });

  it('every permission appears in the matrix', () => {
    const inMatrix = new Set(PERMISSION_MATRIX.flatMap((m) => m.actions.map((a) => a.permission)));
    expect(PERMISSIONS.filter((p) => !inMatrix.has(p))).toEqual([]);
  });

  it('Central Admin role is not directly invitable', () => {
    expect(INVITABLE_ROLES).not.toContain('owner');
  });
});

describe('managedUserErrorMessage', () => {
  it('maps the seat limit to the required Spanish message', () => {
    expect(managedUserErrorMessage('MANAGED_USER_LIMIT_REACHED:10')).toBe(
      'Alcanzaste el límite de 10 usuarios para tu organización.'
    );
  });

  it('maps escalation and protection errors', () => {
    expect(managedUserErrorMessage('CANNOT_GRANT_PERMISSION:billing:write')).toContain(
      'billing:write'
    );
    expect(managedUserErrorMessage('SELF_MODIFICATION_NOT_ALLOWED')).toMatch(/propio/);
    expect(managedUserErrorMessage('LAST_CENTRAL_ADMIN')).toMatch(/al menos un administrador/);
    expect(managedUserErrorMessage('PERMISSION_DENIED:appointments:cancel')).toContain(
      'appointments:cancel'
    );
  });

  it('returns null for unknown errors', () => {
    expect(managedUserErrorMessage('duplicate key value')).toBeNull();
    expect(managedUserErrorMessage(null)).toBeNull();
  });
});

describe('activity helpers', () => {
  it('describes status changes and managed-user events', () => {
    expect(
      describeActivity({
        action: 'update',
        entityType: 'appointments',
        statusFrom: 'programada',
        statusTo: 'cancelada',
      })
    ).toBe('Canceló/anuló turno');
    expect(describeActivity({ action: 'permissions_updated', entityType: 'user' })).toBe(
      'Actualizó permisos'
    );
    expect(activityModuleForEntity('invoices')).toBe('Facturación');
    expect(activityModuleForEntity('unknown_table')).toBe('Otros');
  });

  it('summarizes user agents coarsely', () => {
    expect(
      summarizeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      )
    ).toBe('Chrome · Windows');
    expect(summarizeUserAgent(null)).toBe('Dispositivo desconocido');
  });
});
