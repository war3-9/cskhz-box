#Requires -Version 7.0
param([ValidateRange(1024,65535)][int]$Port = 1420)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath (Split-Path $PSScriptRoot)
$taskNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $taskNode) { throw 'Install Node.js 22.12+ before running this script.' }
if (-not (Test-Path 'node_modules/vite/bin/vite.js')) { throw 'Run npm ci first.' }
& $taskNode 'node_modules/vite/bin/vite.js' --host 127.0.0.1 --port $Port --strictPort
