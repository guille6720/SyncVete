/**
 * QA ONLY — link BMW [QA_SEED] professionals to auth users + branch_members.
 *
 * Usage (from repo root):
 *   node scripts/qa-link-bmw-professionals.mjs
 *
 * Requires apps/web/.env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG_ID = '285acad6-daf1-4aaf-84d1-be39f9d5deca';
const BRANCH_ID = 'fb781413-402b-4b7c-a4de-a47854ac481d';
const PASSWORD = 'QaSeed2026!';

function loadEnv() {
  const envPath = resolve(__dirname, '../apps/web/.env.local');
  const raw = readFileSync(envPath, 'utf8');
  const url = raw.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  const key = raw.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.trim();
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
  }
  return { url, key };
}

function slugEmail(firstName, lastName) {
  const slug = `${firstName}.${lastName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${slug}.qa@syncvete.test`;
}

async function main() {
  const { url, key } = loadEnv();
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: pros, error: prosError } = await supabase
    .from('professionals')
    .select('id, first_name, last_name, user_id, notes')
    .eq('organization_id', ORG_ID)
    .like('notes', '%[QA_SEED]%')
    .is('deleted_at', null)
    .order('first_name');

  if (prosError) throw prosError;
  if (!pros?.length) {
    console.log('No [QA_SEED] professionals found. Run supabase/_tmp_qa_seed_bmw.sql first.');
    return;
  }

  const { data: ownerMembers } = await supabase
    .from('branch_members')
    .select('user_id, role')
    .eq('organization_id', ORG_ID)
    .eq('role', 'owner')
    .is('deleted_at', null);

  const ownerUserIds = new Set((ownerMembers ?? []).map((m) => m.user_id));

  for (const pro of pros) {
    const fullName = `${pro.first_name} ${pro.last_name}`.trim();
    const email = slugEmail(pro.first_name, pro.last_name);

    let userId = pro.user_id;

    // Unlink if wrongly tied to org owner (e.g. Guille)
    if (userId && ownerUserIds.has(userId)) {
      console.log(`Fixing wrong link: ${fullName} was tied to owner user ${userId}`);
      await supabase.from('professionals').update({ user_id: null, profile_id: null }).eq('id', pro.id);
      userId = null;
    }

    if (!userId) {
      const { data: existingList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

      if (existing) {
        userId = existing.id;
        console.log(`Reusing auth user for ${fullName}: ${email}`);
      } else {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: fullName, qa_seed: true },
        });
        if (createError) {
          console.error(`Failed to create user for ${fullName}:`, createError.message);
          continue;
        }
        userId = created.user.id;
        console.log(`Created auth user for ${fullName}: ${email}`);
      }
    }

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        organization_id: ORG_ID,
        full_name: fullName,
        active_branch_id: BRANCH_ID,
        is_active: true,
        deleted_at: null,
      },
      { onConflict: 'id' }
    );
    if (profileError) {
      console.error(`Profile upsert failed for ${fullName}:`, profileError.message);
      continue;
    }

    const { error: memberError } = await supabase.from('branch_members').upsert(
      {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        user_id: userId,
        role: 'veterinarian',
        is_active: true,
        deleted_at: null,
      },
      { onConflict: 'branch_id,user_id' }
    );
    if (memberError) {
      console.error(`branch_members upsert failed for ${fullName}:`, memberError.message);
      continue;
    }

    const { error: linkError } = await supabase
      .from('professionals')
      .update({ user_id: userId, profile_id: userId })
      .eq('id', pro.id);
    if (linkError) {
      console.error(`Professional link failed for ${fullName}:`, linkError.message);
      continue;
    }

    console.log(`Linked ${fullName} → ${email}`);
  }

  const { data: summary } = await supabase
    .from('professionals')
    .select('first_name, last_name, user_id')
    .eq('organization_id', ORG_ID)
    .like('notes', '%[QA_SEED]%')
    .is('deleted_at', null)
    .order('first_name');

  console.log('\nSummary:');
  for (const row of summary ?? []) {
    console.log(`  ${row.first_name} ${row.last_name}: ${row.user_id ? 'linked' : 'MISSING user_id'}`);
  }

  const { count } = await supabase
    .from('branch_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)
    .eq('role', 'veterinarian')
    .is('deleted_at', null);

  console.log(`\nVeterinarian branch_members: ${count ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
