'use server';

import {
  auditLogListSchema,
  auditRangeToTimestamps,
  buildPaginatedResult,
  ROLES,
  type AuditMemberOption,
  type Role,
  type AuditLogDetail,
  type AuditLogListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { requirePermissionIfFeature, canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';

function toListRow(row: AuditLogListRow & { total_count?: number }): AuditLogListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return entry;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function canReadAudit(): Promise<boolean> {
  return canPermissionAndFeature('audit:read', FEATURES.AUDIT);
}

export async function listAuditMembers(): Promise<AuditMemberOption[]> {
  const session = await requirePermissionIfFeature('audit:read', FEATURES.AUDIT);
  if (!session) return [];
  const supabase = await createServerClient();
  const members: AuditMemberOption[] = [];
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase
      .rpc('list_audit_members')
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    members.push(
      ...(data ?? []).map((member) => ({
        userId: member.user_id,
        fullName: member.full_name,
        roles: member.roles.filter((role): role is Role => ROLES.includes(role as Role)),
        isActive: member.is_active,
      }))
    );
    if (!data || data.length < batchSize) return members;
  }
}

export async function listAuditLogs(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
  } = {}
): Promise<PaginatedResult<AuditLogListRow>> {
  const parsed = auditLogListSchema.parse(input);
  const session = await requirePermissionIfFeature('audit:read', FEATURES.AUDIT);
  if (!session) {
    return buildPaginatedResult([], 0, parsed.page, parsed.pageSize);
  }
  const supabase = await createServerClient();

  const range = parsed.from && parsed.to ? auditRangeToTimestamps(parsed.from, parsed.to) : null;

  const { data, error } = await supabase.rpc('search_audit_logs_by_member', {
    p_user_id: parsed.userId || null,
    p_search: parsed.search?.trim() || null,
    p_action: parsed.action || null,
    p_entity_type: parsed.entityType || null,
    p_from: range?.from ?? null,
    p_to: range?.to ?? null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return buildPaginatedResult(
    rows.map((row) => toListRow(row)),
    Number(total),
    parsed.page,
    parsed.pageSize
  );
}

export async function getAuditLog(id: string): Promise<AuditLogDetail | null> {
  const session = await requirePermissionIfFeature('audit:read', FEATURES.AUDIT);
  if (!session) return null;
  const supabase = await createServerClient();

  const { data: log, error } = await supabase.from('audit_logs').select('*').eq('id', id).single();

  if (error || !log) return null;

  const [{ data: profile }, { data: branch }, { data: summary }] = await Promise.all([
    log.user_id
      ? supabase.from('profiles').select('full_name').eq('id', log.user_id).single()
      : Promise.resolve({ data: null }),
    log.branch_id
      ? supabase.from('branches').select('name').eq('id', log.branch_id).single()
      : Promise.resolve({ data: null }),
    supabase.rpc('audit_event_summary', {
      p_action: log.action,
      p_entity_type: log.entity_type,
      p_old: log.old_data,
      p_new: log.new_data,
    }),
  ]);

  return {
    ...log,
    old_data: asRecord(log.old_data),
    new_data: asRecord(log.new_data),
    user_full_name: profile?.full_name ?? null,
    branch_name: branch?.name ?? null,
    summary:
      typeof summary === 'string' && summary ? summary : `${log.action} en ${log.entity_type}`,
  };
}
