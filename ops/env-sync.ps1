param([switch]$Apply)
$ErrorActionPreference = 'Stop'
if ($Apply) { throw 'Automatic Production secret overwrites are intentionally disabled in SF0. Use reviewed individual vercel env add commands.' }
Write-Host 'SF0 SAFE MODE: No remote or local settings will be changed.'
Write-Host '1. Run: .\ops\env-check.ps1 -CheckVercel'
Write-Host '2. Compare names only; never paste secrets into chat or commit them.'
Write-Host '3. Add a missing variable manually: vercel env add VARIABLE_NAME production'
Write-Host '4. Redeploy only after review and smoke-check Production.'
