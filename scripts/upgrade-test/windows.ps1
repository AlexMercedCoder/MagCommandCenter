<#
.SYNOPSIS
  Packaged upgrade test for Windows: previous release MSI -> new MSI, data must survive.

.EXAMPLE
  pwsh scripts/upgrade-test/windows.ps1 -OldMsi previous\old.msi -NewMsi new\new.msi -NewVersion 1.0.0

.NOTES
  Installs per-machine MSIs, so run it only on a disposable CI runner. -NewVersion is the
  native version the new build records (tauri.conf.json "version").
#>
param(
  [Parameter(Mandatory = $true)][string]$OldMsi,
  [Parameter(Mandatory = $true)][string]$NewMsi,
  [Parameter(Mandatory = $true)][string]$NewVersion
)
$ErrorActionPreference = 'Stop'
$stateDb = Join-Path $PSScriptRoot 'state_db.py'
$dataDir = Join-Path $env:APPDATA 'com.alexmerced.magcommandcenter'
$db = Join-Path $dataDir 'command-center.sqlite3'
$logs = if ($env:UPGRADE_LOG_DIR) { $env:UPGRADE_LOG_DIR } else { Join-Path (Get-Location) 'upgrade-logs' }
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Invoke-StateDb([string[]]$Arguments) {
  & python $stateDb @Arguments
  if ($LASTEXITCODE -ne 0) { throw "state_db.py $($Arguments[0]) failed with exit code $LASTEXITCODE" }
}

function Install-Msi([string]$Path, [string]$Label) {
  $log = Join-Path $logs "msi-$Label.log"
  $full = (Resolve-Path $Path).Path
  $process = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @('/i', "`"$full`"", '/qn', '/norestart', '/l*v', "`"$log`"")
  if ($process.ExitCode -notin 0, 3010) {
    Get-Content $log -Tail 60
    throw "msiexec ($Label) exited with $($process.ExitCode)"
  }
  Write-Host "installed $Label MSI"
}

function Find-App {
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs'), $env:LOCALAPPDATA) |
    Where-Object { $_ -and (Test-Path $_) }
  foreach ($root in $roots) {
    $dir = Join-Path $root 'Mag Command Center'
    if (Test-Path $dir) {
      $exe = Get-ChildItem -Path $dir -Filter '*.exe' -File |
        Where-Object { $_.Name -notmatch 'unins' } | Select-Object -First 1
      if ($exe) { return $exe.FullName }
    }
  }
  throw 'Mag Command Center executable not found after install'
}

function Stop-App($Process) {
  if (-not $Process) { return }
  Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  Wait-Process -Id $Process.Id -Timeout 20 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

if (Test-Path $dataDir) { Remove-Item -Recurse -Force $dataDir }

Write-Host '== previous release creates its state'
Install-Msi $OldMsi 'previous'
$app = Start-Process -FilePath (Find-App) -PassThru
& python $stateDb wait-created $db --timeout 120
if ($LASTEXITCODE -ne 0) {
  Write-Host '::warning::The previous release did not create its database; seeding the rc.5 schema directly'
}
Stop-App $app
Invoke-StateDb @('seed', $db)
$before = & python -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('PRAGMA user_version').fetchone()[0])" $db

Write-Host '== install the new build over it'
Install-Msi $NewMsi 'new'

Write-Host '== new build opens and migrates the state'
$app = Start-Process -FilePath (Find-App) -PassThru
try {
  Invoke-StateDb @('wait-opened', $db, '--version', $NewVersion, '--timeout', '120')
} finally {
  Stop-App $app
}
$verify = @('verify', $db, '--version', $NewVersion)
if ([int]$before -lt 4) { $verify += '--expect-backup' }
Invoke-StateDb $verify
Write-Host 'Windows packaged upgrade test passed.'
