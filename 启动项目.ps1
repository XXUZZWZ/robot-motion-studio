$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} else {
    $nodeExecutable = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw '请安装 Node.js 22 或更新版本。' }
}
Push-Location -LiteralPath $projectDirectory
try { & $nodeExecutable 'scripts/dev.mjs' } finally { Pop-Location }
