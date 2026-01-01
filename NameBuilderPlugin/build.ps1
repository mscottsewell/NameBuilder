<#
Builds the NameBuilder solution and copies the plugin DLL into the configurator assets folder.
#>
param(
    [ValidateNotNullOrEmpty()]
    [string]$Configuration = "Release",

    [ValidateNotNullOrEmpty()]
    [string]$Framework = "net462",

    [ValidateNotNullOrEmpty()]
    [string]$Solution = ".\NameBuilder.sln",

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
