param(
  [ValidateSet('Status', 'Start', 'Stop')][string]$Action = 'Status',
  [string]$BundlePath = $env:ZETARIS_BUNDLE_PATH
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($BundlePath)) { throw 'Supply -BundlePath with the extracted official Zetaris folder, or set ZETARIS_BUNDLE_PATH.' }
$bundleRoot = (Resolve-Path -LiteralPath $BundlePath).Path
$composeFile = Join-Path $bundleRoot 'docker-compose.yml'
$bundleEnv = Join-Path $bundleRoot '.env'
if (!(Test-Path -LiteralPath $composeFile) -or !(Test-Path -LiteralPath $bundleEnv)) { throw 'The extracted bundle needs docker-compose.yml and its own .env.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateRoot = Join-Path $projectRoot '.local'
$overridePath = Join-Path $privateRoot 'zetaris-compose.override.yml'
if (!(Test-Path -LiteralPath $overridePath)) {
  $null = New-Item -ItemType Directory -Path $privateRoot -Force
  [IO.File]::WriteAllText($overridePath, "services:`n  ui:`n    ports: !override`n      - `"127.0.0.1:3000:3000`"`n", [Text.UTF8Encoding]::new($false))
}
$composeArgs = @('compose', '--project-name', 'zetaris', '--env-file', $bundleEnv, '-f', $composeFile, '-f', $overridePath)
switch ($Action) {
  'Status' { & docker @composeArgs ps --all --format '{{.Service}}: {{.State}} {{.Health}}' }
  'Start' {
    $configuration = & docker @composeArgs config --format json
    if ($LASTEXITCODE -ne 0) { throw 'Compose configuration could not be resolved.' }
    $configuration = $configuration | ConvertFrom-Json
    foreach ($service in $configuration.services.PSObject.Properties) {
      if ($service.Value.profiles) { continue }
      foreach ($port in $service.Value.ports) { if ($port.host_ip -ne '127.0.0.1') { throw 'Local setup refuses ports exposed beyond loopback.' } }
    }
    # Uses the existing images/account registry sign-in. No cloud provisioning, deletion or pruning.
    & docker @composeArgs up -d
  }
  'Stop' { & docker @composeArgs stop }
}
exit $LASTEXITCODE
