import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { ROLE_PERMISSIONS, getPermissionsForRole } from '@sincvete/shared';
import type { Database } from '../types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const canRun = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && ANON_KEY);

type Client = SupabaseClient<Database>;

describe.skipIf(!canRun)('@professionals insert RLS authorization', () => {
  let service: Client;
  const timestamp = Date.now();
  const password = 'TestPass123!';

  let ownerEmail: string;
  let vetEmail: string;
  let adminEmail: string;
  let otherOrgEmail: string;

  let ownerId: string;
  let vetId: string;
  let adminId: string;
  let otherOrgUserId: string;
  let orgId: string;
  let branchId: string;
  let otherOrgId: string;

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: tableError } = await service.from('professionals').select('id').limit(1);
    if (tableError) return;

    const createUser = async (email: string) => {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error(`create ${email}`);
      createdUserIds.push(data.user.id);
      return data.user.id;
    };

    ownerEmail = `pro-owner-${timestamp}@test.sincvete.local`;
    vetEmail = `pro-vet-${timestamp}@test.sincvete.local`;
    adminEmail = `pro-admin-${timestamp}@test.sincvete.local`;
    otherOrgEmail = `pro-other-${timestamp}@test.sincvete.local`;

    ownerId = await createUser(ownerEmail);
    vetId = await createUser(vetEmail);
    adminId = await createUser(adminEmail);
    otherOrgUserId = await createUser(otherOrgEmail);

    const ownerClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
    const { data: setup, error: setupError } = await ownerClient.rpc('handle_new_user_signup', {
      p_full_name: 'Owner Test',
      p_organization_name: `Org Pro ${timestamp}`,
      p_organization_slug: `org-pro-${timestamp}`,
    });
    if (setupError) throw setupError;
    orgId = (setup as { organization_id: string }).organization_id;
    branchId = (setup as { branch_id: string }).branch_id;

    // Add veterinarian (no professionals:write)
    const { error: vetMemberError } = await ownerClient.rpc('add_team_member', {
      p_user_id: vetId,
      p_branch_id: branchId,
      p_role: 'veterinarian',
    });
    if (vetMemberError) throw vetMemberError;

    // Add admin (has professionals:write)
    const { error: adminMemberError } = await ownerClient.rpc('add_team_member', {
      p_user_id: adminId,
      p_branch_id: branchId,
      p_role: 'admin',
    });
    if (adminMemberError) throw adminMemberError;

    // Custom permissions veterinarian with explicit write
    await service
      .from('branch_members')
      .update({
        permissions: ['professionals:write', 'professionals:read'] as unknown as Database['public']['Tables']['branch_members']['Update']['permissions'],
      })
      .eq('user_id', vetId)
      .eq('branch_id', branchId);

    // Reset vet to empty custom perms for default denial case — use separate user for custom write.
    await service
      .from('branch_members')
      .update({ permissions: [] as unknown as Database['public']['Tables']['branch_members']['Update']['permissions'] })
      .eq('user_id', vetId)
      .eq('branch_id', branchId);

    await ownerClient.auth.signOut();

    const otherClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
    await otherClient.auth.signInWithPassword({ email: otherOrgEmail, password });
    const { data: otherSetup, error: otherSetupError } = await otherClient.rpc(
      'handle_new_user_signup',
      {
        p_full_name: 'Other Org',
        p_organization_name: `Other ${timestamp}`,
        p_organization_slug: `other-pro-${timestamp}`,
      }
    );
    if (otherSetupError) throw otherSetupError;
    otherOrgId = (otherSetup as { organization_id: string }).organization_id;
    await otherClient.auth.signOut();
  }, 120_000);

  afterAll(async () => {
    for (const id of createdUserIds) {
      await service.auth.admin.deleteUser(id);
    }
  });

  async function asUser(email: string): Promise<Client> {
    const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  it('shared model: owner/admin write, veterinarian default no write', () => {
    expect(getPermissionsForRole('owner')).toEqual(expect.arrayContaining(ROLE_PERMISSIONS.owner));
    expect(ROLE_PERMISSIONS.admin).toContain('professionals:write');
    expect(ROLE_PERMISSIONS.veterinarian).not.toContain('professionals:write');
  });

  it('owner can insert professional in own org', async () => {
    if (!orgId) return;
    const client = await asUser(ownerEmail);
    const { data, error } = await client
      .from('professionals')
      .insert({
        organization_id: orgId,
        first_name: 'Ana',
        last_name: 'OwnerCreate',
        relationship_type: 'employee',
        is_active: true,
        invoice_required: false,
      })
      .select('id, organization_id')
      .single();
    expect(error).toBeNull();
    expect(data?.organization_id).toBe(orgId);
    if (data?.id) {
      await service.from('professionals').delete().eq('id', data.id);
    }
  });

  it('admin can insert professional', async () => {
    if (!orgId) return;
    const client = await asUser(adminEmail);
    const { data, error } = await client
      .from('professionals')
      .insert({
        organization_id: orgId,
        first_name: 'Bruno',
        last_name: 'AdminCreate',
        relationship_type: 'employee',
        is_active: true,
        invoice_required: false,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    if (data?.id) {
      await service.from('professionals').delete().eq('id', data.id);
    }
  });

  it('veterinarian without professionals:write cannot insert', async () => {
    if (!orgId) return;
    const client = await asUser(vetEmail);
    const { error } = await client.from('professionals').insert({
      organization_id: orgId,
      first_name: 'Carla',
      last_name: 'VetDenied',
      relationship_type: 'employee',
      is_active: true,
      invoice_required: false,
    });
    expect(error).toBeTruthy();
    expect(error?.message ?? '').toMatch(/row-level security|42501|permission/i);
  });

  it('veterinarian with explicit custom professionals:write can insert', async () => {
    if (!orgId) return;
    await service
      .from('branch_members')
      .update({
        permissions: [
          'professionals:read',
          'professionals:write',
        ] as unknown as Database['public']['Tables']['branch_members']['Update']['permissions'],
      })
      .eq('user_id', vetId)
      .eq('branch_id', branchId);

    const client = await asUser(vetEmail);
    const { data, error } = await client
      .from('professionals')
      .insert({
        organization_id: orgId,
        first_name: 'Diego',
        last_name: 'VetCustom',
        relationship_type: 'employee',
        is_active: true,
        invoice_required: false,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    if (data?.id) {
      await service.from('professionals').delete().eq('id', data.id);
    }

    await service
      .from('branch_members')
      .update({
        permissions: [] as unknown as Database['public']['Tables']['branch_members']['Update']['permissions'],
      })
      .eq('user_id', vetId)
      .eq('branch_id', branchId);
  });

  it('user from another organization cannot insert into foreign org', async () => {
    if (!orgId || !otherOrgId) return;
    const client = await asUser(otherOrgEmail);
    const { error } = await client.from('professionals').insert({
      organization_id: orgId,
      first_name: 'Eva',
      last_name: 'CrossTenant',
      relationship_type: 'employee',
      is_active: true,
      invoice_required: false,
    });
    expect(error).toBeTruthy();
  });
});
