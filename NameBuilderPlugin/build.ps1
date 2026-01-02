<#
.SYNOPSIS
Builds the plug-in and updates the configurator's embedded plug-in payload.

.DESCRIPTION
Builds the NameBuilder plug-in project/solution and copies the resulting NameBuilder.dll into the
configurator Assets folder (used when packaging the configurator and when deploying to XrmToolBox).

This script is intentionally small and project-scoped; the repo-root build.ps1 handles monorepo
build/pack/deploy orchestration.

.PARAMETER Configuration
Build configuration to use.

.PARAMETER Framework
Target framework moniker used to locate the output DLL.

.PARAMETER Solution
Project or solution to build (e.g., a .csproj or .sln path).

.PARAMETER TargetFolder
Primary absolute path to the configurator Assets/DataversePlugin folder.

.PARAMETER RelativeFallback
Fallback relative path (from this script root) used if TargetFolder is unavailable.

.EXAMPLE
pwsh -File .\NameBuilderPlugin\build.ps1 -Configuration Release
#>
param(
    [ValidateNotNullOrEmpty()]
    [string]$Configuration = "Release",

    [ValidateNotNullOrEmpty()]
    [string]$Framework = "net462",

    [ValidateNotNullOrEmpty()]
    [string]$Solution = ".\NameBuilder.csproj",

    [ValidateNotNullOrEmpty()]
    [string]$TargetFolder = "C:\GitHub\NameBuilder\NameBuilderConfigurator\Assets\DataversePlugin",

    [ValidateNotNullOrEmpty()]
    [string]$RelativeFallback = ".\NameBuilderConfigurator\Assets\DataversePlugin"
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptRoot

try {
    Write-Host "Building $Solution ($Configuration)..."
    dotnet build $Solution -c $Configuration
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet build failed with exit code $LASTEXITCODE"
    }

    $dllPath = Join-Path -Path $scriptRoot -ChildPath "bin\$Configuration\$Framework\NameBuilder.dll"
    if (-not (Test-Path $dllPath)) {
        throw "Expected DLL not found at $dllPath"
    }

    $fullTarget = $null

    try {
        if (-not (Test-Path -Path $TargetFolder)) {
            New-Item -ItemType Directory -Path $TargetFolder -Force | Out-Null
        }
        $fullTarget = (Resolve-Path -Path $TargetFolder).Path
    } catch {
        Write-Warning "Primary target '$TargetFolder' unavailable. Using fallback."
    }

    if (-not $fullTarget) {
        $fallbackPath = Join-Path -Path $scriptRoot -ChildPath $RelativeFallback
        if (-not (Test-Path $fallbackPath)) {
            New-Item -ItemType Directory -Path $fallbackPath -Force | Out-Null
        }
        $fullTarget = $fallbackPath
    }

    $destinationPath = Join-Path -Path $fullTarget -ChildPath "NameBuilder.dll"
    Copy-Item -Path $dllPath -Destination $destinationPath -Force
    Write-Host "Copied NameBuilder.dll to $destinationPath"
}
finally {
    Pop-Location
}
