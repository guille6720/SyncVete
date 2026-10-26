import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUiV2Enabled } from './feature-flag';

describe('isUiV2Enabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default', () => {
    vi.stubEnv('NEXT_PUBLIC_UI_V2_ENABLED', undefined);
    expect(isUiV2Enabled({})).toBe(false);
  });

  it('enables only when explicitly true', () => {
    expect(isUiV2Enabled({ NEXT_PUBLIC_UI_V2_ENABLED: 'true' })).toBe(true);
    expect(isUiV2Enabled({ NEXT_PUBLIC_UI_V2_ENABLED: 'false' })).toBe(false);
    expect(isUiV2Enabled({ NEXT_PUBLIC_UI_V2_ENABLED: '1' })).toBe(false);
  });
});
