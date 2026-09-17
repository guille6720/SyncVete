import 'server-only';
import { createServerClient } from '@/lib/supabase/server';

const RATE_LIMIT_SECONDS = 90;

type AnyClient = {
  from: (table: string) => {
    select: (columns: string) => AnyFilter;
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

type AnyFilter = {
  eq: (column: string, value: unknown) => AnyFilter;
  ilike: (column: string, value: unknown) => AnyFilter;
  gte: (column: string, value: unknown) => AnyFilter;
  limit: (n: number) => AnyFilter;
  maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
};

async function logClient(): Promise<AnyClient> {
  const supabase = await createServerClient();
  return supabase as unknown as AnyClient;
}

/**
 * Returns true if we should skip sending because the same notification was
 * accepted recently (double-click / retry storm protection).
 */
export async function wasTeamAccessEmailRecentlySent(params: {
  organizationId: string;
  recipientEmail: string;
  messageType: string;
}): Promise<boolean> {
  try {
    const supabase = await logClient();
    const since = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString();
    const { data, error } = await supabase
      .from('team_access_email_log')
      .select('id')
      .eq('organization_id', params.organizationId)
      .eq('message_type', params.messageType)
      .ilike('recipient_email', params.recipientEmail)
      .gte('created_at', since)
      .eq('ok', true)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (/schema cache|does not exist|Could not find the table|column/i.test(error.message)) {
        return false;
      }
      console.warn('[mail.rateLimit]', error.message.slice(0, 160));
      return false;
    }
    return Boolean(data?.id);
  } catch {
    return false;
  }
}

export async function recordTeamAccessEmailLog(params: {
  organizationId: string;
  recipientEmail: string;
  messageType: string;
  provider: string;
  ok: boolean;
  providerMessageId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    const supabase = await logClient();
    const { error } = await supabase.from('team_access_email_log').insert({
      organization_id: params.organizationId,
      recipient_email: params.recipientEmail.toLowerCase(),
      message_type: params.messageType,
      provider: params.provider,
      ok: params.ok,
      provider_message_id: params.providerMessageId ?? null,
      error_summary: params.error ? params.error.slice(0, 240) : null,
    });
    if (error && !/schema cache|does not exist|Could not find the table/i.test(error.message)) {
      console.warn('[mail.log]', error.message.slice(0, 160));
    }
  } catch {
    // non-fatal
  }
}
