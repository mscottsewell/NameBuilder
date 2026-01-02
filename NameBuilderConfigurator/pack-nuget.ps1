<#
.SYNOPSIS
Packs the configurator via the repo-root build orchestrator.

.DESCRIPTION
Thin wrapper around the repo-root build.ps1 to execute a "pack-only" flow for the configurator.
This is useful when you want to pack from the configurator directory while keeping all packaging
logic centralized in the monorepo root.

.PARAMETER Configuration
Build configuration to use (Debug/Release).

.PARAMETER DryRun
Print what would happen and exit without modifying files.

.PARAMETER SkipDeploy
Skip local XrmToolBox deployment.

.PARAMETER SkipVersionBump
Skip bumping the configurator version.

.PARAMETER SkipPluginRebuildIfUnchanged
Skip rebuilding the plug-in if the script determines the plug-in has not changed.

.PARAMETER SkipPluginFileVersionBump
Skip bumping the plug-in file version.

.EXAMPLE
pwsh -File .\NameBuilderConfigurator\pack-nuget.ps1 -Configuration Release
#>

param(
    [ValidateSet('Debug','Release')]
    [string]$Configuration = "Release",

    # Print what would happen and exit with no changes.
    [switch]$DryRun,

    # Match repo-root pack script options (common ones). This wrapper packs only.
    [switch]$SkipDeploy,
    [switch]$SkipVersionBump,
    [switch]$SkipPluginRebuildIfUnchanged,
    [switch]$SkipPluginFileVersionBump
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -Path (Join-Path $PSScriptRoot ".."))
$build = Join-Path $repoRoot "build.ps1"
if (-not (Test-Path $build)) {
    throw "build.ps1 not found at $build"
}

$args = @(
    '-NoProfile','-File', $build,
    '-Configuration', $Configuration,
    '-ConfiguratorOnly',
    '-NoBuild'
)

if ($DryRun) { $args += '-DryRun' }

if ($SkipDeploy) { $args += '-SkipDeploy' }
if ($SkipVersionBump) { $args += '-SkipVersionBump' }
if ($SkipPluginRebuildIfUnchanged) { $args += '-SkipPluginRebuildIfUnchanged' }
if ($SkipPluginFileVersionBump) { $args += '-SkipPluginFileVersionBump' }

& pwsh @args
