#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
$taskNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $taskNode) { throw 'Node.js 22.12+ is required.' }
& $taskNode 'node_modules/typescript/bin/tsc' --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $taskNode 'node_modules/vite/bin/vite.js' build
exit $LASTEXITCODE
