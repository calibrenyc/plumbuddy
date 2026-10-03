param(
  [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Tag)) {
  $Tag = "v$($package.version)"
}

npm run build:release

$portableArtifact = Join-Path $projectRoot "dist-portable\Balance-$($package.version)-portable-x64.exe"
$installerArtifact = Join-Path $projectRoot "dist-portable\Balance-$($package.version)-setup-x64.exe"
foreach ($artifact in @($portableArtifact, $installerArtifact)) {
  if (!(Test-Path -LiteralPath $artifact)) {
    throw "Release artifact was not found: $artifact"
  }
}

gh release create $Tag $portableArtifact $installerArtifact --title "Balance $Tag" --notes "Windows portable and setup release $Tag"
