# Optional Windows development helper. Uses an isolated cluster inside the ignored .local folder.
param([ValidateSet('start','stop')][string]$Action = 'start', [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localDir = Join-Path $projectRoot '.local'
$databaseDir = Join-Path $localDir 'postgres'
$passwordPath = Join-Path $localDir 'postgres-password.txt'
$pgControl = Join-Path $PostgresBin 'pg_ctl.exe'
if ($Action -eq 'stop') { & $pgControl -D $databaseDir stop -m fast; exit $LASTEXITCODE }
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $databaseDir 'PG_VERSION'))) {
  $passwordBytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
  $databasePassword = [Convert]::ToHexString($passwordBytes).ToLowerInvariant()
  [IO.File]::WriteAllText($passwordPath, $databasePassword)
  & (Join-Path $PostgresBin 'initdb.exe') -D $databaseDir -U scopefree --pwfile=$passwordPath --auth=scram-sha-256 --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
}
& $pgControl -D $databaseDir status *> $null
if ($LASTEXITCODE -ne 0) {
  # pg_ctl launches the server without a visible application window.
  & $pgControl -D $databaseDir -l (Join-Path $localDir 'postgres.log') -o '-p 55432 -h 127.0.0.1' -w start
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
}
$env:PGPASSWORD = [IO.File]::ReadAllText($passwordPath).Trim()
try {
  $exists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p 55432 -U scopefree -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='scopefree'"
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL connection failed.' }
  if ($exists -ne '1') {
    & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U scopefree scopefree
    if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
  }
  [IO.File]::WriteAllText((Join-Path $localDir 'database-url.txt'), "postgresql://scopefree:$($env:PGPASSWORD)@127.0.0.1:55432/scopefree")
} finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
Write-Output 'Local PostgreSQL is ready on 127.0.0.1:55432. The connection URL is in .local/database-url.txt (ignored by Git).'
