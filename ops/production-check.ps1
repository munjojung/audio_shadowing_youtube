param([string]$BaseUrl='https://shadowing-player-pro.vercel.app')
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
if ($BaseUrl -notmatch '^https://') { throw 'Only HTTPS base URLs are accepted.' }
$paths = @('/', '/review.html', '/review-calendar.html', '/admin.html', '/api/contents')
$failed = $false
foreach ($path in $paths) {
  try {
    $r = Invoke-WebRequest -Uri ($BaseUrl+$path) -Method Get -TimeoutSec 20 -UseBasicParsing
    Write-Host ('[HTTP ' + [int]$r.StatusCode + '] ' + $path)
    if ([int]$r.StatusCode -ne 200) { $failed = $true }
  } catch {
    Write-Host ('[FAIL] ' + $path + ' (' + $_.Exception.GetType().Name + ')')
    $failed = $true
  }
}
if ($failed) { Write-Warning 'Smoke check failed. No changes were made.'; exit 1 }
Write-Host 'Basic HTTP smoke checks passed. Authentication, playback, and DB operations were NOT tested.'
