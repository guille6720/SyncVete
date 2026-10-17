#Requires -Version 5.1
<#
.SYNOPSIS
  Create Academia Demo QA users via Supabase Auth Admin API (staging only).

.DESCRIPTION
  - Never inserts into auth.users directly.
  - Uses non-deliverable @academia-demo.invalid emails.
  - email_confirm=true so password login works without invitation email.
  - Passwords are generated into credentials.local.json (gitignored) — never logged.
  - DO NOT RUN until explicitly authorized for staging owmcrqvnfubyjxrlyhlc.

.PARAMETER Execute
  Actually call the Admin API. Without this flag, dry-prints the plan only.

.PARAMETER ProjectUrl
  Defaults to $env:SYNC_STAGING_SUPABASE_URL (must contain owmcrqvnfubyjxrlyhlc).

.PARAMETER ServiceRoleKey
  Defaults to $env:SYNC_STAGING_SERVICE_ROLE_KEY (never printed).
#>
param(
  [switch]$Execute,
  [string]$ProjectUrl = $env:SYNC_STAGING_SUPABASE_URL,
  [string]$ServiceRoleKey = $env:SYNC_STAGING_SERVICE_ROLE_KEY
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$credPath = Join-Path $here 'credentials.local.json'

$expectedRef = 'owmcrqvnfubyjxrlyhlc'
$prodRef = 'lhdksiptpsubktikdses'

if (-not $ProjectUrl) { throw 'Abort: set SYNC_STAGING_SUPABASE_URL' }
if ($ProjectUrl -like "*$prodRef*") { throw 'Abort: refusing production project URL' }
if ($ProjectUrl -notlike "*$expectedRef*") {
  throw "Abort: URL must target staging project-ref $expectedRef"
}
if (-not $ServiceRoleKey) { throw 'Abort: set SYNC_STAGING_SERVICE_ROLE_KEY' }

$users = @(
  @{ email = 'owner.demo@academia-demo.invalid'; role = 'owner'; full_name = 'Owner Demo Academia' }
  @{ email = 'vet.demo@academia-demo.invalid'; role = 'veterinarian'; full_name = 'Dra. Ana Demo' }
  @{ email = 'recepcion.demo@academia-demo.invalid'; role = 'receptionist'; full_name = 'Recepción Demo' }
)

function New-SecurePassword {
  # 32 chars, URL-safe-ish; not logged
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=')
}

Write-Host "Academia Demo Auth plan — project $expectedRef"
Write-Host "Mode: $(if ($Execute) { 'EXECUTE' } else { 'PREPARE (no API writes)' })"
Write-Host "Users to ensure:"
foreach ($u in $users) { Write-Host "  - $($u.email) ($($u.role))" }

if (-not $Execute) {
  Write-Host 'Re-run with -Execute after explicit authorization.'
  Write-Host "Credentials would be written to: $credPath (gitignored)"
  exit 0
}

$headers = @{
  apikey         = $ServiceRoleKey
  Authorization  = "Bearer $ServiceRoleKey"
  'Content-Type' = 'application/json'
}

$existingCreds = @{}
if (Test-Path $credPath) {
  try {
    $prev = Get-Content $credPath -Raw | ConvertFrom-Json
    foreach ($row in $prev.users) { $existingCreds[$row.email] = $row }
  } catch { }
}

$resultUsers = @()

foreach ($u in $users) {
  $password = if ($existingCreds.ContainsKey($u.email) -and $existingCreds[$u.email].password) {
    [string]$existingCreds[$u.email].password
  } else {
    New-SecurePassword
  }

  # List by email (Admin API)
  $listUri = "$ProjectUrl/auth/v1/admin/users?page=1&per_page=200"
  $listed = Invoke-RestMethod -Method GET -Uri $listUri -Headers $headers
  $found = $null
  if ($listed.users) {
    $found = $listed.users | Where-Object { $_.email -eq $u.email } | Select-Object -First 1
  }

  if ($found) {
    # Update password + confirm (no invite email)
    $body = @{
      password      = $password
      email_confirm = $true
      user_metadata = @{
        academia_demo = $true
        full_name     = $u.full_name
        demo_role     = $u.role
      }
      app_metadata  = @{ academia_demo = $true }
    } | ConvertTo-Json -Depth 5
    $upd = Invoke-RestMethod -Method PUT -Uri "$ProjectUrl/auth/v1/admin/users/$($found.id)" -Headers $headers -Body $body
    $userId = $upd.id
    Write-Host "Updated existing QA user: $($u.email)"
  } else {
    $body = @{
      email         = $u.email
      password      = $password
      email_confirm = $true
      user_metadata = @{
        academia_demo = $true
        full_name     = $u.full_name
        demo_role     = $u.role
      }
      app_metadata  = @{ academia_demo = $true }
    } | ConvertTo-Json -Depth 5
    $created = Invoke-RestMethod -Method POST -Uri "$ProjectUrl/auth/v1/admin/users" -Headers $headers -Body $body
    $userId = $created.id
    Write-Host "Created QA user: $($u.email)"
  }

  $resultUsers += [pscustomobject]@{
    email     = $u.email
    role      = $u.role
    full_name = $u.full_name
    id        = $userId
    password  = $password
  }
}

$payload = [pscustomobject]@{
  project_ref   = $expectedRef
  created_at    = (Get-Date).ToUniversalTime().ToString('o')
  warning       = 'LOCAL SECRET — do not commit, log, or paste into tickets'
  users         = $resultUsers
}
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $credPath -Encoding utf8
Write-Host "Wrote credentials to credentials.local.json (gitignored). Do not commit."
Write-Host 'Next: apply 05_protect_demo_marker.sql then 01_seed_data.sql (gated COMMIT).'
