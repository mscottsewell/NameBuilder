<#!
Build orchestrator for the NameBuilder monorepo.

Typical usage:
  pwsh -File .\build.ps1 -Configuration Release
  pwsh -File .\build.ps1 -PluginOnly
  pwsh -File .\build.ps1 -ConfiguratorOnly -Pack
#>
param(
    [ValidateSet('Debug','Release')]
    [string]$Configuration = 'Release',

    [switch]$PluginOnly,
    [switch]$ConfiguratorOnly,

    [switch]$Pack
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path -Path $PSScriptRoot).Path
$pluginDir = Join-Path $repoRoot 'NameBuilderPlugin'
$configDir = Join-Path $repoRoot 'NameBuilderConfigurator'

$pluginBuild = Join-Path $pluginDir 'build.ps1'
$configBuild = Join-Path $configDir 'build.ps1'
$configPack  = Join-Path $configDir 'pack-nuget.ps1'

if ($PluginOnly -and $ConfiguratorOnly) {
    throw 'Specify only one of -PluginOnly or -ConfiguratorOnly.'
}

$buildPlugin = -not $ConfiguratorOnly
$buildConfigurator = -not $PluginOnly

if ($buildPlugin) {
    if (-not (Test-Path $pluginBuild)) {
        throw "Plugin build script not found: $pluginBuild"
    }

    $pluginTarget = Join-Path $configDir 'Assets\DataversePlugin'

    Write-Host "Building plugin ($Configuration)..." -ForegroundColor Green
    pwsh -NoProfile -File $pluginBuild -Configuration $Configuration -TargetFolder $pluginTarget -RelativeFallback $pluginTarget
}

if ($buildConfigurator) {
    if (-not (Test-Path $configBuild)) {
        throw "Configurator build script not found: $configBuild"
    }

    Write-Host "Building configurator ($Configuration)..." -ForegroundColor Green
    pwsh -NoProfile -Command "Set-Location '$configDir'; & '.\\build.ps1' -Configuration '$Configuration'"
}

if ($Pack) {
    if (-not (Test-Path $configPack)) {
        throw "Configurator pack script not found: $configPack"
    }

    Write-Host "Packing configurator NuGet ($Configuration)..." -ForegroundColor Green
    pwsh -NoProfile -Command "Set-Location '$configDir'; & '.\\pack-nuget.ps1' -Configuration '$Configuration'"
}

Write-Host "Done." -ForegroundColor Green
