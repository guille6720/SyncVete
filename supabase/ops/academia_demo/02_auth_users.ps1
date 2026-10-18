#Requires -Version 5.1
<#
.SYNOPSIS
  Create Academia Demo QA users via Supabase Auth Admin API (staging only).

.DESCRIPTION
  Phase 5C.2 — strict ownership:
  - Reserved @academia-demo.invalid email alone does NOT authorize reuse.
  - Existing accounts require app_metadata.academia_demo=true AND
    app_metadata.academia_demo_managed_by='syncvete_ops' (admin-controlled).
  - Paginates all Auth Admin users.
  - Full preflight before any create.
  - Credentials persisted atomically after each successful create.
  - Password reset of existing QA requires -AllowPasswordReset.
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
$credTmp = Join-Path $here ('credentials.local.{0}.tmp.json' -f [guid]::NewGuid().ToString('N'))

$expectedRef = 'owmcrqvnfubyjxrlyhlc'
$prodRef = 'lhdksiptpsubktikdses'
$demoOrgId = 'a0a0a0a0-d0e0-4000-8000-000000000001'
$managedBy = 'syncvete_ops'

function Write-SafeHost([string]$Message) {
  $safe = $Message
  if ($ServiceRoleKey) { $safe = $safe.Replace($ServiceRoleKey, '[REDACTED_SERVICE_ROLE]') }
  Write-Host $safe
}

function Set-PrivateFileAcl([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  try {
    icacls $Path /inheritance:r | Out-Null
    icacls $Path /grant:r "${env:USERNAME}:(R,W)" | Out-Null
  } catch {
    Write-SafeHost 'WARN: could not tighten ACL on credentials file'
  }
}

function Save-CredentialsAtomic([object]$Payload) {
  $json = $Payload | ConvertTo-Json -Depth 6
  Set-Content -Path $credTmp -Value $json -Encoding utf8
  Set-PrivateFileAcl -Path $credTmp
  Move-Item -LiteralPath $credTmp -Destination $credPath -Force
  Set-PrivateFileAcl -Path $credPath
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

function Test-IsTrustedDemoAccount($userObj) {
  if (-not $userObj) { return $false }
  $email = [string]$userObj.email
  if ($email -notlike '*@academia-demo.invalid') { return $false }
  $app = $userObj.app_metadata
  if (-not $app) { return $false }
  $demoFlag = ($app.academia_demo -eq $true -or $app.academia_demo -eq 'true')
  $by = [string]$app.academia_demo_managed_by
  return ($demoFlag -and $by -eq $managedBy)
}

function Get-AllAuthUsers {
  $hdr = @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
    Accept        = 'application/json'
  }
  $all = @()
  $page = 1
  $perPage = 200
  while ($true) {
    $uri = "$ProjectUrl/auth/v1/admin/users?page=$page&per_page=$perPage"
    $listed = Invoke-RestMethod -Method GET -Uri $uri -Headers $hdr
    $batch = @()
    if ($listed.users) { $batch = @($listed.users) }
    elseif ($listed -is [System.Array]) { $batch = @($listed) }
    if ($batch.Count -eq 0) { break }
    $all += $batch
    if ($batch.Count -lt $perPage) { break }
    $page++
    if ($page -gt 50) { throw 'Abort: Auth user pagination exceeded safety limit' }
  }
  return $all
}

function Get-ProfileOrgId([string]$UserId) {
  $uri = "$ProjectUrl/rest/v1/profiles?id=eq.$UserId&select=id,organization_id,deleted_at"
  $hdr = @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
    Accept        = 'application/json'
  }
  $rows = Invoke-RestMethod -Method GET -Uri $uri -Headers $hdr
  if (-not $rows -or @($rows).Count -eq 0) { return $null }
  $active = @($rows) | Where-Object { -not $_.deleted_at } | Select-Object -First 1
  if (-not $active) { return $null }
  return [string]$active.organization_id
}

function Find-UserByEmail($allUsers, [string]$Email) {
  return @($allUsers) | Where-Object { $_.email -eq $Email } | Select-Object -First 1
}

Write-SafeHost "Academia Demo Auth plan — project $expectedRef"
Write-SafeHost "Mode: $(if ($Execute) { 'EXECUTE' } else { 'PREPARE (no API writes)' })"
Write-SafeHost "AllowPasswordReset: $AllowPasswordReset"
Write-SafeHost "Trusted managed_by marker: $managedBy"
foreach ($u in $users) { Write-SafeHost "  - $($u.email) ($($u.role))" }

if (-not $Execute) {
  Write-SafeHost 'Re-run with -Execute after explicit authorization.'
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

# -------- PREFLIGHT (no writes) --------
Write-SafeHost 'Preflight: listing Auth users (all pages)...'
$allUsers = Get-AllAuthUsers
$plan = @()

foreach ($u in $users) {
  $found = Find-UserByEmail $allUsers $u.email
  if ($found) {
    if (-not (Test-IsTrustedDemoAccount $found)) {
      throw "Abort PREFLIGHT: existing account $($u.email) lacks trusted app_metadata (academia_demo + managed_by=$managedBy). Reserved email alone is insufficient."
    }
    $profileOrg = Get-ProfileOrgId -UserId ([string]$found.id)
    if ($profileOrg -and $profileOrg -ne $demoOrgId) {
      throw "Abort PREFLIGHT: $($u.email) profile bound to foreign org $profileOrg"
    }
    $plan += [pscustomobject]@{ email = $u.email; action = 'reuse'; id = [string]$found.id; role = $u.role; full_name = $u.full_name }
  } else {
    $plan += [pscustomobject]@{ email = $u.email; action = 'create'; id = $null; role = $u.role; full_name = $u.full_name }
  }
}

Write-SafeHost 'Preflight OK. Planned actions:'
foreach ($p in $plan) { Write-SafeHost "  $($p.action) $($p.email)" }

$resultUsers = @()
if ($existingCreds.Count -gt 0) {
  foreach ($k in $existingCreds.Keys) {
    # Preserve prior entries for emails not in this run
  }
}

foreach ($p in $plan) {
  $password = $null
  $userId = $null

  try {
    if ($p.action -eq 'reuse') {
      $userId = $p.id
      if ($AllowPasswordReset) {
        $password = if ($existingCreds.ContainsKey($p.email) -and $existingCreds[$p.email].password) {
          [string]$existingCreds[$p.email].password
        } else { New-SecurePassword }
        $body = @{
          password      = $password
          email_confirm = $true
          app_metadata  = @{
            academia_demo            = $true
            academia_demo_managed_by = $managedBy
            demo_role                = $p.role
          }
          user_metadata = @{
            academia_demo = $true
            full_name     = $p.full_name
            demo_role     = $p.role
          }
        } | ConvertTo-Json -Depth 5
        $upd = Invoke-RestMethod -Method PUT -Uri "$ProjectUrl/auth/v1/admin/users/$userId" -Headers $headers -Body $body
        $userId = $upd.id
        Write-SafeHost "Reused trusted QA user with password rotation: $($p.email)"
      } else {
        $password = if ($existingCreds.ContainsKey($p.email) -and $existingCreds[$p.email].password) {
          [string]$existingCreds[$p.email].password
        } else { $null }
        Write-SafeHost "Reused trusted QA user (no password change): $($p.email)"
      }
    } else {
      $password = New-SecurePassword
      $body = @{
        email         = $p.email
        password      = $password
        email_confirm = $true
        user_metadata = @{
          academia_demo = $true
          full_name     = $p.full_name
          demo_role     = $p.role
        }
        app_metadata  = @{
          academia_demo            = $true
          academia_demo_managed_by = $managedBy
          demo_role                = $p.role
        }
      } | ConvertTo-Json -Depth 5
      $created = Invoke-RestMethod -Method POST -Uri "$ProjectUrl/auth/v1/admin/users" -Headers $headers -Body $body
      $userId = $created.id
      Write-SafeHost "Created QA user: $($p.email)"
    }

    $entry = [pscustomobject]@{
      email     = $p.email
      role      = $p.role
      full_name = $p.full_name
      id        = $userId
      password  = $password
      action    = $p.action
    }
    $resultUsers += $entry

    # Merge into credential map and persist after EACH success (recoverable)
    $existingCreds[$p.email] = $entry
    $payload = [pscustomobject]@{
      project_ref = $expectedRef
      updated_at  = (Get-Date).ToUniversalTime().ToString('o')
      warning     = 'LOCAL SECRET — do not commit, log, or paste into tickets'
      managed_by  = $managedBy
      users       = @($existingCreds.Values)
    }
    Save-CredentialsAtomic -Payload $payload
  } catch {
    Write-SafeHost "ERROR on $($p.email): $($_.Exception.Message)"
    Write-SafeHost 'Partial progress preserved in credentials.local.json when prior creates succeeded.'
    throw
  }
}

Write-SafeHost 'Auth provisioning complete. credentials.local.json updated (gitignored).'
Write-SafeHost 'Next: gated seed via 07_run_staging_gated.ps1 (not auto-executed).'
