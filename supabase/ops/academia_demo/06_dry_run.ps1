#Requires -Version 5.1
<#
.SYNOPSIS
  Disposable dry-run of Academia Demo seed against a schema dump from staging.

.DESCRIPTION
  Phase 5C.2 fail-closed pipeline:
  1) Dumps public schema from staging (READ-ONLY) or reuses recent dump.
  2) Starts ephemeral Postgres Docker container.
  3) Restores dump, stubs auth.users for QA emails.
  4) Applies 05_protect_demo_marker.sql + 08_security_tests.sql.
  5) Seeds with approval gate; re-seeds (idempotency).
  6) Evaluates 03_validation_assert.sql (RAISE on failure) + 03_validation_queries.sql evidence.
  7) Runs 04_rollback.sql twice (idempotency); tears down container.

  Does NOT write to staging or production.
  Does NOT create Auth Admin users in live staging.
#>
param(
  [string]$ProjectRef = 'owmcrqvnfubyjxrlyhlc',
  [string]$Workdir = ''
)

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$isolated = 'E:\OPUSORG EMPRESA\SincVete\Proyectos\_sv-academia-isolated-deploy'
if (-not (Test-Path $isolated)) { $isolated = (Resolve-Path (Join-Path $here '..\..\..')).Path }

if ($ProjectRef -ne 'owmcrqvnfubyjxrlyhlc') {
  throw 'Abort: dry-run dump source must be staging owmcrqvnfubyjxrlyhlc'
}
if ($ProjectRef -eq 'lhdksiptpsubktikdses') {
  throw 'Abort: production forbidden'
}

if (-not $Workdir) {
  $Workdir = Join-Path $here 'dry_run_work'
}
New-Item -ItemType Directory -Force -Path $Workdir | Out-Null
$schemaFile = Join-Path $Workdir 'staging_public_schema.sql'
$reportFile = Join-Path $Workdir 'dry_run_report.json'
$container = "sv-academia-demo-dryrun-$(Get-Random -Maximum 99999)"
$port = Get-Random -Minimum 55432 -Maximum 55600

Write-Host "=== Academia Demo dry-run (Phase 5C.2) ==="
Write-Host "Dump source project-ref: $ProjectRef (READ-ONLY)"
Write-Host "Workdir: $Workdir"
Write-Host "Container: $container on localhost:$port"

$needDump = -not (Test-Path $schemaFile) -or ((Get-Item $schemaFile).Length -lt 1000)
if ($needDump) {
  Push-Location $isolated
  try {
    Write-Host 'Dumping staging public schema (read-only)...'
    cmd /c "npx --yes supabase db dump --linked --project-ref $ProjectRef --schema public -f `"$schemaFile`" > `"$Workdir\dump.log`" 2>&1"
    if (-not (Test-Path $schemaFile) -or ((Get-Item $schemaFile).Length -lt 1000)) {
      throw "Schema dump failed or too small: $schemaFile"
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Reusing existing schema dump ($((Get-Item $schemaFile).Length) bytes)"
}
$ErrorActionPreference = 'Stop'

Write-Host 'Starting disposable Postgres...'
docker rm -f $container 2>$null | Out-Null
docker run -d --name $container `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_DB=postgres `
  -p "${port}:5432" `
  postgres:15-alpine | Out-Null

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  docker exec $container pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}
if (-not $ready) { throw 'Postgres container failed to become ready' }

function Invoke-PgFile([string]$path, [string]$logName, [int]$onErrorStop = 1) {
  docker cp $path "${container}:/tmp/sv.sql" | Out-Null
  cmd /c "docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=$onErrorStop -f /tmp/sv.sql > `"$Workdir\$logName`" 2>&1"
  if ($LASTEXITCODE -ne 0 -and $onErrorStop -eq 1) {
    return $LASTEXITCODE
  }
  # Detect SQL EXCEPTION even when ON_ERROR_STOP captured oddly
  if ((Test-Path (Join-Path $Workdir $logName))) {
    $logText = Get-Content (Join-Path $Workdir $logName) -Raw -ErrorAction SilentlyContinue
    if ($logText -match 'ERROR:' -and $onErrorStop -eq 1) {
      return 1
    }
  }
  return $LASTEXITCODE
}
function Invoke-Pg([string]$sql) {
  $tmp = Join-Path $Workdir ("inline_{0}.sql" -f [guid]::NewGuid().ToString('N').Substring(0, 8))
  Set-Content -Path $tmp -Value $sql -Encoding utf8
  return Invoke-PgFile $tmp 'inline.log' 1
}

Write-Host 'Creating auth stub + extensions...'
$authStub = Join-Path $Workdir 'auth_stub.sql'
@'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET search_path TO public, extensions, auth;
DO $roles$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $roles$;
DO $roles$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $roles$;
DO $roles$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $roles$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$fn$;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (jobid bigint, schedule text, command text);
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS supabase_functions;
-- Allow role switches used by security tests (auth.jwt needs schema USAGE)
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role, postgres;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role, postgres;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, anon, service_role, postgres;
'@ | Set-Content $authStub -Encoding utf8
$code = Invoke-PgFile $authStub 'auth_stub.log' 1
if ($code -ne 0) { throw 'Auth stub failed — see auth_stub.log' }

Write-Host 'Restoring public schema dump into disposable DB...'
$restoreCode = Invoke-PgFile $schemaFile 'restore.log' 0
Write-Host "Restore finished (exit=$restoreCode; see restore.log). Checking core tables..."
$hasAppts = docker exec $container psql -U postgres -d postgres -t -A -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments');"
if ($hasAppts.Trim() -ne 't') { throw 'Restore failed: public.appointments missing' }

# Grants so SET ROLE authenticated/service_role can exercise triggers
Invoke-Pg @"
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
"@ | Out-Null

Invoke-Pg @"
INSERT INTO public.plans (id, key, name, is_active, is_public, is_internal, display_order, metadata)
SELECT '9c8e1074-4061-4385-8a43-89fa654b90aa'::uuid, 'trial', 'Trial', true, true, false, 0,
       jsonb_build_object('default_trial_days', 14)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='plans')
  AND NOT EXISTS (SELECT 1 FROM public.plans WHERE key='trial');
"@ | Out-Null

Write-Host 'Inserting stub auth.users for seed prerequisite...'
Invoke-Pg @"
INSERT INTO auth.users (id, email) VALUES
  ('b0b0b0b0-d0e0-4000-8000-000000000001', 'owner.demo@academia-demo.invalid'),
  ('b0b0b0b0-d0e0-4000-8000-000000000002', 'vet.demo@academia-demo.invalid'),
  ('b0b0b0b0-d0e0-4000-8000-000000000003', 'recepcion.demo@academia-demo.invalid')
ON CONFLICT (email) DO NOTHING;
"@ | Out-Null

$securityOk = $false
$seedOk = $false
$idempotentOk = $false
$ownershipOk = $false
$forgedRollbackRefused = $false
$assertOk = $false
$rollback1Ok = $false
$rollback2Ok = $false
$validationEvidence = $null
$failureReason = $null
$differences = @(
  'Disposable DB uses schema dump; no GoTrue Auth Admin - stub auth.users only',
  'cron.job not scheduled (no pg_cron runner) - queue_owner_app_reminders not auto-invoked',
  'No Edge Functions / WhatsApp providers / payment webhooks',
  'Some dump objects may fail restore (ownership/extensions); seed targets core public tables',
  'auth.jwt()/auth.uid() stubbed; SET ROLE authenticated approximates PostgREST role switch, not full JWT signing'
)

$seedApply = Join-Path $Workdir 'seed_with_approval.sql'
@"
BEGIN;
SELECT set_config('app.academia_demo_seed_approved', 'yes', true);
$(Get-Content (Join-Path $here '01_seed_data.sql') -Raw)
COMMIT;
"@ | Set-Content $seedApply -Encoding utf8

$rollbackApply = Join-Path $Workdir 'rollback_with_approval.sql'
@"
BEGIN;
SELECT set_config('app.academia_demo_seed_approved', 'yes', true);
$(Get-Content (Join-Path $here '04_rollback.sql') -Raw)
COMMIT;
"@ | Set-Content $rollbackApply -Encoding utf8

try {
  Write-Host 'Applying protect marker...'
  $c1 = Invoke-PgFile (Join-Path $here '05_protect_demo_marker.sql') 'protect.log' 1
  if ($c1 -ne 0) { throw 'Protect marker failed — see protect.log' }

  Write-Host 'Running security tests (distinct DB roles)...'
  $cSec = Invoke-PgFile (Join-Path $here '08_security_tests.sql') 'security_tests.log' 1
  if ($cSec -ne 0) { throw 'Security tests failed — see security_tests.log' }
  $securityOk = $true

  Write-Host 'Applying seed (with approval gate)...'
  $c2 = Invoke-PgFile $seedApply 'seed1.log' 1
  if ($c2 -ne 0) { throw 'Seed pass 1 failed - see seed1.log' }
  $seedOk = $true

  Write-Host 'Idempotent re-seed...'
  $c3 = Invoke-PgFile $seedApply 'seed2.log' 1
  if ($c3 -ne 0) { throw 'Seed pass 2 (idempotency) failed - see seed2.log' }
  $idempotentOk = $true

  Write-Host 'Ownership fixtures (tester rows + strip prior claims)...'
  $cFix = Invoke-PgFile (Join-Path $here '09a_ownership_fixtures.sql') 'ownership_fixtures.log' 1
  if ($cFix -ne 0) { throw 'Ownership fixtures failed - see ownership_fixtures.log' }

  Write-Host 'Re-seed after fixtures (must NOT adopt preexisting rows)...'
  $c3b = Invoke-PgFile $seedApply 'seed3_no_adopt.log' 1
  if ($c3b -ne 0) { throw 'Seed pass 3 (no-adopt) failed - see seed3_no_adopt.log' }

  Write-Host 'Ownership negative assertions (registry lock + non-adoption)...'
  $cOwn = Invoke-PgFile (Join-Path $here '09b_ownership_assertions.sql') 'ownership_assertions.log' 1
  if ($cOwn -ne 0) { throw 'Ownership assertions failed - see ownership_assertions.log' }
  $ownershipOk = $true

  Write-Host 'Forged-registry rollback must REFUSE...'
  $cForge = Invoke-PgFile $rollbackApply 'rollback_forged.log' 1
  if ($cForge -eq 0) { throw 'Forged-registry rollback incorrectly succeeded - see rollback_forged.log' }
  $forgeLog = Get-Content (Join-Path $Workdir 'rollback_forged.log') -Raw
  if ($forgeLog -notmatch 'rollback refused') {
    throw 'Forged-registry rollback did not report refusal - see rollback_forged.log'
  }
  $forgedRollbackRefused = $true

  Write-Host 'Restoring unforged registry + soft-deleting tester fixtures...'
  Invoke-Pg @"
UPDATE public.organizations o
SET settings = o.settings || jsonb_build_object(
  'academia_demo_registry', b.registry
)
FROM public._academia_demo_registry_backup b
WHERE o.id = 'a0a0a0a0-d0e0-4000-8000-000000000001';
UPDATE public.profiles SET deleted_at = now(), is_active = false
WHERE id = 'f1f1f1f1-d0e0-4000-8000-00000000aaaa';
UPDATE public.branch_members SET deleted_at = now(), is_active = false
WHERE user_id = 'f1f1f1f1-d0e0-4000-8000-00000000aaaa';
UPDATE public.professional_schedules SET deleted_at = now()
WHERE user_id = 'f1f1f1f1-d0e0-4000-8000-00000000aaaa' AND deleted_at IS NULL;
DROP TABLE IF EXISTS public._academia_demo_registry_backup;
"@ | Out-Null

  Write-Host 'Fail-closed validation assert (must RAISE on failure)...'
  $cAssert = Invoke-PgFile (Join-Path $here '03_validation_assert.sql') 'validation_assert.log' 1
  if ($cAssert -ne 0) { throw 'Validation ASSERT failed - see validation_assert.log' }
  $assertLog = Get-Content (Join-Path $Workdir 'validation_assert.log') -Raw
  if ($assertLog -notmatch 'ACADEMIA_DEMO_VALIDATION' -and $assertLog -notmatch 'PASS') {
    throw 'Validation assert produced no PASS evidence'
  }
  $assertOk = $true

  Write-Host 'Capturing advisory validation JSON evidence...'
  docker cp (Join-Path $here '03_validation_queries.sql') "${container}:/tmp/sv_val.sql" | Out-Null
  cmd /c "docker exec $container psql -U postgres -d postgres -t -A -v ON_ERROR_STOP=1 -f /tmp/sv_val.sql > `"$Workdir\validation.json`" 2>&1"
  if ($LASTEXITCODE -ne 0) { throw 'validation_queries.sql failed - see validation.json' }
  $validationEvidence = (Get-Content (Join-Path $Workdir 'validation.json') -Raw).Trim()
  if (-not $validationEvidence -or $validationEvidence.Length -lt 10) {
    throw 'validation.json empty or missing'
  }

  $apptCount = docker exec $container psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM public.appointments WHERE organization_id='a0a0a0a0-d0e0-4000-8000-000000000001' AND source_system='academia_demo_seed' AND deleted_at IS NULL;"
  if ([int]$apptCount.Trim() -ne 5) { throw "Expected 5 seed-managed appointments, got $apptCount" }

  Write-Host 'Rollback pass 1...'
  $cR1 = Invoke-PgFile $rollbackApply 'rollback1.log' 1
  if ($cR1 -ne 0) { throw 'Rollback pass 1 failed - see rollback1.log' }
  $rollback1Ok = $true

  Write-Host 'Rollback pass 2 (idempotency)...'
  $cR2 = Invoke-PgFile $rollbackApply 'rollback2.log' 1
  if ($cR2 -ne 0) { throw 'Rollback pass 2 failed - see rollback2.log' }
  $rollback2Ok = $true

  $seedLeft = docker exec $container psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM public.appointments WHERE organization_id='a0a0a0a0-d0e0-4000-8000-000000000001' AND source_system='academia_demo_seed' AND deleted_at IS NULL;"
  if ([int]$seedLeft.Trim() -ne 0) { throw "After rollback expected 0 active seed appts, got $seedLeft" }

  Write-Host 'Dry-run assertions PASSED (security + ownership + seed + assert + rollback x2).'
} catch {
  $failureReason = "$_"
  Write-Host "DRY-RUN FAILURE: $_"
} finally {
  $overall = if (
    $securityOk -and $seedOk -and $idempotentOk -and $ownershipOk -and $forgedRollbackRefused -and $assertOk -and $rollback1Ok -and $rollback2Ok -and -not $failureReason
  ) { 'PASS' } else { 'FAIL' }

  $report = [pscustomobject]@{
    at                       = (Get-Date).ToUniversalTime().ToString('o')
    phase                    = '5C.2-ownership'
    project_ref              = $ProjectRef
    result                   = $overall
    security_ok              = $securityOk
    seed_ok                  = $seedOk
    idempotent_ok            = $idempotentOk
    ownership_ok             = $ownershipOk
    forged_rollback_refused  = $forgedRollbackRefused
    assert_ok                = $assertOk
    rollback1_ok             = $rollback1Ok
    rollback2_ok             = $rollback2Ok
    failure_reason           = $failureReason
    differences              = $differences
    validation_file          = 'validation.json'
    assert_log               = 'validation_assert.log'
    container                = $container
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content $reportFile -Encoding utf8
  Write-Host "Report: $reportFile result=$overall"
  Write-Host 'Tearing down disposable container...'
  docker rm -f $container 2>$null | Out-Null
}

if ($failureReason -or -not $securityOk -or -not $ownershipOk -or -not $forgedRollbackRefused -or -not $assertOk -or -not $rollback2Ok) { exit 1 }
Write-Host '=== Dry-run COMPLETE (no staging writes) ==='
exit 0
