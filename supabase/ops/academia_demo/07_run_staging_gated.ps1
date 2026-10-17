#Requires -Version 5.1
<#
.SYNOPSIS
  Gated staging runner for Academia Demo seed. Defaults to prepare-only.
  This script never auto-executes SQL against staging.

.PARAMETER Mode
  Prepare  — Auth users plan only (no API writes)
  DrySql   — Builds BEGIN…ROLLBACK bundle for operator
  Commit   — Builds BEGIN…COMMIT bundle; requires -IAuthorizeStagingSeed
#>
param(
  [ValidateSet('Prepare', 'DrySql', 'Commit')]
  [string]$Mode = 'Prepare',
  [switch]$IAuthorizeStagingSeed
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
  & (Join-Path $here '02_auth_users.ps1')
  Write-Host 'Next: 02_auth_users.ps1 -Execute (authorized), then DrySql bundle, then Commit -IAuthorizeStagingSeed'
  exit 0
}

if ($Mode -eq 'Commit' -and -not $IAuthorizeStagingSeed) {
  throw 'Abort: Commit requires -IAuthorizeStagingSeed'
}

$txEnd = if ($Mode -eq 'Commit') { 'COMMIT;' } else { 'ROLLBACK;' }
$bundle = Join-Path $here ("_bundle_{0}.sql" -f $Mode.ToLowerInvariant())

$parts = @(
  "-- GATED Academia Demo apply — $Mode",
  "-- project-ref MUST be $ref",
  'BEGIN;',
  '',
  (Get-Content (Join-Path $here '05_protect_demo_marker.sql') -Raw),
  '',
  (Get-Content (Join-Path $here '01_seed_data.sql') -Raw),
  '',
  (Get-Content (Join-Path $here '03_validation_queries.sql') -Raw),
  '',
  $txEnd
)
$parts -join "`n" | Set-Content $bundle -Encoding utf8

Write-Host "Bundle written: $bundle"
Write-Host "Transaction end: $txEnd"
Write-Host 'Manual apply (operator) after Auth users exist:'
Write-Host "  npx supabase db query --linked --project-ref $ref --workdir `"$isolated`" -f `"$bundle`""
Write-Host 'This script does NOT execute the bundle.'
exit 0
