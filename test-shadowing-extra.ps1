# PowerShell 5.1; read-only production regression checks.
param([string]$BaseUrl='https://shadowing-player-pro.vercel.app',[string]$Token=$env:ADMIN_API_TOKEN)
$ErrorActionPreference='Stop'
if ([string]::IsNullOrWhiteSpace($Token)) { $Token=Read-Host 'Enter ADMIN_API_TOKEN' }
if ([string]::IsNullOrWhiteSpace($Token)) { throw 'Admin token required' }
$headers=@{Authorization="Bearer $Token"}
$script:passed=0; $script:failed=0
function Check([bool]$ok,[string]$name) { if($ok){$script:passed++;Write-Host "PASS $name" -ForegroundColor Green}else{$script:failed++;Write-Host "FAIL $name" -ForegroundColor Red} }
function ReadApi([string]$path,[bool]$admin=$false){$uri=$BaseUrl.TrimEnd('/')+$path;if($admin){return Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 30};return Invoke-RestMethod -Uri $uri -TimeoutSec 30}
try {
  $catalog=ReadApi '/api/contents'
  Check ($null -ne $catalog.contents -and @($catalog.contents).Count -ge 3) 'Published catalog accessible'
  $ids=@('tsSHK7o5FbE','7MFVtRS1fRw','TSIgstxOCwY')
  foreach($id in $ids){Check (@($catalog.contents | Where-Object {$_.id -eq $id}).Count -eq 1) "Catalog contains $id"}
  $history=ReadApi '/api/admin-daily?date=2026-11-16&scheduleId=1' $true
  Check ($history.selection.finalized -eq $true -and $history.selection.source -eq 'history' -and $history.selection.content_id -eq 'tsSHK7o5FbE') 'Historical selection remains finalized'
  Check ($null -ne $history.selection.guide_version -and [int]$history.selection.guide_version -eq 1) 'Historical guide version pinned to v1'
  $guideApi=ReadApi '/api/admin-study-guides?id=tsSHK7o5FbE' $true
  $guideJson=ConvertTo-Json $guideApi -Depth 15 -Compress
  Check ($guideApi.ok -eq $true) 'Admin Study Guide endpoint works'
  Check ($guideJson -match '"version":1') 'Study Guide v1 visible in version listing'
  $day=ReadApi '/api/admin-daily?date=2026-11-24&scheduleId=1' $true
  Check ($day.selection.source -eq 'weekly' -and $day.selection.content_id -eq '7MFVtRS1fRw' -and !$day.selection.finalized) 'Manual override cleared, weekly selection restored'
  $schedule=ReadApi '/api/admin-schedules?preview=1&start=2026-11-16&days=30' $true
  $cases=@(@('2026-11-23','7MFVtRS1fRw'),@('2026-11-30','TSIgstxOCwY'),@('2026-12-07','tsSHK7o5FbE'))
  foreach($c in $cases){$r=@($schedule.preview | Where-Object {$_.date -eq $c[0]})|Select-Object -First 1;Check ($null -ne $r -and $r.content_id -eq $c[1]) "Rotation $($c[0])"}
  foreach($id in $ids){
    foreach($type in @('audio','ko','en')){
      $signed=ReadApi "/api/content-url?id=$id&type=$type"
      Check ($signed.id -eq $id -and $signed.type -eq $type -and $signed.url -match '^https://') "R2 signed URL $id/$type"
    }
  }
  $page=Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/')+'/') -UseBasicParsing -TimeoutSec 30
  Check ($page.StatusCode -eq 200 -and $page.Content -match 'id="mainAudio"' -and $page.Content -match 'id="btnPlayPause"') 'Player HTML and playback controls available'
  Check ($page.Content -match 'id="btnLangKo"' -and $page.Content -match 'id="btnLangEn"' -and $page.Content -match 'id="toggleGuideBtn"') 'Subtitle and guide controls available'
} catch { $script:failed++;Write-Host "ERROR $($_.Exception.Message)" -ForegroundColor Red }
Write-Host "`nRESULT: $script:passed passed, $script:failed failed"
if($script:failed){exit 1}else{exit 0}

