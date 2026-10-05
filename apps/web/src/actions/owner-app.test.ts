import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  permission: vi.fn(),
  feature: vi.fn(),
  rpc: vi.fn(),
  owner: vi.fn(),
  bridge: vi.fn(),
  origin: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/owner-app', async (original) => ({
  ...(await original<typeof import('@/lib/owner-app')>()),
  ownerAppEnabled: mocks.enabled,
}));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/permissions', () => ({
  requirePermission: mocks.permission,
  requirePortalSession: vi.fn(),
  PermissionError: class extends Error {},
}));
vi.mock('@/lib/entitlements', () => ({
  FEATURES: { OWNER_PORTAL: 'owner_portal' },
  requireFeature: mocks.feature,
  planRestrictionResult: () => null,
}));
vi.mock('@/actions/owners', () => ({ getOwner: mocks.owner }));
vi.mock('@/actions/owner-app-bridge', () => ({
  isOwnerAppConfigured: async () => true,
  sendOwnerAppInvite: mocks.bridge,
}));
vi.mock('@/lib/owner-app-email', () => ({ ownerAppOrigin: mocks.origin }));

import { sendOwnerAppInvite } from './owner-app';

describe('integrated WhatsApp invitations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.permission.mockResolvedValue({ organizationId: '11111111-1111-4111-8111-111111111111' });
    mocks.owner.mockResolvedValue({ full_name: 'Tutor', phone_whatsapp: '+5491112345678', phone: null });
    mocks.origin.mockReturnValue('https://staging.example.com');
    mocks.rpc.mockImplementation(async (name) => name === 'get_owner_app_brand'
      ? { data: { appName: 'app-IMILVET', logoUrl: '', primaryColor: '#008060', welcomeText: '', enabled: true }, error: null }
      : { data: { token: 'a'.repeat(64), email: 'tutor@example.com', expiresAt: '2026-11-01T00:00:00Z' }, error: null });
  });

  it('preserves the external bridge outside enabled staging', async () => {
    mocks.enabled.mockReturnValue(false);
    mocks.bridge.mockResolvedValue({ success: true });
    expect(await sendOwnerAppInvite('owner')).toEqual({ success: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('prepares the integrated private link without using the bridge', async () => {
    const result = await sendOwnerAppInvite('owner');
    expect(result.success).toBe(true);
    expect(result.data?.whatsappText).toContain('app-IMILVET');
    expect(result.data?.whatsappText).toContain('https://staging.example.com/portal/activar?token=');
    expect(mocks.feature).toHaveBeenCalled();
    expect(mocks.bridge).not.toHaveBeenCalled();
  });

  it('does not generate an invitation for a disabled clinic', async () => {
    mocks.rpc.mockResolvedValue({ data: { appName: 'App', primaryColor: '#008060', enabled: false }, error: null });
    expect((await sendOwnerAppInvite('owner')).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalledWith('create_owner_portal_invite', expect.anything());
  });

  it('does not generate an invitation without a valid phone', async () => {
    mocks.owner.mockResolvedValue({ full_name: 'Tutor', phone_whatsapp: null, phone: null });
    expect((await sendOwnerAppInvite('owner')).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalledWith('create_owner_portal_invite', expect.anything());
  });

  it('validates the origin before creating a private token', async () => {
    mocks.origin.mockImplementation(() => { throw new Error('Missing staging origin'); });
    expect((await sendOwnerAppInvite('owner')).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalledWith('create_owner_portal_invite', expect.anything());
  });
});
