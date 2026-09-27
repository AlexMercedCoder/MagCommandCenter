<#
.SYNOPSIS
  Enable Windows code signing for the Tauri build when secrets exist.

.DESCRIPTION
  Two options, checked in this order (see docs/RELEASE_BUILDS.md "Signing secrets"):

  1. A code-signing certificate (OV or EV exported as .pfx):
     WINDOWS_CERTIFICATE (base64 .pfx), WINDOWS_CERTIFICATE_PASSWORD.
  2. Azure Trusted Signing:
     AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID,
     AZURE_TRUSTED_SIGNING_ENDPOINT, AZURE_TRUSTED_SIGNING_ACCOUNT,
     AZURE_TRUSTED_SIGNING_PROFILE.

  With neither, nothing changes and the MSI and NSIS installers stay unsigned. When one is
  present, this writes a Tauri config overlay and exports MCC_TAURI_ARGS="--config <file>"
  for the build step. Always exports MCC_SIGNING_STATUS.
#>
$ErrorActionPreference = 'Stop'
$envFile = if ($env:GITHUB_ENV) { $env:GITHUB_ENV } else { 'NUL' }
$summary = if ($env:GITHUB_STEP_SUMMARY) { $env:GITHUB_STEP_SUMMARY } else { 'NUL' }
$temp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$overlay = Join-Path $temp 'mcc-windows-signing.json'

function Set-BuildEnv([string]$Name, [string]$Value) {
  Add-Content -Path $envFile -Value "$Name=$Value"
}

$status = 'unsigned'
$windows = $null
if ($env:WINDOWS_CERTIFICATE -and $env:WINDOWS_CERTIFICATE_PASSWORD) {
  $pfx = Join-Path $temp 'mcc-signing.pfx'
  [System.IO.File]::WriteAllBytes($pfx, [System.Convert]::FromBase64String($env:WINDOWS_CERTIFICATE))
  $password = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force
  $certificate = Import-PfxCertificate -FilePath $pfx -CertStoreLocation Cert:\CurrentUser\My -Password $password
  Remove-Item $pfx -Force
  $windows = @{
    certificateThumbprint = $certificate.Thumbprint
    digestAlgorithm       = 'sha256'
    timestampUrl          = 'http://timestamp.digicert.com'
  }
  $status = 'signed (certificate)'
} elseif ($env:AZURE_CLIENT_ID -and $env:AZURE_CLIENT_SECRET -and $env:AZURE_TENANT_ID -and
          $env:AZURE_TRUSTED_SIGNING_ENDPOINT -and $env:AZURE_TRUSTED_SIGNING_ACCOUNT -and
          $env:AZURE_TRUSTED_SIGNING_PROFILE) {
  cargo install trusted-signing-cli --locked
  if ($LASTEXITCODE -ne 0) { throw 'could not install trusted-signing-cli' }
  foreach ($name in 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID') {
    Set-BuildEnv $name ([Environment]::GetEnvironmentVariable($name))
  }
  $windows = @{
    signCommand = "trusted-signing-cli -e $($env:AZURE_TRUSTED_SIGNING_ENDPOINT) -a $($env:AZURE_TRUSTED_SIGNING_ACCOUNT) -c $($env:AZURE_TRUSTED_SIGNING_PROFILE) -d `"Mag Command Center`" %1"
  }
  $status = 'signed (Azure Trusted Signing)'
} else {
  Write-Host '::notice::Windows signing secrets are not set; building unsigned installers.'
}

if ($windows) {
  @{ bundle = @{ windows = $windows } } | ConvertTo-Json -Depth 5 | Set-Content -Path $overlay -Encoding utf8
  Set-BuildEnv 'MCC_TAURI_ARGS' "--config $($overlay -replace '\\', '/')"
}
Set-BuildEnv 'MCC_SIGNING_STATUS' $status
Add-Content -Path $summary -Value "- windows: $status"
Write-Host "Windows build will be $status."
