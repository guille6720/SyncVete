import { describe, expect, it } from 'vitest';
import { safeOwnerPortalRedirect, ownerAppInstallUrl } from '../lib/owner-app-navigation';
import { ownerAppMetadata } from '../lib/owner-app-metadata';
describe('owner installation and login destinations', () => {
  const org = '11111111-1111-4111-8111-111111111111';
  it('keeps tokens out of installed start destinations', () => {
    expect(ownerAppInstallUrl(org)).toBe(`/portal/instalar/${org}`);
    expect(safeOwnerPortalRedirect(`/portal/app/${org}`)).toBe(`/portal/app/${org}`);
    expect(safeOwnerPortalRedirect(`/portal/activar?token=${'a'.repeat(64)}`)).toContain('token=');
  });
  it('rejects open redirects, ambiguous routes, and invalid invitation tokens', () => {
    for (const value of [
      'https://evil.test',
      '//evil.test',
      '/portal/activar-evil',
      '/portal/activar?token=x',
      '/portal/app/x',
      '/portal/app/../admin',
      '/dashboard',
      null,
    ])
      expect(safeOwnerPortalRedirect(value)).toBeNull();
  });
  it('replaces administrative application metadata on invitation and install pages', () => {
    const metadata = ownerAppMetadata(org, {
      appName: 'app-IMILVET',
      logoUrl: '',
      primaryColor: '#7c3aed',
      welcomeText: '',
      enabled: true,
    });
    expect(metadata.applicationName).toBe('app-IMILVET');
    expect(metadata.manifest).toBe(`/portal/manifest/${org}`);
    expect(JSON.stringify(metadata.icons)).not.toContain('syncvete');
    expect(JSON.stringify(metadata.icons)).toContain(`/portal/icon/${org}`);
  });
});
