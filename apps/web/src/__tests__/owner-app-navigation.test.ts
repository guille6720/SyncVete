import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { safeOwnerPortalRedirect, ownerAppInstallUrl } from '../lib/owner-app-navigation';
import { ownerAppMetadata } from '../lib/owner-app-metadata';
import { buildOwnerAppManifest, ownerAppManifestPath } from '../lib/owner-app-manifest';
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
    expect(metadata.manifest).toBe(`/portal/brand.webmanifest?organizationId=${org}`);
    expect(JSON.stringify(metadata.icons)).not.toContain('syncvete');
    expect(JSON.stringify(metadata.icons)).toContain(`/portal/icon/${org}`);
  });
  it('installs the owner app instead of the clinic dashboard', () => {
    const brand = {
      appName: 'app-IMILVET',
      logoUrl: '',
      primaryColor: '#7c3aed',
      welcomeText: '',
      enabled: true,
    };
    const manifest = buildOwnerAppManifest(org, brand);
    const manifestUrl = new URL(ownerAppManifestPath(org), 'https://staging.test');
    expect(manifestUrl.pathname).toBe('/portal/brand.webmanifest');
    expect(manifest.id).toBe(`/portal/app/${org}`);
    expect(manifest.scope).toBe('/portal/');
    expect(manifest.start_url).toBe(`/portal/instalar/${org}?source=pwa`);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifestUrl.pathname.startsWith(manifest.scope)).toBe(true);
    expect(manifest.name).not.toBe('SyncVete');
    expect(JSON.stringify(manifest)).not.toContain('/dashboard');

    const fallback = JSON.parse(
      readFileSync(new URL('../../public/portal/manifest.webmanifest', import.meta.url), 'utf8')
    ) as { id: string; name: string; start_url: string; scope: string };
    expect(fallback.id).not.toBe('/');
    expect(fallback.name).not.toBe('SyncVete');
    expect(fallback.scope).toBe('/portal/');
    expect(fallback.start_url.startsWith('/portal')).toBe(true);
    expect(fallback.start_url).not.toContain('/dashboard');
  });
});
