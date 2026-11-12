#Requires -Version 7.0
param([string]$PythonExecutable = 'python')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskPreviousPython = $env:LAYERFORGE_PYTHON
try {
    $env:LAYERFORGE_PYTHON = $PythonExecutable
    & $taskNode 'scripts/builtin-pack.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $taskNode 'scripts/generate-icon.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $PythonExecutable 'scripts/package-terrain-normalizer.py'
    exit $LASTEXITCODE
} finally { $env:LAYERFORGE_PYTHON = $taskPreviousPython }
