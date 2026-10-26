<#
.SYNOPSIS
    Deletes all __pycache__ directories and .pyc/.pyo files in the backend.

.PARAMETER IncludeVenv
    If specified, also cleans inside .venv and other virtual environments.

.PARAMETER DryRun
    If specified, only shows what would be deleted.

.EXAMPLE
    .\clean_pycache.ps1
    .\clean_pycache.ps1 -IncludeVenv
    .\clean_pycache.ps1 -DryRun
#>

[CmdletBinding()]
param (
    [switch]$IncludeVenv,
    [switch]$DryRun
)

$TargetDir = $PSScriptRoot

Write-Host "Target directory: $TargetDir" -ForegroundColor Cyan
Write-Host "Include virtual environment: $IncludeVenv" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "[DRY RUN MODE]" -ForegroundColor Yellow
}
Write-Host ("-" * 60)

# Find __pycache__ directories
$pycacheDirs = Get-ChildItem -Path $TargetDir -Recurse -Directory -Filter "__pycache__" -Force -ErrorAction SilentlyContinue

if (-not $IncludeVenv) {
    $pycacheDirs = $pycacheDirs | Where-Object { $_.FullName -notmatch '\\\.venv(\\|$)' -and $_.FullName -notmatch '\\venv(\\|$)' }
}

$dirCount = 0
foreach ($dir in $pycacheDirs) {
    if ($DryRun) {
        Write-Host "[DRY-RUN] Would delete directory: $($dir.FullName)" -ForegroundColor Yellow
    } else {
        try {
            Remove-Item -Path $dir.FullName -Recurse -Force -ErrorAction Stop
            Write-Host "Deleted directory: $($dir.FullName)" -ForegroundColor Green
            $dirCount++
        } catch {
            Write-Warning "Failed to delete $($dir.FullName): $_"
        }
    }
}

# Find stray .pyc and .pyo files outside __pycache__
$bytecodeFiles = Get-ChildItem -Path $TargetDir -Recurse -File -Include "*.pyc", "*.pyo" -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -notmatch '__pycache__' }

if (-not $IncludeVenv) {
    $bytecodeFiles = $bytecodeFiles | Where-Object { $_.FullName -notmatch '\\\.venv(\\|$)' -and $_.FullName -notmatch '\\venv(\\|$)' }
}

$fileCount = 0
foreach ($file in $bytecodeFiles) {
    if ($DryRun) {
        Write-Host "[DRY-RUN] Would delete file: $($file.FullName)" -ForegroundColor Yellow
    } else {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction Stop
            Write-Host "Deleted file: $($file.FullName)" -ForegroundColor Green
            $fileCount++
        } catch {
            Write-Warning "Failed to delete $($file.FullName): $_"
        }
    }
}

Write-Host ("-" * 60)
if ($DryRun) {
    Write-Host "Would delete: $($pycacheDirs.Count) '__pycache__' directories, $($bytecodeFiles.Count) bytecode files." -ForegroundColor Yellow
} else {
    Write-Host "Finished! Deleted $dirCount '__pycache__' directories and $fileCount bytecode files." -ForegroundColor Green
}
