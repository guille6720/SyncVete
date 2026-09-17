import { describe, expect, it } from 'vitest';
import {
  buildTeamAccessEmail,
  teamAccessEmailContainsPasswordLeak,
} from '../utils/team-access-email';

describe('buildTeamAccessEmail', () => {
  it('builds existing-user notification with staging login URL and no password', () => {
    const mail = buildTeamAccessEmail({
      kind: 'existing_access',
      professionalName: 'Ana Vet',
      clinicName: 'Clínica Sur',
      role: 'veterinarian',
      appOrigin: 'https://sync-vete-staging.vercel.app',
    });
    expect(mail.subject).toBe('Te dieron acceso a una clínica en SyncVete');
    expect(mail.text).toContain('Clínica Sur te dio acceso a SyncVete como Veterinario');
    expect(mail.text).toContain('contraseña actual');
    expect(mail.ctaHref).toBe('https://sync-vete-staging.vercel.app/login');
    expect(mail.html).toContain('Ingresar a SyncVete');
    expect(mail.html).toContain('https://sync-vete-staging.vercel.app/login');
    expect(teamAccessEmailContainsPasswordLeak(mail)).toBe(false);
  });

  it('builds new-user invite without plaintext password', () => {
    const mail = buildTeamAccessEmail({
      kind: 'new_invite',
      professionalName: 'Bruno',
      clinicName: 'Clínica Norte',
      role: 'veterinarian',
      appOrigin: 'https://example-staging.vercel.app',
    });
    expect(mail.subject).toBe('Te invitaron a SyncVete');
    expect(mail.ctaLabel).toBe('Activar mi acceso');
    expect(mail.ctaHref).toBe('https://example-staging.vercel.app/login');
    expect(mail.text.toLowerCase()).not.toMatch(/password\s*[:=]/);
    expect(teamAccessEmailContainsPasswordLeak(mail)).toBe(false);
  });

  it('uses canonical sender expectations in copy (no forged from)', () => {
    const mail = buildTeamAccessEmail({
      kind: 'existing_access',
      professionalName: 'X',
      clinicName: 'Y',
      role: 'admin',
      appOrigin: 'https://app.example',
    });
    expect(mail.html).not.toMatch(/from:/i);
    expect(mail.text).toContain('Administrador');
  });
});
