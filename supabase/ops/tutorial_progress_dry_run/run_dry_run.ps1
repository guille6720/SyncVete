# Disposable Postgres dry-run for tutorial_progress migration.
# Does NOT touch shared staging or production.
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$container = 'sv-tutorial-progress-dryrun'

Write-Host 'Starting disposable Postgres (no host port publish)...'
docker rm -f $container 2>$null | Out-Null
docker run -d --name $container -e POSTGRES_PASSWORD=postgres postgres:16-alpine | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to start disposable Postgres' }

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker exec $container pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'Postgres did not become ready' }

function Invoke-SqlFile([string]$path) {
  $code = 0
  Get-Content -Raw $path | docker exec -i $container psql -U postgres -v ON_ERROR_STOP=1 2>&1 | ForEach-Object {
    Write-Host $_
  }
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $path" }
}

Write-Host 'Applying stub schema...'
Invoke-SqlFile (Join-Path $PSScriptRoot '01_stub_schema.sql')
Write-Host 'Applying migration...'
Invoke-SqlFile (Join-Path $root 'supabase\migrations\20261017120000_tutorial_progress.sql')
Write-Host 'Seeding...'
Invoke-SqlFile (Join-Path $PSScriptRoot '02_seed.sql')

Write-Host 'Running security tests...'
$testPath = Join-Path $root 'supabase\tests\tutorial_progress_security.test.sql'
$testOut = (Get-Content -Raw $testPath | docker exec -i $container psql -U postgres -v ON_ERROR_STOP=1 2>&1 | Out-String)
Write-Host $testOut
if ($testOut -match 'TUTORIAL_PROGRESS_SECURITY_FAILED') {
  docker rm -f $container | Out-Null
  throw 'Dry-run security tests failed'
}
if ($testOut -notmatch 'pass=9') {
  docker rm -f $container | Out-Null
  throw 'Dry-run security tests did not report expected pass count'
}

Write-Host 'Re-applying migration (idempotency)...'
Invoke-SqlFile (Join-Path $root 'supabase\migrations\20261017120000_tutorial_progress.sql')

$priv = (docker exec $container psql -U postgres -tAc "SELECT has_function_privilege('anon', 'public.upsert_tutorial_progress(text,int,int,text)', 'EXECUTE')::text;").Trim()
Write-Host "anon_can_execute_upsert=$priv"

docker rm -f $container | Out-Null

if ($priv -eq 'true') {
  throw 'anon unexpectedly has EXECUTE on upsert_tutorial_progress'
}
Write-Host 'DRY_RUN_OK'
exit 0
