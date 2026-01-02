<#
.SYNOPSIS
Build/pack orchestrator for the NameBuilder monorepo.

.DESCRIPTION
Builds the Dataverse plug-in (NameBuilder.dll) and/or the XrmToolBox configurator, and optionally:
- Packs the configurator into a NuGet package (including the plug-in payload under Assets).
- Deploys the configurator to a local XrmToolBox Plugins folder.
- Pushes the resulting .nupkg to NuGet.

Versioning rules (important for Dataverse / assembly binding behavior):
- Configurator package version is derived from the configurator AssemblyVersion.
- Plug-in AssemblyVersion is intentionally kept fixed.
- Plug-in AssemblyFileVersion may be bumped only when the plug-in changed in the last commit,
    unless -SkipPluginFileVersionBump is supplied.
- When build-only mode is active (no packing), version metadata is not mutated.

.PARAMETER Configuration
Build configuration to use (Debug/Release).

.PARAMETER Pack
Enables packaging the configurator into a NuGet package. Without -Pack, the default behavior is build-only.

.PARAMETER PluginOnly
Build only the Dataverse plug-in.

.PARAMETER ConfiguratorOnly
Build only the configurator.

.PARAMETER Push
Push the generated NuGet package to the configured source. Only applies when packaging.

.PARAMETER SkipDeploy
Skips local deployment to the XrmToolBox Plugins folder.

.PARAMETER SkipVersionBump
Skips bumping the configurator AssemblyVersion (and therefore the NuGet package version).

.PARAMETER SkipPluginFileVersionBump
Skips bumping the plug-in AssemblyFileVersion.

.EXAMPLE
pwsh -File .\build.ps1 -Configuration Release

.EXAMPLE
pwsh -File .\build.ps1 -Configuration Release -Pack

.EXAMPLE
pwsh -File .\build.ps1 -Configuration Release -Pack -Push
#>

param(
    [ValidateSet('Debug','Release')]
    [string]$Configuration = "Release",

    # Print what would happen and exit with no changes.
    [switch]$DryRun,

    # Build/pack toggles
    [Alias('BuildOnly')]
    [switch]$NoPack,

    [Alias('PackOnly')]
    [switch]$NoBuild,

    # Component selection
    [switch]$PluginOnly,
    [switch]$ConfiguratorOnly,

    # Convenience: build.ps1 defaults to build-only unless -Pack (or -NoBuild) is provided.
    [switch]$Pack,

    [string]$NugetSource = "https://api.nuget.org/v3/index.json",
    [string]$NugetApiKey = $env:NUGET_API_KEY,

    # Only push to NuGet when explicitly requested.
    [switch]$Push,
    [switch]$SkipPush,

    [Alias('NoDeploy')]
    [switch]$SkipDeploy,

    # Skip bumping the configurator version (and therefore the NuGet package version).
    # NOTE: plugin file-version bumping is controlled separately by -SkipPluginFileVersionBump
    # and commit-based change detection.
    [switch]$SkipVersionBump,

    [switch]$SkipPluginRebuildIfUnchanged,

    # Avoid modifying plugin version metadata.
    [switch]$SkipPluginFileVersionBump,

    [string]$XrmToolBoxPluginsPath = "$env:APPDATA\MscrmTools\XrmToolBox\Plugins"
)

# The plugin's AssemblyVersion is intentionally kept fixed to avoid binding issues.
# Only AssemblyFileVersion is allowed to increment.
$PluginFixedAssemblyVersion = "1.0.0.0"

$ErrorActionPreference = "Stop"

if ($PluginOnly -and $ConfiguratorOnly) {
    throw 'Specify only one of -PluginOnly or -ConfiguratorOnly.'
}

if ($NoBuild -and $NoPack) {
    Write-Warning 'Both -NoBuild and -NoPack were provided; nothing to do.'
    return
}

# Preserve previous build.ps1 behavior:
# - Default is build-only (NoPack) unless -Pack is specified.
# - Pack-only (-NoBuild) implicitly enables packing.
$effectiveNoPack = [bool]($NoPack -or (-not $Pack -and -not $NoBuild))

# For build-only flows, avoid mutating version metadata.
$effectiveSkipVersionBump = [bool]($SkipVersionBump -or $effectiveNoPack)
$effectiveSkipPluginFileVersionBump = [bool]($SkipPluginFileVersionBump -or $effectiveNoPack)

if ($effectiveNoPack -and $Push) {
    throw 'Cannot use -Push when build-only mode is active (no packaging). Add -Pack or remove -Push.'
}

$doBuild = -not $NoBuild
$doPack = -not $effectiveNoPack

$buildPlugin = -not $ConfiguratorOnly
$buildConfigurator = -not $PluginOnly

if ($doPack -and -not $buildConfigurator) {
    throw 'Packing is only supported for the configurator package; remove -PluginOnly or add -ConfiguratorOnly.'
}

function Write-Info($message) {
    Write-Host $message -ForegroundColor Cyan
}

function Get-AssemblyVersionFromAssemblyInfo {
    param([string]$AssemblyInfoPath)

    if (-not (Test-Path $AssemblyInfoPath)) {
        throw "AssemblyInfo not found at $AssemblyInfoPath"
    }

    $content = Get-Content -Path $AssemblyInfoPath -Raw
    $match = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyVersion\("(?<ver>[^\"]+)"\)\]')
    if (-not $match.Success) {
        throw "AssemblyVersion attribute not found in $AssemblyInfoPath"
    }

    return $match.Groups['ver'].Value
}

function Get-AssemblyFileVersionFromAssemblyInfo {
    param([string]$AssemblyInfoPath)

    if (-not (Test-Path $AssemblyInfoPath)) {
        throw "AssemblyInfo not found at $AssemblyInfoPath"
    }

    $content = Get-Content -Path $AssemblyInfoPath -Raw
    $match = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyFileVersion\("(?<ver>[^\"]+)"\)\]')
    if (-not $match.Success) {
        throw "AssemblyFileVersion attribute not found in $AssemblyInfoPath"
    }

    return $match.Groups['ver'].Value
}

function Increment-Revision {
    param([string]$VersionString)

    $parts = $VersionString.Split('.')
    if ($parts.Count -lt 4) {
        throw "Version must have 4 parts (Major.Minor.Build.Revision): $VersionString"
    }

    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $build = [int]$parts[2]
    $revision = [int]$parts[3]

    $revision++
    return "$major.$minor.$build.$revision"
}

function Update-ConfiguratorVersion {
    param([string]$AssemblyInfoPath)

    if (-not (Test-Path $AssemblyInfoPath)) {
        throw "AssemblyInfo not found at $AssemblyInfoPath"
    }

    $content = Get-Content -Path $AssemblyInfoPath -Raw
    # Match only the actual assembly attribute line (avoid commented examples like 1.0.*)
    $match = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyVersion\("(?<ver>[^\"]+)"\)\]')
    if (-not $match.Success) {
        throw "AssemblyVersion attribute not found in $AssemblyInfoPath"
    }

    $current = $match.Groups['ver'].Value
    $next = Increment-Revision -VersionString $current

    # Keep AssemblyVersion and AssemblyFileVersion in sync for the configurator (attribute lines only)
    $content = [regex]::Replace(
        $content,
        '(?m)^\s*\[assembly:\s*AssemblyVersion\("[^\"]*"\)\]',
        ('[assembly: AssemblyVersion("' + $next + '")]')
    )
    $content = [regex]::Replace(
        $content,
        '(?m)^\s*\[assembly:\s*AssemblyFileVersion\("[^\"]*"\)\]',
        ('[assembly: AssemblyFileVersion("' + $next + '")]')
    )

    Set-Content -Path $AssemblyInfoPath -Value $content -Encoding ascii
    Write-Info "Incremented Configurator version: $current -> $next"

    return $next
}

function Update-PluginFileVersion {
    param([string]$AssemblyInfoPath)

    if (-not (Test-Path $AssemblyInfoPath)) {
        throw "AssemblyInfo not found at $AssemblyInfoPath"
    }

    $content = Get-Content -Path $AssemblyInfoPath -Raw

    $asmVersionMatch = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyVersion\("(?<ver>[^\"]+)"\)\]')
    if (-not $asmVersionMatch.Success) {
        throw "AssemblyVersion attribute not found in $AssemblyInfoPath"
    }

    $asmCurrent = $asmVersionMatch.Groups['ver'].Value
    if ($asmCurrent -ne $PluginFixedAssemblyVersion) {
        throw "Plugin AssemblyVersion must remain $PluginFixedAssemblyVersion (found $asmCurrent). Update the plugin file version only."
    }
    $fileVersionMatch = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyFileVersion\("(?<ver>[^\"]+)"\)\]')
    if (-not $fileVersionMatch.Success) {
        throw "AssemblyFileVersion attribute not found in $AssemblyInfoPath"
    }

    $current = $fileVersionMatch.Groups['ver'].Value
    $next = Increment-Revision -VersionString $current

    # Preserve AssemblyVersion; only bump AssemblyFileVersion (attribute line only)
    $content = [regex]::Replace(
        $content,
        '(?m)^\s*\[assembly:\s*AssemblyFileVersion\("[^\"]*"\)\]',
        ('[assembly: AssemblyFileVersion("' + $next + '")]')
    )

    # Safety: verify AssemblyVersion is still fixed after the edit
    $asmAfterMatch = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyVersion\("(?<ver>[^\"]+)"\)\]')
    if (-not $asmAfterMatch.Success -or $asmAfterMatch.Groups['ver'].Value -ne $PluginFixedAssemblyVersion) {
        $found = if ($asmAfterMatch.Success) { $asmAfterMatch.Groups['ver'].Value } else { "(missing)" }
        throw "Plugin AssemblyVersion must remain $PluginFixedAssemblyVersion (found $found) after version update."
    }

    Set-Content -Path $AssemblyInfoPath -Value $content -Encoding ascii
    Write-Info "Incremented Plugin file version: $current -> $next"

    return $next
}

function Ensure-NugetExe {
    $nugetDir = Join-Path $PSScriptRoot ".nuget"
    $nugetExe = Join-Path $nugetDir "nuget.exe"

    if (-not (Test-Path $nugetExe)) {
        New-Item -ItemType Directory -Force -Path $nugetDir | Out-Null
        $url = "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe"
        Write-Info "Downloading nuget.exe from $url"
        Invoke-WebRequest -Uri $url -OutFile $nugetExe -UseBasicParsing | Out-Null
    }

    return $nugetExe
}

function Get-FileVersionInfoSafe {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path $Path)) {
        return $null
    }

    try {
        return [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    } catch {
        return $null
    }
}

function Write-PluginVersionReport {
    param(
        [string]$PluginAssemblyInfo,
        [string]$PluginBinDll,
        [string]$PluginAssetsDll,
        [string]$RebuildDecision
    )

    Write-Info "Plugin rebuild decision: $RebuildDecision"

    try {
        $asmVer = Get-AssemblyVersionFromAssemblyInfo -AssemblyInfoPath $PluginAssemblyInfo
        $fileVer = Get-AssemblyFileVersionFromAssemblyInfo -AssemblyInfoPath $PluginAssemblyInfo
        Write-Info "Plugin AssemblyInfo: AssemblyVersion=$asmVer AssemblyFileVersion=$fileVer"
    } catch {
        Write-Warning "Plugin AssemblyInfo: $($_.Exception.Message)"
    }

    $binInfo = Get-FileVersionInfoSafe -Path $PluginBinDll
    if ($binInfo) {
        Write-Info "Plugin binary (bin): $PluginBinDll"
        Write-Info "  FileVersion=$($binInfo.FileVersion) ProductVersion=$($binInfo.ProductVersion)"
    }

    if ($PluginAssetsDll -and (Test-Path $PluginAssetsDll)) {
        $assetInfo = Get-FileVersionInfoSafe -Path $PluginAssetsDll
        if ($assetInfo) {
            Write-Info "Plugin binary (assets): $PluginAssetsDll"
            Write-Info "  FileVersion=$($assetInfo.FileVersion) ProductVersion=$($assetInfo.ProductVersion)"
        }
    }
}

function Test-IsInGitRepo {
    try {
        $null = & git rev-parse --show-toplevel 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Test-PluginHasUncommittedChanges {
    param([string]$PluginPath)

    if (-not (Test-IsInGitRepo)) {
        Write-Warning "Not in a git repository (or git not available); cannot check uncommitted changes"
        return $false
    }

    $status = & git status --porcelain -- $PluginPath 2>&1
    if ($status) {
        Write-Info "Plugin has uncommitted changes"
        return $true
    }

    return $false
}

function Test-PluginModifiedInLastCommit {
    param([string]$PluginPath)

    if (-not (Test-IsInGitRepo)) {
        Write-Warning "Not in a git repository (or git not available); assuming plugin was modified in last commit"
        return $true
    }

    try {
        $lastCommitFiles = & git diff-tree --no-commit-id --name-only -r HEAD -- $PluginPath 2>&1
        if ($LASTEXITCODE -eq 0 -and $lastCommitFiles) {
            Write-Info "Plugin was modified in the last commit"
            return $true
        }
    } catch {
        Write-Warning "Could not check last commit; assuming plugin was modified"
        return $true
    }

    Write-Info "Plugin was NOT modified in the last commit"
    return $false
}

function Write-DryRunPlan {
    param(
        [string]$RepoRoot,
        [string]$ConfigDir,
        [string]$PluginDir,
        [string]$ConfigAssemblyInfo,
        [string]$PluginAssemblyInfo,
        [bool]$DoBuild,
        [bool]$DoPack,
        [bool]$BuildPlugin,
        [bool]$BuildConfigurator,
        [bool]$SkipPluginBuild,
        [bool]$PluginHasUncommittedChanges,
        [bool]$PluginModifiedInLastCommit,
        [string]$Configuration,
        [bool]$SkipConfiguratorVersionBump,
        [bool]$SkipPluginFileVersionBump,
        [bool]$SkipDeploy,
        [bool]$Push,
        [bool]$SkipPush,
        [string]$NugetSource
    )

    Write-Host "" 
    Write-Host "=== DRY RUN (no changes) ===" -ForegroundColor Yellow
    Write-Info "RepoRoot: $RepoRoot"
    Write-Info "Configuration: $Configuration"
    Write-Info "Mode: DoBuild=$DoBuild DoPack=$DoPack"
    Write-Info "Scope: BuildPlugin=$BuildPlugin BuildConfigurator=$BuildConfigurator"

    $willPush = $Push -and (-not $SkipPush)
    Write-Info "NuGet push: $willPush (Push=$Push SkipPush=$SkipPush)"
    if ($willPush) { Write-Info "NuGet source: $NugetSource" }

    $willDeploy = $BuildConfigurator -and $DoBuild -and (-not $SkipDeploy)
    Write-Info "Deploy to XrmToolBox: $willDeploy (SkipDeploy=$SkipDeploy)"

    # Versioning preview
    try {
        $cfgCurrent = Get-AssemblyVersionFromAssemblyInfo -AssemblyInfoPath $ConfigAssemblyInfo
        $cfgNext = if ($DoBuild -and $BuildConfigurator -and (-not $SkipConfiguratorVersionBump)) { Increment-Revision -VersionString $cfgCurrent } else { $cfgCurrent }
        Write-Info "Configurator version: $cfgCurrent -> $cfgNext"
    } catch {
        Write-Warning "Configurator version: unable to read ($($_.Exception.Message))"
    }

    try {
        $plugAsmCurrent = Get-AssemblyVersionFromAssemblyInfo -AssemblyInfoPath $PluginAssemblyInfo
        $plugFileCurrent = Get-AssemblyFileVersionFromAssemblyInfo -AssemblyInfoPath $PluginAssemblyInfo
        $plugFileNext = if ($DoBuild -and $BuildPlugin -and (-not $SkipPluginFileVersionBump) -and $PluginModifiedInLastCommit) { Increment-Revision -VersionString $plugFileCurrent } else { $plugFileCurrent }
        Write-Info "Plugin AssemblyVersion: $plugAsmCurrent (unchanged)"
        Write-Info "Plugin AssemblyFileVersion: $plugFileCurrent -> $plugFileNext"
        Write-Info "Plugin change-detection: Uncommitted=$PluginHasUncommittedChanges ModifiedInLastCommit=$PluginModifiedInLastCommit SkipRebuildIfUnchanged=$SkipPluginBuild"
    } catch {
        Write-Warning "Plugin version: unable to read ($($_.Exception.Message))"
    }

    $assetsPluginDir = Join-Path $ConfigDir "Assets\DataversePlugin"
    $pluginDll = Join-Path $PluginDir "bin\$Configuration\net462\NameBuilder.dll"
    $configDll = Join-Path $ConfigDir "bin\$Configuration\NameBuilderConfigurator.dll"
    $nuspecPath = Join-Path $ConfigDir "NameBuilderConfigurator.nuspec"
    $outputDir = Join-Path $RepoRoot "artifacts\nuget"
    Write-Info "Will ensure plugin payload under: $assetsPluginDir"

    if ($DoBuild) {
        if ($BuildPlugin -and (-not $SkipPluginBuild)) {
            Write-Info "Would run: NameBuilderPlugin/build.ps1 (dotnet build)"
        } elseif ($BuildPlugin) {
            Write-Info "Would skip plugin build; would copy existing $pluginDll into assets if present"
        }

        if ($BuildConfigurator) {
            Write-Info "Would run: NameBuilderConfigurator/build.ps1 (MSBuild)"
        }
    } else {
        Write-Info "NoBuild: expects existing binaries"
        Write-Info "  Plugin DLL expected: $pluginDll (or already in assets)"
        Write-Info "  Configurator DLL expected: $configDll"
    }

    if ($DoPack) {
        Write-Info "Would run: nuget.exe pack $nuspecPath -OutputDirectory $outputDir -BasePath $ConfigDir"
    } else {
        Write-Info "NoPack: would skip nuget pack"
    }

    Write-Info "Nuspec: $nuspecPath"
    Write-Info "Output folder: $outputDir"
}

$repoRoot = (Resolve-Path -Path $PSScriptRoot).Path
$configDir = Join-Path $repoRoot "NameBuilderConfigurator"
$pluginDir = Join-Path $repoRoot "NameBuilderPlugin"

$configAssemblyInfo = Join-Path $configDir "Properties\AssemblyInfo.cs"
$pluginAssemblyInfo = Join-Path $pluginDir "Properties\AssemblyInfo.cs"

$pluginHasUncommitted = Test-PluginHasUncommittedChanges -PluginPath "NameBuilderPlugin"
$pluginModifiedInLastCommit = Test-PluginModifiedInLastCommit -PluginPath "NameBuilderPlugin"
$pluginHasAnyChangesForRebuild = ($pluginHasUncommitted -or $pluginModifiedInLastCommit)
$skipPluginBuild = $SkipPluginRebuildIfUnchanged -and (-not $pluginHasAnyChangesForRebuild)

if ($DryRun) {
    $dryRunArgs = @{
        RepoRoot = $repoRoot
        ConfigDir = $configDir
        PluginDir = $pluginDir
        ConfigAssemblyInfo = $configAssemblyInfo
        PluginAssemblyInfo = $pluginAssemblyInfo
        DoBuild = $doBuild
        DoPack = $doPack
        BuildPlugin = $buildPlugin
        BuildConfigurator = $buildConfigurator
        SkipPluginBuild = $skipPluginBuild
        PluginHasUncommittedChanges = $pluginHasUncommitted
        PluginModifiedInLastCommit = $pluginModifiedInLastCommit
        Configuration = $Configuration
        SkipConfiguratorVersionBump = $effectiveSkipVersionBump
        SkipPluginFileVersionBump = $effectiveSkipPluginFileVersionBump
        SkipDeploy = [bool]$SkipDeploy
        Push = [bool]$Push
        SkipPush = [bool]$SkipPush
        NugetSource = $NugetSource
    }

    Write-DryRunPlan @dryRunArgs
    return
}

if ($doBuild) {
    if ($buildConfigurator) {
        if ($effectiveSkipVersionBump) {
            Write-Info "SkipVersionBump enabled (or build-only); leaving configurator version metadata unchanged."
        } else {
            Update-ConfiguratorVersion -AssemblyInfoPath $configAssemblyInfo | Out-Null
        }
    }

    if ($buildPlugin) {
        if ($effectiveSkipPluginFileVersionBump) {
            Write-Info "SkipPluginFileVersionBump enabled (or build-only); leaving plugin version metadata unchanged."
        } elseif ($pluginModifiedInLastCommit) {
            Update-PluginFileVersion -AssemblyInfoPath $pluginAssemblyInfo | Out-Null
        } else {
            Write-Info "Plugin not modified in last commit; skipping plugin file version increment"
        }
    }
} else {
    Write-Info "NoBuild enabled; skipping any version changes."
}

# Build Plugin (optional) and ensure plugin payload is present in configurator Assets
$pluginDll = Join-Path $pluginDir "bin\$Configuration\net462\NameBuilder.dll"
$pluginPdb = Join-Path $pluginDir "bin\$Configuration\net462\NameBuilder.pdb"
$assetsPluginDir = Join-Path $configDir "Assets\DataversePlugin"
New-Item -ItemType Directory -Force -Path $assetsPluginDir | Out-Null

$assetsPluginDll = Join-Path $assetsPluginDir "NameBuilder.dll"
$pluginDecision = $null

# If we were asked to skip the plugin rebuild but there are no binaries available yet,
# force a rebuild so packing/deploy doesn't fail on a clean workspace.
if ($skipPluginBuild -and $doBuild -and $buildPlugin) {
    if (-not (Test-Path $pluginDll) -and -not (Test-Path $assetsPluginDll)) {
        Write-Warning "Plugin binaries not found; forcing plugin rebuild despite -SkipPluginRebuildIfUnchanged."
        $skipPluginBuild = $false
    }
}

if (-not $doBuild) {
    $pluginDecision = 'NoBuild (reuse existing binaries)'
} elseif ($buildPlugin -and (-not $skipPluginBuild)) {
    $pluginDecision = 'Rebuild (plugin build will run)'
} elseif ($buildPlugin -and $skipPluginBuild) {
    $pluginDecision = 'Skip rebuild (no plugin changes detected)'
} else {
    $pluginDecision = 'Not requested (ConfiguratorOnly)'
}

if ($buildConfigurator -or $doPack) {
    # The configurator package expects the plugin payload in Assets/DataversePlugin.
    if ($buildPlugin -and $doBuild -and (-not $skipPluginBuild)) {
        Write-Info "Building Plugin ($Configuration)..."
        & pwsh -NoProfile -File (Join-Path $pluginDir "build.ps1") -Configuration $Configuration -Framework "net462" -Solution ".\NameBuilder.csproj" -TargetFolder $assetsPluginDir -RelativeFallback (Join-Path $configDir "Assets\DataversePlugin")
    } else {
        if ($skipPluginBuild) {
            Write-Info "Plugin unchanged; skipping plugin build (using existing binaries)"
        } elseif (-not $doBuild) {
            Write-Info "NoBuild enabled; using existing plugin binaries"
        }

        if (Test-Path $pluginDll) {
            Copy-Item -Path $pluginDll -Destination (Join-Path $assetsPluginDir "NameBuilder.dll") -Force
            if (Test-Path $pluginPdb) {
                Copy-Item -Path $pluginPdb -Destination (Join-Path $assetsPluginDir "NameBuilder.pdb") -Force
            }
        } elseif (-not (Test-Path (Join-Path $assetsPluginDir "NameBuilder.dll"))) {
            throw "Plugin DLL not found at $pluginDll or $assetsPluginDir\NameBuilder.dll. Run a build at least once or remove -NoBuild."
        }
    }
} elseif ($buildPlugin -and $doBuild) {
    # Plugin-only build.
    Write-Info "Building Plugin ($Configuration)..."
    & pwsh -NoProfile -File (Join-Path $pluginDir "build.ps1") -Configuration $Configuration -Framework "net462" -Solution ".\NameBuilder.csproj" -TargetFolder $assetsPluginDir -RelativeFallback (Join-Path $configDir "Assets\DataversePlugin")
}

# Report plugin version metadata and binary versions (whether rebuilt or reused)
Write-PluginVersionReport -PluginAssemblyInfo $pluginAssemblyInfo -PluginBinDll $pluginDll -PluginAssetsDll $assetsPluginDll -RebuildDecision $pluginDecision

# Build Configurator
if ($buildConfigurator -and $doBuild) {
    Write-Info "Building Configurator ($Configuration)..."
    $cfgBuildArgs = @(
        '-NoProfile','-File', (Join-Path $configDir 'build.ps1'),
        '-Configuration', $Configuration
    )
    # Root script owns version bumping; prevent double-bump.
    $cfgBuildArgs += '-SkipVersionBump'
    if ($SkipDeploy) { $cfgBuildArgs += '-SkipDeploy' }

    Push-Location $configDir
    try {
        & pwsh @cfgBuildArgs
    } finally {
        Pop-Location
    }
} elseif ($buildConfigurator -and $doPack) {
    Write-Info "NoBuild enabled; expecting existing configurator build output for packing."
}

if (-not $buildConfigurator) {
    return
}

# Determine version for NuGet package
$version = Get-AssemblyVersionFromAssemblyInfo -AssemblyInfoPath $configAssemblyInfo

$nugetExe = Ensure-NugetExe
$outputDir = Join-Path $repoRoot "artifacts\nuget"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$nuspecPath = Join-Path $configDir "NameBuilderConfigurator.nuspec"
if (-not (Test-Path $nuspecPath)) {
    throw "Nuspec not found at $nuspecPath"
}

if ($doPack) {
    Write-Info "Packing NameBuilderConfigurator v$version..."
    & $nugetExe pack $nuspecPath -Version $version -OutputDirectory $outputDir -BasePath $configDir -NoPackageAnalysis
    if ($LASTEXITCODE -ne 0) {
        throw "nuget.exe pack failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Info "NoPack enabled; skipping NuGet packaging."
    return
}

$packagePath = Join-Path $outputDir "NameBuilderConfigurator.$version.nupkg"
if (-not (Test-Path $packagePath)) {
    throw "NuGet package not created at $packagePath"
}

if ($Push -and -not $SkipPush) {
    if ([string]::IsNullOrWhiteSpace($NugetApiKey)) {
        throw "NuGet API key not provided. Supply -NugetApiKey or set NUGET_API_KEY."
    }

    Write-Info "Pushing package to $NugetSource..."
    & $nugetExe push $packagePath -ApiKey $NugetApiKey -Source $NugetSource
    if ($LASTEXITCODE -ne 0) {
        throw "nuget.exe push failed with exit code $LASTEXITCODE"
    }

    Write-Info "Package pushed successfully."
} else {
    Write-Info "NuGet push skipped; package available at $packagePath"
}
