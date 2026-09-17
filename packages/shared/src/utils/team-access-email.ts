import { ROLE_LABELS, type Role } from '../constants';

export type TeamAccessEmailKind = 'existing_access' | 'new_invite';

export type TeamAccessEmailInput = {
  kind: TeamAccessEmailKind;
  professionalName: string;
  clinicName: string;
  role: Role;
  appOrigin: string;
};

export function buildTeamAccessEmail(input: TeamAccessEmailInput): {
  subject: string;
  text: string;
  html: string;
  ctaHref: string;
  ctaLabel: string;
} {
  const name = input.professionalName.trim() || 'hola';
  const clinic = input.clinicName.trim() || 'Tu clínica';
  const roleLabel = ROLE_LABELS[input.role] ?? input.role;
  const origin = input.appOrigin.replace(/\/$/, '');
  const loginHref = `${origin}/login`;

  if (input.kind === 'existing_access') {
    const subject = 'Te dieron acceso a una clínica en SyncVete';
    const text = [
      `Hola ${name},`,
      '',
      `${clinic} te dio acceso a SyncVete como ${roleLabel}.`,
      '',
      'Tu cuenta ya existía, por lo que podés ingresar con tu contraseña actual.',
      '',
      `Ingresar a SyncVete: ${loginHref}`,
      '',
      'Si no reconocés esta invitación, podés ignorar este mensaje.',
    ].join('\n');
    const html = `
      <p>Hola ${escapeHtml(name)},</p>
      <p><strong>${escapeHtml(clinic)}</strong> te dio acceso a SyncVete como <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p>Tu cuenta ya existía, por lo que podés ingresar con tu contraseña actual.</p>
      <p><a href="${escapeAttr(loginHref)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ingresar a SyncVete</a></p>
      <p style="color:#64748b;font-size:13px">Si no reconocés esta invitación, podés ignorar este mensaje.</p>
    `.trim();
    return { subject, text, html, ctaHref: loginHref, ctaLabel: 'Ingresar a SyncVete' };
  }

  const activateHref = `${origin}/login`;
  const subject = 'Te invitaron a SyncVete';
  const text = [
    `Hola ${name},`,
    '',
    `${clinic} te invitó a formar parte de su equipo en SyncVete.`,
    '',
    'Usá el siguiente enlace para activar tu acceso (revisá también tu bandeja de correo de Supabase Auth).',
    '',
    `Activar mi acceso: ${activateHref}`,
    '',
    'Si no reconocés esta invitación, podés ignorar este mensaje.',
  ].join('\n');
  const html = `
    <p>Hola ${escapeHtml(name)},</p>
    <p><strong>${escapeHtml(clinic)}</strong> te invitó a formar parte de su equipo en SyncVete.</p>
    <p>Usá el siguiente botón para activar tu acceso.</p>
    <p><a href="${escapeAttr(activateHref)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Activar mi acceso</a></p>
    <p style="color:#64748b;font-size:13px">Si no reconocés esta invitación, podés ignorar este mensaje.</p>
  `.trim();
  return { subject, text, html, ctaHref: activateHref, ctaLabel: 'Activar mi acceso' };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

/** Assert templates never include plaintext password fields. */
export function teamAccessEmailContainsPasswordLeak(payload: {
  subject: string;
  text: string;
  html: string;
}): boolean {
  const blob = `${payload.subject}\n${payload.text}\n${payload.html}`.toLowerCase();
  return (
    /contraseña temporal|temporary password|password\s*[:=]|pwd\s*[:=]/.test(blob) &&
    !/contraseña actual/.test(blob)
  );
}
