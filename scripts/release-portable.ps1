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

npm run build:portable

$artifact = Join-Path $projectRoot "dist-portable\Plumbuddy-$($package.version)-portable-x64.exe"
if (!(Test-Path -LiteralPath $artifact)) {
  throw "Portable artifact was not found: $artifact"
}

gh release create $Tag $artifact --title "Plumbuddy $Tag" --notes "Portable Plumbuddy release $Tag"
