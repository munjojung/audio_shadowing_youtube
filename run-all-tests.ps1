# Shadowing Player Pro - unified read-only regression runner
# Windows PowerShell 5.1 compatible. Run from the project directory.
param(
    [string]$ProjectPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
# Match Node TAP summaries even when Unicode information symbols are garbled by Windows PowerShell 5.1.

$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$logDir = Join-Path $ProjectPath 'test-results'
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDir ("regression-$stamp.log")
$summaryPath = Join-Path $logDir ("regression-$stamp-summary.json")

$tests = @(
    @{ Name = 'Node.js unit'; Command = 'node'; Args = @('--test', 'tests/*.test.js'); Kind = 'node' },
    @{ Name = 'Daily schedule'; Command = 'powershell.exe'; Args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.\test-shadowing-daily.ps1'); Kind = 'ps' },
    @{ Name = 'API and R2'; Command = 'powershell.exe'; Args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.\test-shadowing-extra.ps1'); Kind = 'ps' },
    @{ Name = 'Browser E2E'; Command = 'node'; Args = @('.\test-browser-e2e.cjs'); Kind = 'browser' }
)

$required = @('test-shadowing-daily.ps1', 'test-shadowing-extra.ps1', 'test-browser-e2e.cjs')
foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath $file))) {
        Write-Error "Missing test script: $file"
        exit 2
    }
}

Push-Location $ProjectPath
try {
    $results = @()
    $totalPass = 0
    $totalFail = 0
    $totalSkip = 0
    foreach ($test in $tests) {
        $name = $test.Name
        Write-Host "`n=== $name ===" -ForegroundColor Cyan
        Add-Content -LiteralPath $logPath -Value "`n=== $name ==="
        $lines = @(& $test.Command @($test.Args) 2>&1 | ForEach-Object { "$_" })
        $exitCode = $LASTEXITCODE
        $lines | ForEach-Object { Write-Host $_ }
        $lines | Add-Content -LiteralPath $logPath
        $joined = $lines -join "`n"
        $pass = 0; $fail = 0; $skip = 0
        if ($test.Kind -eq 'node') {
            if ($joined -match '(?m)^[^A-Za-z0-9\r\n]*pass\s+(\d+)\s*$') { $pass = [int]$Matches[1] }
            if ($joined -match '(?m)^[^A-Za-z0-9\r\n]*fail\s+(\d+)\s*$') { $fail = [int]$Matches[1] }
            if ($joined -match '(?m)^[^A-Za-z0-9\r\n]*skipped\s+(\d+)\s*$') { $skip = [int]$Matches[1] }
        } else {
            if ($joined -match 'RESULT:\s*(\d+)\s+passed,\s*(\d+)\s+failed(?:,\s*(\d+)\s+skipped)?') {
                $pass = [int]$Matches[1]
                $fail = [int]$Matches[2]
                if ($Matches[3]) { $skip = [int]$Matches[3] }
            }
        }
        $hasSummary = ($joined -match 'RESULT:\s*\d+\s+passed,\s*\d+\s+failed') -or (($test.Kind -eq 'node') -and ($joined -match '(?m)^[^A-Za-z0-9\r\n]*tests\s+\d+'))
        if (($exitCode -ne 0) -or (-not $hasSummary)) {
            if ($fail -eq 0) { $fail = 1 }
            Write-Host "FAIL: $name (exit=$exitCode, summaryFound=$hasSummary)" -ForegroundColor Red
        } else {
            Write-Host "SUMMARY: $pass passed, $fail failed, $skip skipped" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
        }
        $results += [pscustomobject]@{ name = $name; passed = $pass; failed = $fail; skipped = $skip; exitCode = $exitCode; summaryFound = [bool]$hasSummary }
        $totalPass += $pass; $totalFail += $fail; $totalSkip += $skip
    }
    $report = [pscustomobject]@{ timestamp = (Get-Date).ToString('o'); projectPath = $ProjectPath; passed = $totalPass; failed = $totalFail; skipped = $totalSkip; suites = $results }
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
    $footer = "RESULT: $totalPass passed, $totalFail failed, $totalSkip skipped"
    Write-Host "`n$footer" -ForegroundColor $(if ($totalFail -eq 0) { 'Green' } else { 'Red' })
    Write-Host "Log: $logPath"
    Write-Host "JSON: $summaryPath"
    Add-Content -LiteralPath $logPath -Value "`n$footer"
    if ($totalFail -gt 0) { exit 1 }
    exit 0
} finally {
    Pop-Location
}
