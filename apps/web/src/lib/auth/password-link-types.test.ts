import { describe, expect, it } from 'vitest';
import { isPasswordLinkOtpType } from './password-link-types';
import { recoveryRedirectPath } from './recovery-redirect';

describe('isPasswordLinkOtpType', () => {
  it('accepts invite, recovery and magiclink', () => {
    expect(isPasswordLinkOtpType('invite')).toBe(true);
    expect(isPasswordLinkOtpType('recovery')).toBe(true);
    expect(isPasswordLinkOtpType('magiclink')).toBe(true);
    expect(isPasswordLinkOtpType('signup')).toBe(false);
  });
});

describe('recoveryRedirectPath', () => {
  it('routes invite token hashes to set-password', () => {
    const params = new URLSearchParams({
      token_hash: 'abc',
      type: 'invite',
    });
    expect(recoveryRedirectPath('/', params)).toBe('/actualizar-contrasena');
    expect(recoveryRedirectPath('/login', params)).toBe('/actualizar-contrasena');
  });
});
