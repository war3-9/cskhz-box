#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
$taskNode = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath 'node_modules/@tauri-apps/cli/tauri.js')) { throw 'Run npm ci first.' }
& $taskNode 'node_modules/@tauri-apps/cli/tauri.js' dev
exit $LASTEXITCODE
