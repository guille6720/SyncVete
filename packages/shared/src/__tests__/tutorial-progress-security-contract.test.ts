import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests over the SQL migration text — ensures security invariants remain
 * in the file that will be applied to staging (no live DB required).
 */
describe('tutorial_progress migration security contract', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../supabase/migrations/20261017120000_tutorial_progress.sql'),
    'utf8'
  );

  it('uses SECURITY INVOKER for progress RPCs (RLS applies)', () => {
    expect(sql).toMatch(/upsert_tutorial_progress[\s\S]*?SECURITY INVOKER/);
    expect(sql).toMatch(/get_my_tutorial_progress[\s\S]*?SECURITY INVOKER/);
    expect(sql).not.toMatch(/upsert_tutorial_progress[\s\S]*?SECURITY DEFINER/);
  });

  it('scopes org via profile + active membership helper', () => {
    expect(sql).toContain('tutorial_progress_authorized_org_id');
    expect(sql).toContain('profiles');
    expect(sql).toContain('branch_members');
    expect(sql).toContain('bm.organization_id = p.organization_id');
  });

  it('revokes anon/PUBLIC execute and grants only authenticated/service_role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.upsert_tutorial_progress[\s\S]*FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_my_tutorial_progress[\s\S]*FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.upsert_tutorial_progress[\s\S]*TO authenticated, service_role/);
  });

  it('binds RLS to auth.uid and authorized org', () => {
    expect(sql).toContain('user_id = auth.uid()');
    expect(sql).toContain('organization_id = public.tutorial_progress_authorized_org_id()');
  });

  it('does not grant DELETE to clinic users', () => {
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.tutorial_progress TO authenticated/);
  });
});
