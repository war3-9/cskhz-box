#Requires -Version 7.0
param([string]$LuaMake = 'luamake', [string]$PythonExecutable = 'python')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot
$taskSource = Join-Path $taskRoot 'third_party/w3x2lni-source'
$taskRuntime = Join-Path $taskRoot 'third_party/terrain-object-normalizer'
$taskCompiler = (Get-Command $LuaMake -ErrorAction Stop).Source
Push-Location -LiteralPath $taskSource
try {
    & $taskCompiler
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
$taskNames = @('w3x2lni-lua.exe', 'bee.dll', 'lua54.dll', 'yue-ext.dll', 'lml.dll',
    'lni.dll', 'w3xparser.dll', 'lpeglabel.dll', 'stormlib.dll', 'casclib.dll', 'ffi.dll')
foreach ($taskName in $taskNames) {
    $taskFile = Join-Path $taskSource ('bin/' + $taskName)
    if (-not (Test-Path -LiteralPath $taskFile)) { throw "Missing compiled W3x2Lni component: $taskName" }
}
foreach ($taskName in $taskNames) {
    Copy-Item -LiteralPath (Join-Path $taskSource ('bin/' + $taskName)) -Destination (Join-Path $taskRuntime ('bin/' + $taskName)) -Force
}
& $PythonExecutable (Join-Path $PSScriptRoot 'package-terrain-normalizer.py')
exit $LASTEXITCODE
