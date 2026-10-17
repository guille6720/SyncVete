#Requires -Version 5.1
<#
.SYNOPSIS
  Disposable dry-run of Academia Demo seed against a schema dump from staging.

.DESCRIPTION
  1) Dumps public (+ minimal auth stub) schema from staging (READ-ONLY dump).
  2) Starts ephemeral Postgres Docker container.
  3) Restores dump, stubs auth.users for QA emails, inserts trial plan if needed.
  4) Applies 05_protect_demo_marker.sql + 01_seed_data.sql.
  5) Runs 03_validation_queries.sql and a second seed pass (idempotency).
  6) Tears down container.

  Does NOT write to staging or production.
  Does NOT create Auth Admin users in live staging.

.PARAMETER ProjectRef
  Must be owmcrqvnfubyjxrlyhlc (staging).
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

Write-Host "=== Academia Demo dry-run ==="
Write-Host "Dump source project-ref: $ProjectRef (READ-ONLY)"
Write-Host "Workdir: $Workdir"
Write-Host "Container: $container on localhost:$port"

# 1) Schema dump from staging (reuse recent dump if present)
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

# 2) Ephemeral Postgres
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
  return $LASTEXITCODE
}
function Invoke-Pg([string]$sql) {
  $tmp = Join-Path $Workdir ("inline_{0}.sql" -f [guid]::NewGuid().ToString('N').Substring(0, 8))
  Set-Content -Path $tmp -Value $sql -Encoding utf8
  return Invoke-PgFile $tmp 'inline.log' 1
}

# 3) Minimal auth schema so FKs to auth.users succeed
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
'@ | Set-Content $authStub -Encoding utf8
$code = Invoke-PgFile $authStub 'auth_stub.log' 1
if ($code -ne 0) { throw 'Auth stub failed — see auth_stub.log' }

# 4) Restore public schema dump (tolerate ownership/extension noise)
Write-Host 'Restoring public schema dump into disposable DB...'
Invoke-PgFile $schemaFile 'restore.log' 0 | Out-Null
Write-Host 'Restore finished (see restore.log). Checking core tables...'
$hasAppts = docker exec $container psql -U postgres -d postgres -t -A -c "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments');"
if ($hasAppts.Trim() -ne 't') { throw 'Restore failed: public.appointments missing' }

# Ensure trial plan exists for subscription trigger
Invoke-Pg @"
INSERT INTO public.plans (id, key, name, is_active, is_public, is_internal, display_order, metadata)
SELECT '9c8e1074-4061-4385-8a43-89fa654b90aa'::uuid, 'trial', 'Trial', true, true, false, 0,
       jsonb_build_object('default_trial_days', 14)
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='plans')
  AND NOT EXISTS (SELECT 1 FROM public.plans WHERE key='trial');
"@ | Out-Null

# Stub QA auth users
Write-Host 'Inserting stub auth.users for seed prerequisite...'
Invoke-Pg @"
INSERT INTO auth.users (id, email) VALUES
  ('b0b0b0b0-d0e0-4000-8000-000000000001', 'owner.demo@academia-demo.invalid'),
  ('b0b0b0b0-d0e0-4000-8000-000000000002', 'vet.demo@academia-demo.invalid'),
  ('b0b0b0b0-d0e0-4000-8000-000000000003', 'recepcion.demo@academia-demo.invalid')
ON CONFLICT (email) DO NOTHING;
"@ | Out-Null

$seedOk = $false
$idempotentOk = $false
$validationJson = $null
$differences = @(
  'Disposable DB uses schema dump; no GoTrue Auth Admin — stub auth.users only',
  'cron.job not scheduled (no pg_cron runner) — queue_owner_app_reminders not auto-invoked',
  'No Edge Functions / WhatsApp providers / payment webhooks',
  'Some dump objects may fail restore (ownership/extensions); seed targets core public tables',
  'auth.jwt()/auth.uid() stubbed; RLS policies not fully exercised as authenticated clinic user'
)

try {
  # 5) Protect marker + seed
  Write-Host 'Applying protect marker + seed...'
  $c1 = Invoke-PgFile (Join-Path $here '05_protect_demo_marker.sql') 'protect.log' 1
  if ($c1 -ne 0) { throw 'Protect marker failed — see protect.log' }
  $c2 = Invoke-PgFile (Join-Path $here '01_seed_data.sql') 'seed1.log' 1
  if ($c2 -ne 0) { throw 'Seed pass 1 failed — see seed1.log' }
  $seedOk = $true

  # Idempotency: second pass
  $c3 = Invoke-PgFile (Join-Path $here '01_seed_data.sql') 'seed2.log' 1
  if ($c3 -ne 0) { throw 'Seed pass 2 (idempotency) failed — see seed2.log' }
  $idempotentOk = $true

  # Validation
  docker cp (Join-Path $here '03_validation_queries.sql') "${container}:/tmp/sv_val.sql" | Out-Null
  cmd /c "docker exec $container psql -U postgres -d postgres -t -A -v ON_ERROR_STOP=1 -f /tmp/sv_val.sql > `"$Workdir\validation.json`" 2>&1"

  $apptCount = docker exec $container psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM public.appointments WHERE organization_id='a0a0a0a0-d0e0-4000-8000-000000000001' AND deleted_at IS NULL;"
  if ([int]$apptCount.Trim() -ne 5) { throw "Expected 5 demo appointments, got $apptCount" }

  Write-Host 'Dry-run assertions passed (5 appointments, idempotent re-seed).'
} catch {
  Write-Host "DRY-RUN FAILURE: $_"
  $seedOk = $false
} finally {
  $report = [pscustomobject]@{
    at              = (Get-Date).ToUniversalTime().ToString('o')
    project_ref     = $ProjectRef
    seed_ok         = $seedOk
    idempotent_ok   = $idempotentOk
    differences     = $differences
    validation_file = 'validation.json'
    container       = $container
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content $reportFile -Encoding utf8
  Write-Host "Report: $reportFile"
  Write-Host 'Tearing down disposable container...'
  docker rm -f $container 2>$null | Out-Null
}

if (-not $seedOk) { exit 1 }
Write-Host '=== Dry-run COMPLETE (no staging writes) ==='
exit 0
