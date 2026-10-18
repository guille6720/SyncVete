#Requires -Version 5.1
<#
.SYNOPSIS
  Create Academia Demo QA users via Supabase Auth Admin API (staging only).

.DESCRIPTION
  - Never inserts into auth.users directly.
  - Uses non-deliverable @academia-demo.invalid emails.
  - email_confirm=true so password login works without invitation email.
  - Passwords written only to credentials.local.json (gitignored); never logged.
  - Existing accounts: REJECTED unless they are already Academia Demo QA accounts.
  - Password reset of an existing account requires -AllowPasswordReset explicitly.
  - Refuses accounts that already have a profile in another organization.
  - DO NOT RUN until explicitly authorized for staging owmcrqvnfubyjxrlyhlc.

.PARAMETER Execute
  Call the Admin API. Without this flag, prints the plan only.

.PARAMETER AllowPasswordReset
  Required to rotate password on an EXISTING academia-demo QA account.
  Never set casually; default is refuse password mutation on existing users.

.PARAMETER ProjectUrl / ServiceRoleKey
  From env SYNC_STAGING_*; never printed.
#>
param(
  [switch]$Execute,
  [switch]$AllowPasswordReset,
  [string]$ProjectUrl = $env:SYNC_STAGING_SUPABASE_URL,
  [string]$ServiceRoleKey = $env:SYNC_STAGING_SERVICE_ROLE_KEY
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$credPath = Join-Path $here 'credentials.local.json'

$expectedRef = 'owmcrqvnfubyjxrlyhlc'
$prodRef = 'lhdksiptpsubktikdses'
$demoOrgId = 'a0a0a0a0-d0e0-4000-8000-000000000001'

function Write-SafeHost([string]$Message) {
  # Never echo service role key or passwords if accidentally interpolated
  $safe = $Message
  if ($ServiceRoleKey) { $safe = $safe.Replace($ServiceRoleKey, '[REDACTED_SERVICE_ROLE]') }
  Write-Host $safe
}

function Set-PrivateFileAcl([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  try {
    if ($IsWindows -or $env:OS -like '*Windows*') {
      icacls $Path /inheritance:r | Out-Null
      icacls $Path /grant:r "${env:USERNAME}:(R,W)" | Out-Null
    } else {
      chmod 600 $Path 2>$null
    }
  } catch {
    Write-SafeHost "WARN: could not tighten ACL on credentials file (continue)"
  }
}

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
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=')
}

function Test-IsAcademiaDemoAuthUser($userObj) {
  if (-not $userObj) { return $false }
  $email = [string]$userObj.email
  if ($email -notlike '*@academia-demo.invalid') { return $false }
  $appMeta = $userObj.app_metadata
  if ($appMeta -and ($appMeta.academia_demo -eq $true -or $appMeta.academia_demo -eq 'true')) {
    return $true
  }
  # Brand-new reserved email without metadata yet: treat as eligible only if no profile elsewhere
  return $true
}

function Get-ProfileOrgId([string]$UserId) {
  $uri = "$ProjectUrl/rest/v1/profiles?id=eq.$UserId&select=id,organization_id,deleted_at"
  $hdr = @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
    Accept        = 'application/json'
  }
  $rows = Invoke-RestMethod -Method GET -Uri $uri -Headers $hdr
  if (-not $rows -or $rows.Count -eq 0) { return $null }
  $active = $rows | Where-Object { -not $_.deleted_at } | Select-Object -First 1
  if (-not $active) { return $null }
  return [string]$active.organization_id
}

Write-SafeHost "Academia Demo Auth plan — project $expectedRef"
Write-SafeHost "Mode: $(if ($Execute) { 'EXECUTE' } else { 'PREPARE (no API writes)' })"
Write-SafeHost "AllowPasswordReset: $AllowPasswordReset"
Write-SafeHost 'Users to ensure:'
foreach ($u in $users) { Write-SafeHost "  - $($u.email) ($($u.role))" }

if (-not $Execute) {
  Write-SafeHost 'Re-run with -Execute after explicit authorization.'
  Write-SafeHost "Credentials would be written to: $credPath (gitignored)"
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
  $listUri = "$ProjectUrl/auth/v1/admin/users?page=1&per_page=200"
  $listed = Invoke-RestMethod -Method GET -Uri $listUri -Headers $headers
  $found = $null
  if ($listed.users) {
    $found = $listed.users | Where-Object { $_.email -eq $u.email } | Select-Object -First 1
  }

  if ($found) {
    if (-not (Test-IsAcademiaDemoAuthUser $found)) {
      throw "Abort: conflicting Auth account exists for $($u.email) and is not an Academia Demo QA account"
    }

    $profileOrg = Get-ProfileOrgId -UserId ([string]$found.id)
    if ($profileOrg -and $profileOrg -ne $demoOrgId) {
      throw "Abort: $($u.email) already has profile in organization $profileOrg (not demo org)"
    }

    # Existing account: never reset password unless explicitly authorized
    if ($AllowPasswordReset) {
      $password = if ($existingCreds.ContainsKey($u.email) -and $existingCreds[$u.email].password) {
        [string]$existingCreds[$u.email].password
      } else {
        New-SecurePassword
      }
      $body = @{
        password      = $password
        email_confirm = $true
        app_metadata  = @{ academia_demo = $true; demo_role = $u.role }
        user_metadata = @{
          academia_demo = $true
          full_name     = $u.full_name
          demo_role     = $u.role
        }
      } | ConvertTo-Json -Depth 5
      $upd = Invoke-RestMethod -Method PUT -Uri "$ProjectUrl/auth/v1/admin/users/$($found.id)" -Headers $headers -Body $body
      $userId = $upd.id
      Write-SafeHost "Updated existing Academia Demo QA user (password rotated): $($u.email)"
    } else {
      # Metadata-only reinforce; no password field
      $body = @{
        email_confirm = $true
        app_metadata  = @{ academia_demo = $true; demo_role = $u.role }
        user_metadata = @{
          academia_demo = $true
          full_name     = $u.full_name
          demo_role     = $u.role
        }
      } | ConvertTo-Json -Depth 5
      $upd = Invoke-RestMethod -Method PUT -Uri "$ProjectUrl/auth/v1/admin/users/$($found.id)" -Headers $headers -Body $body
      $userId = $upd.id
      $password = if ($existingCreds.ContainsKey($u.email) -and $existingCreds[$u.email].password) {
        [string]$existingCreds[$u.email].password
      } else {
        $null
      }
      Write-SafeHost "Existing Academia Demo QA user kept (no password reset): $($u.email)"
      if (-not $password) {
        Write-SafeHost "WARN: no local password on file for $($u.email); use -AllowPasswordReset if login credentials must be issued"
      }
    }
  } else {
    $password = New-SecurePassword
    $body = @{
      email         = $u.email
      password      = $password
      email_confirm = $true
      user_metadata = @{
        academia_demo = $true
        full_name     = $u.full_name
        demo_role     = $u.role
      }
      app_metadata  = @{ academia_demo = $true; demo_role = $u.role }
    } | ConvertTo-Json -Depth 5
    $created = Invoke-RestMethod -Method POST -Uri "$ProjectUrl/auth/v1/admin/users" -Headers $headers -Body $body
    $userId = $created.id
    Write-SafeHost "Created QA user: $($u.email)"
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
  project_ref = $expectedRef
  created_at  = (Get-Date).ToUniversalTime().ToString('o')
  warning     = 'LOCAL SECRET — do not commit, log, or paste into tickets'
  users       = $resultUsers
}
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $credPath -Encoding utf8
Set-PrivateFileAcl -Path $credPath
Write-SafeHost 'Wrote credentials.local.json (gitignored, ACL tightened). Do not commit.'
Write-SafeHost 'Next: apply 05_protect_demo_marker.sql then gated 01_seed_data.sql.'
