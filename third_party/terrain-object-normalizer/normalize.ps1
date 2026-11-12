#Requires -Version 7.0
param([string]$InputDirectory, [string]$OutputMap)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'script')
& (Join-Path $PSScriptRoot 'bin/w3x2lni-lua.exe') 'box-objects.lua' $InputDirectory $OutputMap
exit $LASTEXITCODE
