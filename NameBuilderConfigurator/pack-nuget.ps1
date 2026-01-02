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
