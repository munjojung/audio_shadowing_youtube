param(
 [string]$Root = 'C:\python_workspace\lessonsYouTube',
 [string]$Registry = 'C:\python_workspace\audio_shadowing_youtube\youtube-content-registry.csv',
 [string]$UrlList = 'C:\python_workspace\audio_shadowing_youtube\listofYouTubes.txt'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Root -PathType Container)) { throw "Folder not found: $Root" }
$rows = @{}
if (Test-Path -LiteralPath $Registry) {
 foreach ($r in @(Import-Csv -LiteralPath $Registry)) { if ($r.youtube_id) { $rows[$r.youtube_id] = $r } }
}
function Ensure-Row([string]$id, [string]$url) {
 if (-not $rows.ContainsKey($id)) {
  $rows[$id] = [pscustomobject]@{
   youtube_id=$id;youtube_url=$url;registration_status='pending';mp3_exists='';en_vtt_exists='';ko_vtt_exists='';mp3_path='';en_vtt_path='';ko_vtt_path='';registered_at='';last_checked_at='';error=''
  }
 }
 if ($url -and -not $rows[$id].youtube_url) { $rows[$id].youtube_url = $url }
}
if (Test-Path -LiteralPath $UrlList) {
 foreach ($line in @(Get-Content -LiteralPath $UrlList -Encoding UTF8)) {
  if ($line -match '[?&]v=([A-Za-z0-9_-]{11})') { $id=$Matches[1]; Ensure-Row $id "https://www.youtube.com/watch?v=$id" }
 }
}
$files = @(Get-ChildItem -LiteralPath $Root -Recurse -File)
$mp3s = @($files | Where-Object { $_.Extension -ieq '.mp3' })
$now = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
foreach ($mp3 in $mp3s) {
 if ($mp3.BaseName -notmatch '(?:^|_)([A-Za-z0-9_-]{11})$') { continue }
 $id = $Matches[1]
 Ensure-Row $id "https://www.youtube.com/watch?v=$id"
 $row = $rows[$id]
 $stem = $mp3.BaseName
 $en = Join-Path $mp3.DirectoryName "${stem}_en.vtt"
 $ko = Join-Path $mp3.DirectoryName "${stem}_ko.vtt"
 $row.mp3_exists = 'True'
 $row.en_vtt_exists = [string](Test-Path -LiteralPath $en -PathType Leaf)
 $row.ko_vtt_exists = [string](Test-Path -LiteralPath $ko -PathType Leaf)
 $row.mp3_path = $mp3.FullName
 $row.en_vtt_path = if ($row.en_vtt_exists -eq 'True') {$en} else {''}
 $row.ko_vtt_path = if ($row.ko_vtt_exists -eq 'True') {$ko} else {''}
 $row.last_checked_at = $now
}
# Missing MP3s are marked missing; registration_status is never automatically promoted to registered.
foreach ($row in $rows.Values) {
 if ($row.last_checked_at -ne $now) {
  $row.mp3_exists='False';$row.en_vtt_exists='False';$row.ko_vtt_exists='False'
  $row.mp3_path='';$row.en_vtt_path='';$row.ko_vtt_path='';$row.last_checked_at=$now
 }
}
$parent=Split-Path -Parent $Registry
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
$ordered=@($rows.Values | Sort-Object youtube_id)
$ordered | Export-Csv -LiteralPath $Registry -NoTypeInformation -Encoding UTF8
$ordered | Group-Object registration_status | Select-Object Name,Count | Format-Table -AutoSize
Write-Host "Updated registry: $Registry"
Write-Host 'This script does NOT upload files or register content in Neon.'
