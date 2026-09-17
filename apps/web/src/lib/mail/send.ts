import 'server-only';
import { getMailFrom, recipientDomain, resolveMailProvider, type MailProvider } from '@/lib/mail/config';
import { readServerEnv } from '@/lib/server-env';

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageType: string;
};

export type SendTransactionalEmailResult =
  | { ok: true; provider: MailProvider; providerMessageId?: string }
  | { ok: false; provider: MailProvider; error: string };

function logMailEvent(payload: Record<string, unknown>): void {
  console.info('[mail]', JSON.stringify(payload));
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<SendTransactionalEmailResult> {
  const provider = resolveMailProvider();
  const from = getMailFrom();
  const domain = recipientDomain(input.to);
  const startedAt = new Date().toISOString();

  if (provider === 'none') {
    const error =
      'Email no configurado: definí RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS en el entorno del servidor';
    logMailEvent({
      at: startedAt,
      ok: false,
      messageType: input.messageType,
      recipientDomain: domain,
      provider,
      error,
    });
    return { ok: false, provider, error };
  }

  try {
    if (provider === 'resend') {
      const apiKey = readServerEnv('RESEND_API_KEY');
      if (!apiKey) {
        return { ok: false, provider, error: 'RESEND_API_KEY ausente' };
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${from.name} <${from.email}>`,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };
      if (!response.ok) {
        const error = body.message || body.name || `Resend HTTP ${response.status}`;
        logMailEvent({
          at: startedAt,
          ok: false,
          messageType: input.messageType,
          recipientDomain: domain,
          provider,
          providerStatus: response.status,
          error,
        });
        return { ok: false, provider, error };
      }
      logMailEvent({
        at: startedAt,
        ok: true,
        messageType: input.messageType,
        recipientDomain: domain,
        provider,
        providerMessageId: body.id ?? null,
      });
      return { ok: true, provider, providerMessageId: body.id };
    }

    // SMTP path (same credentials family as Supabase Custom SMTP — server-only).
    const nodemailer = await import('nodemailer');
    const host = readServerEnv('SMTP_HOST');
    const port = Number(readServerEnv('SMTP_PORT') || '587');
    const user = readServerEnv('SMTP_USER');
    const pass = readServerEnv('SMTP_PASS');
    if (!host || !user || !pass) {
      return { ok: false, provider: 'smtp', error: 'SMTP incompleto' };
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const info = await transporter.sendMail({
      from: `"${from.name}" <${from.email}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    logMailEvent({
      at: startedAt,
      ok: true,
      messageType: input.messageType,
      recipientDomain: domain,
      provider: 'smtp',
      providerMessageId: info.messageId ?? null,
      accepted: Array.isArray(info.accepted) ? info.accepted.length : undefined,
    });
    return { ok: true, provider: 'smtp', providerMessageId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de envío';
    logMailEvent({
      at: startedAt,
      ok: false,
      messageType: input.messageType,
      recipientDomain: domain,
      provider,
      error: message.slice(0, 240),
    });
    return { ok: false, provider, error: message };
  }
}
