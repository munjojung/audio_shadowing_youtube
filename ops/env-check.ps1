param(
    [switch]$IncludeLiveKit,
    [switch]$CheckVercel
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$schema = Get-Content (Join-Path $PSScriptRoot 'env.schema.json') -Raw |
    ConvertFrom-Json

$localPath = Join-Path $repo '.env.production.local'
$found = @{}

if (Test-Path $localPath) {
    foreach ($line in [System.IO.File]::ReadAllLines($localPath)) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=') {
            $key = $Matches[1]
            $value = ($trimmed -split '=', 2)[1].Trim()
            if ($value.Length -gt 0 -and
                $value -ne '""' -and $value -ne "''") {
                $found[$key] = $true
            }
        }
    }
}

$required = @($schema.requiredNow)
if ($IncludeLiveKit) {
    $required += @($schema.requiredWhenLiveKitEnabled)
}

Write-Host "`n=== LOCAL ENV CHECK ==="
Write-Host "Local file: $(if (Test-Path $localPath) {'present'} else {'missing'})"

$localMissing = @()

foreach ($key in $required) {
    $present = $found.ContainsKey($key) -or
        -not [string]::IsNullOrWhiteSpace(
            [Environment]::GetEnvironmentVariable($key)
        )

    if ($present) {
        Write-Host "[OK] $key"
    } else {
        Write-Host "[MISSING] $key"
        $localMissing += $key
    }
}

foreach ($key in @($schema.existingOptional)) {
    $present = $found.ContainsKey($key) -or
        -not [string]::IsNullOrWhiteSpace(
            [Environment]::GetEnvironmentVariable($key)
        )
    Write-Host "[$(if ($present) {'PRESENT'} else {'NOT LOCAL'})] $key (optional)"
}

$remoteFailed = $false

if ($CheckVercel) {
    Write-Host "`n=== VERCEL PRODUCTION CHECK ==="

    $cli = Get-Command vercel.cmd -ErrorAction SilentlyContinue

    if (-not $cli) {
        Write-Warning 'Vercel CLI not found.'
        $remoteFailed = $true
    } else {
        # Run CLI without PowerShell 5.1 stderr conversion errors.
        function Invoke-VercelReadOnly {
            param([string]$Arguments)

            $cmd = Get-Command vercel.cmd -ErrorAction Stop

            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $env:ComSpec
            $psi.Arguments = '/d /s /c "vercel.cmd ' + $Arguments + '"'
            $psi.WorkingDirectory = $repo
            $psi.UseShellExecute = $false
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.CreateNoWindow = $true

            $process = New-Object System.Diagnostics.Process
            $process.StartInfo = $psi

            try {
                [void]$process.Start()
                $stdoutTask = $process.StandardOutput.ReadToEndAsync()
                $stderrTask = $process.StandardError.ReadToEndAsync()
                $process.WaitForExit()

                return [pscustomobject]@{
                    ExitCode = $process.ExitCode
                    StdOut = $stdoutTask.Result
                    StdErr = $stderrTask.Result
                }
            } finally {
                $process.Dispose()
            }
        }

        $project = Invoke-VercelReadOnly `
            'project inspect shadowing-player-pro --scope dicdaejeon-8072'

        if ($project.ExitCode -ne 0) {
            Write-Warning 'Vercel project inspection failed.'
            $remoteFailed = $true
        } elseif (($project.StdOut + $project.StdErr) -notmatch
                  'shadowing-player-pro') {
            Write-Warning 'Unexpected Vercel project.'
            $remoteFailed = $true
        } else {
            Write-Host '[OK] Project: shadowing-player-pro'

            $envResult = Invoke-VercelReadOnly `
                'env ls --environment production --scope dicdaejeon-8072'

            if ($envResult.ExitCode -ne 0) {
                Write-Warning 'Vercel Production environment listing failed.'
                $remoteFailed = $true
            } else {
                $output = $envResult.StdOut + "`n" + $envResult.StdErr

                if ($output -notmatch
                    'dicdaejeon-8072/shadowing-player-pro') {
                    Write-Warning 'Unexpected Vercel environment target.'
                    $remoteFailed = $true
                } else {
                    $remoteNames = @{}

                    foreach ($line in ($output -split "`r?`n")) {
                        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s{2,}') {
                            $remoteNames[$Matches[1]] = $true
                        }
                    }

                    foreach ($key in $required) {
                        if ($remoteNames.ContainsKey($key)) {
                            Write-Host "[REMOTE OK] $key"
                        } else {
                            Write-Host "[REMOTE MISSING] $key"
                            $remoteFailed = $true
                        }
                    }
                }
            }
        }
    }
}
Write-Host "`n=== SUMMARY ==="
Write-Host "Local missing: $($localMissing.Count)"
Write-Host "Remote failed: $remoteFailed"

if ($remoteFailed) { exit 3 }
if ($localMissing.Count -gt 0) {
    Write-Warning 'Local entries missing. Production may still be configured.'
    exit 2
}

Write-Host 'Environment inventory checks passed.'
exit 0