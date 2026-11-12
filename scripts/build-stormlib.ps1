#Requires -Version 7.0
param([string]$Generator = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot
$taskCmake = (Get-Command cmake -ErrorAction Stop).Source
$taskSource = Join-Path $taskRoot 'third_party/StormLib'
$taskBuild = Join-Path $taskRoot '.build/stormlib'
$taskArguments = @('-S', $taskSource, '-B', $taskBuild, '-A', 'x64',
    '-DBUILD_SHARED_LIBS=OFF', '-DSTORM_UNICODE=ON',
    '-DSTORM_USE_BUNDLED_LIBRARIES=ON', '-DSTORM_SKIP_INSTALL=ON')
if ($Generator) { $taskArguments += @('-G', $Generator) }
& $taskCmake @taskArguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $taskCmake --build $taskBuild --config Release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$taskLibrary = Join-Path $taskBuild 'Release/StormLib.lib'
if (-not (Test-Path -LiteralPath $taskLibrary)) { throw 'CMake did not produce the expected x64 Release/StormLib.lib.' }
$taskVendor = Join-Path $taskRoot 'src-tauri/vendor/stormlib'
New-Item -ItemType Directory -Path $taskVendor -Force | Out-Null
Copy-Item -LiteralPath $taskLibrary -Destination (Join-Path $taskVendor 'StormLib.lib') -Force
Copy-Item -LiteralPath (Join-Path $taskSource 'LICENSE') -Destination (Join-Path $taskVendor 'LICENSE') -Force
Get-FileHash -LiteralPath (Join-Path $taskVendor 'StormLib.lib') -Algorithm SHA256
