# Read-only production checks for Shadowing Player Pro. PowerShell 5.1 compatible.
param([string]$BaseUrl = 'https://shadowing-player-pro.vercel.app', [string]$Token = $env:ADMIN_API_TOKEN)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Token)) { $Token = Read-Host 'Enter ADMIN_API_TOKEN (input visible)' }
if ([string]::IsNullOrWhiteSpace($Token)) { throw 'ADMIN_API_TOKEN is required' }
$headers = @{ Authorization = "Bearer $Token" }
$script:passed = 0; $script:failed = 0
function Check([bool]$ok, [string]$label, [string]$detail = '') {
    if ($ok) { $script:passed++; Write-Host "PASS $label" -ForegroundColor Green }
    else { $script:failed++; Write-Host "FAIL $label $detail" -ForegroundColor Red }
}
function GetAdmin([string]$path) { Invoke-RestMethod -Method Get -Uri ($BaseUrl.TrimEnd('/') + $path) -Headers $headers -TimeoutSec 25 }
try {
    $p = GetAdmin '/api/admin-schedules?preview=1&start=2026-11-16&days=30'
    Check ($p.ok -eq $true -and @($p.preview).Count -eq 30) '30-day schedule preview'
    $expected = @(
        @('2026-11-16','tsSHK7o5FbE','history'),
        @('2026-11-17','tsSHK7o5FbE','weekly'),
        @('2026-11-23','7MFVtRS1fRw','weekly'),
        @('2026-11-24','7MFVtRS1fRw','weekly'),
        @('2026-11-30','TSIgstxOCwY','weekly'),
        @('2026-12-07','tsSHK7o5FbE','weekly'),
        @('2026-12-14','7MFVtRS1fRw','weekly')
    )
    foreach ($e in $expected) {
        $row = @($p.preview | Where-Object { $_.date -eq $e[0] }) | Select-Object -First 1
        Check ($null -ne $row -and $row.content_id -eq $e[1] -and $row.source -eq $e[2]) "Preview $($e[0])" "expected $($e[1]) / $($e[2])"
    }
    $d16 = GetAdmin '/api/admin-daily?date=2026-11-16&scheduleId=1'
    Check ($d16.selection.finalized -eq $true -and $d16.selection.source -eq 'history' -and $d16.selection.content_id -eq 'tsSHK7o5FbE') 'Finalized history preserved (Nov 16)'
    Check ([int]$d16.selection.guide_version -eq 1) 'Historical Study Guide version = 1'
    $d24 = GetAdmin '/api/admin-daily?date=2026-11-24&scheduleId=1'
    Check ($d24.selection.finalized -eq $false -and $d24.selection.source -eq 'weekly' -and $d24.selection.content_id -eq '7MFVtRS1fRw') 'Manual override cleared (Nov 24)'
    $d23 = GetAdmin '/api/admin-daily?date=2026-11-23&scheduleId=1'
    Check ($d23.selection.source -eq 'weekly' -and $d23.selection.content_id -eq '7MFVtRS1fRw') 'Daily API weekly selection (Nov 23)'
} catch {
    $script:failed++
    Write-Host "ERROR API request: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host "`nRESULT: $script:passed passed, $script:failed failed"
if ($script:failed -gt 0) { exit 1 }
exit 0
