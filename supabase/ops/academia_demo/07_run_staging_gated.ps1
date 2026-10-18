#Requires -Version 5.1
<#
.SYNOPSIS
  Gated staging runner for Academia Demo seed. Defaults to prepare-only.
  This script never auto-executes SQL against staging.

.DESCRIPTION
  Phase 5C.2: Commit bundles include fail-closed 03_validation_assert.sql
  BEFORE COMMIT so any failed assertion aborts the transaction.

.PARAMETER Mode
  Prepare  - Auth users plan only (no API writes)
  DrySql   - Builds BEGIN...ROLLBACK bundle for operator
  Commit   - Builds BEGIN...COMMIT bundle; requires -IAuthorizeStagingSeed
#>
param(
  [ValidateSet('Prepare', 'DrySql', 'Commit')]
  [string]$Mode = 'Prepare',
  [switch]$IAuthorizeStagingSeed,
  [switch]$AllowPasswordReset
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$isolated = 'E:\OPUSORG EMPRESA\SincVete\Proyectos\_sv-academia-isolated-deploy'
$ref = 'owmcrqvnfubyjxrlyhlc'
$prod = 'lhdksiptpsubktikdses'

if ($env:SYNC_STAGING_SUPABASE_URL -like "*$prod*") {
  throw 'Abort: production URL detected'
}

Write-Host "Mode=$Mode project-ref=$ref"

if ($Mode -eq 'Prepare') {
  if ($AllowPasswordReset) {
    & (Join-Path $here '02_auth_users.ps1') -AllowPasswordReset
  } else {
    & (Join-Path $here '02_auth_users.ps1')
  }
  Write-Host 'Next: 02_auth_users.ps1 -Execute (authorized), then DrySql bundle, then Commit -IAuthorizeStagingSeed'
  exit 0
}

if ($Mode -eq 'Commit' -and -not $IAuthorizeStagingSeed) {
  throw 'Abort: Commit requires -IAuthorizeStagingSeed'
}

$txEnd = if ($Mode -eq 'Commit') { 'COMMIT;' } else { 'ROLLBACK;' }
$bundle = Join-Path $here ("_bundle_{0}.sql" -f $Mode.ToLowerInvariant())

$approval = @"
-- Operator approval gate (transaction-local; NOT authentication / NOT a substitute for service_role)
SELECT set_config('app.academia_demo_seed_approved', 'yes', true);
"@

# Fail-closed: assert MUST run before COMMIT. Any RAISE aborts the TX.
$parts = @(
  ("-- GATED Academia Demo apply - {0}" -f $Mode),
  ("-- project-ref MUST be {0}" -f $ref),
  ("-- Phase 5C.2: protect marker + approved seed + FAIL-CLOSED assert before {0}" -f $txEnd),
  '-- MUST NOT be used for production. Does not auto-execute.',
  'BEGIN;',
  '',
  $approval,
  '',
  (Get-Content (Join-Path $here '05_protect_demo_marker.sql') -Raw),
  '',
  (Get-Content (Join-Path $here '01_seed_data.sql') -Raw),
  '',
  '-- Fail-closed validation: blocks COMMIT on any failed assertion',
  (Get-Content (Join-Path $here '03_validation_assert.sql') -Raw),
  '',
  '-- Advisory JSON evidence (non-mutating)',
  (Get-Content (Join-Path $here '03_validation_queries.sql') -Raw),
  '',
  $txEnd
)
$parts -join "`n" | Set-Content $bundle -Encoding utf8

Write-Host "Bundle written: $bundle"
Write-Host "Transaction end: $txEnd"
Write-Host 'Assert file included: 03_validation_assert.sql (evaluated before COMMIT/ROLLBACK)'
Write-Host 'Manual apply (operator) after Auth users exist:'
Write-Host ("  npx supabase db query --linked --project-ref {0} --workdir `"{1}`" -f `"{2}`"" -f $ref, $isolated, $bundle)
Write-Host 'Security tests (disposable only): 08_security_tests.sql via 06_dry_run.ps1'
Write-Host 'This script does NOT execute the bundle.'
exit 0
