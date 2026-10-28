import { describe, expect, it } from 'vitest';
import { isEphemeralVercelDeploymentHost } from './app-origin';

describe('isEphemeralVercelDeploymentHost', () => {
  it('detects per-deploy preview hosts', () => {
    expect(
      isEphemeralVercelDeploymentHost(
        'sync-vete-staging-rbjeiq7wz-guillermo-c-bmw.vercel.app'
      )
    ).toBe(true);
  });

  it('keeps stable project and branch aliases', () => {
    expect(isEphemeralVercelDeploymentHost('sync-vete-staging.vercel.app')).toBe(false);
    expect(
      isEphemeralVercelDeploymentHost(
        'sync-vete-staging-git-feature-ui-v2-shel-78b6a4-guillermo-c-bmw.vercel.app'
      )
    ).toBe(false);
  });
});
