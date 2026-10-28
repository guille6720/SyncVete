import type { EmailOtpType } from '@supabase/supabase-js';

/** Auth email link types that should open the set-password screen. */
export const PASSWORD_LINK_OTP_TYPES = ['recovery', 'invite', 'magiclink'] as const;

export type PasswordLinkOtpType = (typeof PASSWORD_LINK_OTP_TYPES)[number];

export function isPasswordLinkOtpType(value: string | null | undefined): value is PasswordLinkOtpType {
  return (
    value === 'recovery' || value === 'invite' || value === 'magiclink'
  );
}

export function asEmailOtpType(type: PasswordLinkOtpType): EmailOtpType {
  return type;
}
