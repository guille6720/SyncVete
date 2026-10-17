# STAGING ONLY — DO NOT RUN until authorized.
# Creates non-deliverable @academia-demo.invalid users via Auth Admin API.
# Requires staging service role in env; never print secrets.

$ErrorActionPreference = 'Stop'
$projectUrl = $env:SYNC_STAGING_SUPABASE_URL
$serviceKey = $env:SYNC_STAGING_SERVICE_ROLE_KEY

if (-not $projectUrl -or $projectUrl -notlike '*owmcrqvnfubyjxrlyhlc*') {
  throw 'Abort: SYNC_STAGING_SUPABASE_URL must point to owmcrqvnfubyjxrlyhlc'
}
if (-not $serviceKey) { throw 'Abort: missing SYNC_STAGING_SERVICE_ROLE_KEY' }

$emails = @(
  'owner.demo@academia-demo.invalid',
  'vet.demo@academia-demo.invalid',
  'recepcion.demo@academia-demo.invalid'
)

Write-Host 'PREPARED ONLY — uncomment Invoke-RestMethod after authorization.'
foreach ($email in $emails) {
  Write-Host "Would create user: $email (email_confirm=true, no invite email required)"
  # $body = @{ email = $email; password = (New-Guid).Guid; email_confirm = $true; user_metadata = @{ academia_demo = $true } } | ConvertTo-Json
  # Invoke-RestMethod -Method POST -Uri "$projectUrl/auth/v1/admin/users" -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; 'Content-Type' = 'application/json' } -Body $body
}

Write-Host 'After users exist, link profiles/branch_members via 01_seed_plan.sql under COMMIT authorization.'
