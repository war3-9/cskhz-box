#Requires -Version 7.0
param([switch]$NoBundle)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
$taskNode = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath 'node_modules/@tauri-apps/cli/tauri.js')) { throw 'Run npm ci first.' }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Install Rust with the x86_64-pc-windows-msvc toolchain.' }
$taskArguments = @('node_modules/@tauri-apps/cli/tauri.js', 'build')
if ($NoBundle) { $taskArguments += '--no-bundle' }
& $taskNode @taskArguments
exit $LASTEXITCODE
