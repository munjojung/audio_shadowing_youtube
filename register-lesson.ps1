$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot ".env.production.local"

if (-not (Test-Path $envFile)) {
    throw "Missing .env.production.local"
}

$mapping = @{
    "R2_ACCOUNT_ID"        = "R2_ACCOUNT_ID"
    "R2_ACCESS_KEY_ID"     = "R2_UPLOAD_ACCESS_KEY_ID"
    "R2_SECRET_ACCESS_KEY" = "R2_UPLOAD_SECRET_ACCESS_KEY"
    "R2_BUCKET_NAME"       = "R2_BUCKET_NAME"
    "ADMIN_API_TOKEN"      = "ADMIN_API_TOKEN"
}

foreach ($name in $mapping.Values) {
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim()

        if ($mapping.ContainsKey($name)) {
            if (
                ($value.Length -ge 2) -and
                (
                    ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                    ($value.StartsWith("'") -and $value.EndsWith("'"))
                )
            ) {
                $value = $value.Substring(1, $value.Length - 2)
            }

            [Environment]::SetEnvironmentVariable(
                $mapping[$name], $value, "Process"
            )
        }
    }
}

$required = @(
    "R2_ACCOUNT_ID",
    "R2_UPLOAD_ACCESS_KEY_ID",
    "R2_UPLOAD_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "ADMIN_API_TOKEN"
)

foreach ($name in $required) {
    if ([string]::IsNullOrWhiteSpace(
        [Environment]::GetEnvironmentVariable($name)
    )) {
        throw "Missing environment variable: $name"
    }
}

if ($env:R2_ACCOUNT_ID -notmatch '^[a-fA-F0-9]{32}$') {
    throw "Invalid R2_ACCOUNT_ID format"
}

Write-Host "Starting lesson registration..." -ForegroundColor Cyan

node .\scripts\bulk-register-content.js --execute

if ($LASTEXITCODE -ne 0) {
    throw "Registration failed with exit code $LASTEXITCODE"
}

Write-Host "Lesson registration completed." -ForegroundColor Green
