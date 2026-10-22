import { NextResponse } from 'next/server';
import { authorizeCronSecret } from '@sincvete/shared';
import { ownerAppEnabled, ownerAppUrl } from '@/lib/owner-app';
import { ownerAppOrigin, sendOwnerAppEmail } from '@/lib/owner-app-email';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!ownerAppEnabled()) return NextResponse.json({ error: 'Disabled' }, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !authorizeCronSecret({
      authorizationHeader: request.headers.get('authorization'),
      cronSecretHeader: request.headers.get('x-cron-secret'),
      secret,
    })
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await createServiceClient();
  const queued = await db.rpc('queue_owner_app_reminders');
  if (queued.error) return NextResponse.json({ error: 'Queue failed' }, { status: 500 });
  if (!process.env.OWNER_APP_RESEND_API_KEY || !process.env.OWNER_APP_EMAIL_FROM)
    return NextResponse.json({ queued: queued.data, email: 'not_configured' });
  const claimed = await db.rpc('claim_owner_app_emails');
  if (claimed.error) return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  const reminders = claimed.data as unknown as {
    id: string;
    email: string;
    message: string;
    organization_id: string;
  }[];
  let sent = 0;
  // Small parallel batches keep the lease retryable within the cron time limit.
  for (let offset = 0; offset < reminders.length; offset += 5) {
    await Promise.all(
      reminders.slice(offset, offset + 5).map(async (reminder) => {
        try {
          const delivered = await sendOwnerAppEmail(
            reminder.email,
            'Recordatorio de tu veterinaria',
            `${reminder.message}\n\n${ownerAppOrigin()}${ownerAppUrl(reminder.organization_id)}\n\nHecho por OpusOrg`,
            `owner-app-reminder-${reminder.id}`
          );
          if (delivered) {
            const completed = await db.rpc('complete_owner_app_email', { p_id: reminder.id });
            if (!completed.error) sent += 1;
          }
        } catch {
          /* The lease expires and the next cron retries using the same key. */
        }
      })
    );
  }
  return NextResponse.json({ queued: queued.data, sent, retry: reminders.length - sent });
}
