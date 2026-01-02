<#
.SYNOPSIS
Pack/deploy helper for the NameBuilder monorepo.

.DESCRIPTION
Builds and/or packs the configurator NuGet package (including the plug-in payload), and can optionally:
- Deploy to a local XrmToolBox Plugins folder.
- Push the resulting .nupkg to NuGet.

This script exists primarily as a packaging-focused entrypoint. The repo-root build script
(build.ps1) is the more general orchestrator.

.PARAMETER Configuration
Build configuration to use (Debug/Release).

.PARAMETER DryRun
Print what would happen and exit without modifying files.

.PARAMETER NoPack
Build only (do not pack).

.PARAMETER NoBuild
Pack only (assumes build outputs already exist).

.PARAMETER PluginOnly
Operate on the plug-in component only (packing is not supported in this mode).

.PARAMETER ConfiguratorOnly
Operate on the configurator component only.

.PARAMETER Push
Push the generated NuGet package (only when packing).

.PARAMETER SkipDeploy
Skip local deployment to XrmToolBox.

.PARAMETER SkipVersionBump
Skip bumping the configurator version.

.PARAMETER SkipPluginFileVersionBump
Skip bumping the plug-in file version.

.EXAMPLE
pwsh -File .\pack-nuget.ps1 -Configuration Release

.EXAMPLE
pwsh -File .\pack-nuget.ps1 -Configuration Release -Push
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

    # Component selection (mirrors repo-root build.ps1)
    [switch]$PluginOnly,
    [switch]$ConfiguratorOnly,

    [string]$NugetSource = "https://api.nuget.org/v3/index.json",
    [string]$NugetApiKey = $env:NUGET_API_KEY,

    # Only push to NuGet when explicitly requested.
    [switch]$Push,
    [switch]$SkipPush,
    [Alias('NoDeploy')]
    [switch]$SkipDeploy,
    [switch]$SkipVersionBump,
    [switch]$SkipPluginRebuildIfUnchanged,

    # For build-only flows you may want to avoid modifying plugin version metadata.
    [switch]$SkipPluginFileVersionBump,

    [string]$XrmToolBoxPluginsPath = "$env:APPDATA\MscrmTools\XrmToolBox\Plugins"
)

# Builds, packs, and optionally deploys/pushes the configurator + plugin payload.
# -SkipVersionBump keeps AssemblyInfo versions unchanged (useful for CI repeatability).
# Plugin AssemblyVersion stays unchanged; only AssemblyFileVersion is bumped (and only if plugin changed).
# -SkipDeploy prevents local XrmToolBox deployment.
# -Push enables pushing the nupkg to NuGet.
# -SkipPush forces skipping the NuGet push (overrides -Push).

$ErrorActionPreference = "Stop"

# The plugin's AssemblyVersion is intentionally kept fixed to avoid binding issues.
# Only AssemblyFileVersion is allowed to increment.
$PluginFixedAssemblyVersion = "1.0.0.0"

if ($PluginOnly -and $ConfiguratorOnly) {
    throw 'Specify only one of -PluginOnly or -ConfiguratorOnly.'
}

if ($NoBuild -and $NoPack) {
    Write-Warning 'Both -NoBuild and -NoPack were provided; nothing to do.'
    return
}

if ($NoPack -and $Push) {
    throw 'Cannot use -Push when -NoPack is specified.'
}

$doBuild = -not $NoBuild
$doPack = -not $NoPack

$buildPlugin = -not $ConfiguratorOnly
$buildConfigurator = -not $PluginOnly

if ($doPack -and -not $buildConfigurator) {
    throw 'Packing is only supported for the configurator package; remove -PluginOnly or add -ConfiguratorOnly.'
}

function Write-Info($message) {
    Write-Host $message -ForegroundColor Cyan
}

function Get-AssemblyFileVersionFromAssemblyInfo {
    param([string]$AssemblyInfoPath)

    if (-not (Test-Path $AssemblyInfoPath)) {
        throw "AssemblyInfo not found at $AssemblyInfoPath"
    }

    $content = Get-Content -Path $AssemblyInfoPath -Raw
    $match = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyFileVersion\("(?<ver>[^"]+)"\)\]')
    if (-not $match.Success) {
        throw "AssemblyFileVersion attribute not found in $AssemblyInfoPath"
    }

    return $match.Groups['ver'].Value
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
        [bool]$PluginHasChanges,
        [string]$Configuration,
        [bool]$SkipVersionBump,
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
        $cfgNext = if ($DoBuild -and $BuildConfigurator -and (-not $SkipVersionBump)) { Increment-Revision -VersionString $cfgCurrent } else { $cfgCurrent }
        Write-Info "Configurator version: $cfgCurrent -> $cfgNext"
    } catch {
        Write-Warning "Configurator version: unable to read ($($_.Exception.Message))"
    }

    try {
        $plugAsmCurrent = Get-AssemblyVersionFromAssemblyInfo -AssemblyInfoPath $PluginAssemblyInfo
        $plugFileCurrent = Get-AssemblyFileVersionFromAssemblyInfo -AssemblyInfoPath $PluginAssemblyInfo
        $plugFileNext = if ($DoBuild -and $BuildPlugin -and (-not $SkipVersionBump) -and (-not $SkipPluginFileVersionBump) -and $PluginHasChanges) { Increment-Revision -VersionString $plugFileCurrent } else { $plugFileCurrent }
        Write-Info "Plugin AssemblyVersion: $plugAsmCurrent (unchanged)"
        Write-Info "Plugin AssemblyFileVersion: $plugFileCurrent -> $plugFileNext"
        Write-Info "Plugin change-detection: HasChanges=$PluginHasChanges SkipRebuildIfUnchanged=$SkipPluginBuild"
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
    Write-Host "============================" -ForegroundColor Yellow
    Write-Host ""
}

function Ensure-NugetExe {
    $minimumNugetVersion = [Version]"5.10.0"

    $nuget = Get-Command nuget.exe -ErrorAction SilentlyContinue
    if ($nuget) {
        try {
            $nugetVersion = [Version]([System.Diagnostics.FileVersionInfo]::GetVersionInfo($nuget.Source).FileVersion)
            if ($nugetVersion -ge $minimumNugetVersion) {
                return $nuget.Source
            }
        } catch {
            Write-Warning "Unable to read nuget.exe version from $($nuget.Source); falling back to local copy."
        }
    }

    $toolsDir = Join-Path $PSScriptRoot ".nuget"
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    $nugetPath = Join-Path $toolsDir "nuget.exe"

    $downloadRequired = $true
    if (Test-Path $nugetPath) {
        try {
            $localVersion = [Version]([System.Diagnostics.FileVersionInfo]::GetVersionInfo($nugetPath).FileVersion)
            if ($localVersion -ge $minimumNugetVersion) {
                $downloadRequired = $false
            }
        } catch {
            Write-Warning "Unable to read nuget.exe version from $nugetPath; re-downloading."
        }
    }

    if ($downloadRequired) {
        Write-Info "Downloading nuget.exe..."
        Invoke-WebRequest -Uri "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe" -OutFile $nugetPath
    }

    return $nugetPath
}

function Get-AssemblyVersionFromAssemblyInfo {
    param([string]$AssemblyInfoPath)

    if (-not (Test-Path $AssemblyInfoPath)) {
        throw "AssemblyInfo not found at $AssemblyInfoPath"
    }

    $content = Get-Content -Path $AssemblyInfoPath -Raw
    $match = [regex]::Match($content, '(?m)^\s*\[assembly:\s*AssemblyVersion\("(?<ver>[^"]+)"\)\]')
    if (-not $match.Success) {
        throw "AssemblyVersion attribute not found in $AssemblyInfoPath"
    }

    return $match.Groups['ver'].Value
}

function Increment-Revision {
    param([string]$VersionString)

    try {
        $v = [Version]$VersionString
    } catch {
        throw "Invalid version format '$VersionString'"
    }

    $nextRevision = [Math]::Max(0, $v.Revision) + 1
    $nextVersion = [Version]::new($v.Major, $v.Minor, $v.Build, $nextRevision)
    return "$($nextVersion.Major).$($nextVersion.Minor).$($nextVersion.Build).$($nextVersion.Revision)"
}

function Update-ConfiguratorVersion {
    param([string]$AssemblyInfoPath)

    $content = Get-Content -Path $AssemblyInfoPath -Raw
    $match = [regex]::Match($content, 'AssemblyVersion\("(?<ver>[^"]+)"\)')
    if (-not $match.Success) {
        throw "AssemblyVersion attribute not found in $AssemblyInfoPath"
    }

    $current = $match.Groups['ver'].Value
    $next = Increment-Revision -VersionString $current

    $content = $content -replace 'AssemblyVersion\("[^"]*"\)', "AssemblyVersion(`"$next`")"
    $content = $content -replace 'AssemblyFileVersion\("[^"]*"\)', "AssemblyFileVersion(`"$next`")"

    Set-Content -Path $AssemblyInfoPath -Value $content -Encoding ascii
    Write-Info "Incremented Configurator version: $current -> $next"

    return $next
}

function Update-PluginFileVersion {
    param([string]$AssemblyInfoPath)

    $content = Get-Content -Path $AssemblyInfoPath -Raw

    $asmVersionMatch = [regex]::Match($content, 'AssemblyVersion\("(?<ver>[^\"]+)"\)')
    if (-not $asmVersionMatch.Success) {
        throw "AssemblyVersion attribute not found in $AssemblyInfoPath"
    }

    $asmCurrent = $asmVersionMatch.Groups['ver'].Value
    if ($asmCurrent -ne $PluginFixedAssemblyVersion) {
        throw "Plugin AssemblyVersion must remain $PluginFixedAssemblyVersion (found $asmCurrent). Update the plugin file version only."
    }

    $fileVersionMatch = [regex]::Match($content, 'AssemblyFileVersion\("(?<ver>[^"]+)"\)')
    if (-not $fileVersionMatch.Success) {
        throw "AssemblyFileVersion attribute not found in $AssemblyInfoPath"
    }

    $current = $fileVersionMatch.Groups['ver'].Value
    $next = Increment-Revision -VersionString $current

    # Preserve AssemblyVersion; only bump AssemblyFileVersion
    $content = $content -replace 'AssemblyFileVersion\("[^"]*"\)', "AssemblyFileVersion(`"$next`")"

    # Safety: verify AssemblyVersion is still fixed after the edit
    $asmAfterMatch = [regex]::Match($content, 'AssemblyVersion\("(?<ver>[^\"]+)"\)')
    if (-not $asmAfterMatch.Success -or $asmAfterMatch.Groups['ver'].Value -ne $PluginFixedAssemblyVersion) {
        $found = if ($asmAfterMatch.Success) { $asmAfterMatch.Groups['ver'].Value } else { "(missing)" }
        throw "Plugin AssemblyVersion must remain $PluginFixedAssemblyVersion (found $found) after version update."
    }

    Set-Content -Path $AssemblyInfoPath -Value $content -Encoding ascii
    Write-Info "Incremented Plugin file version: $current -> $next"

    return $next
}

function Test-PluginHasChanges {
    param([string]$PluginPath)

    try {
        $null = & git rev-parse --show-toplevel 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Not in a git repository; assuming plugin has changes"
            return $true
        }
    } catch {
        Write-Warning "Git not available; assuming plugin has changes"
        return $true
    }

    $status = & git status --porcelain -- $PluginPath 2>&1
    if ($status) {
        Write-Info "Plugin has uncommitted changes"
        return $true
    }

    try {
        $lastCommitFiles = & git diff-tree --no-commit-id --name-only -r HEAD -- $PluginPath 2>&1
        if ($LASTEXITCODE -eq 0 -and $lastCommitFiles) {
            Write-Info "Plugin was modified in the last commit"
            return $true
        }
    } catch {
        Write-Warning "Could not check last commit; assuming plugin has changes"
        return $true
    }

    Write-Info "Plugin has no changes since last commit"
    return $false
}

$repoRoot = (Resolve-Path -Path $PSScriptRoot).Path
$configDir = Join-Path $repoRoot "NameBuilderConfigurator"
$pluginDir = Join-Path $repoRoot "NameBuilderPlugin"

$configAssemblyInfo = Join-Path $configDir "Properties\AssemblyInfo.cs"
$pluginAssemblyInfo = Join-Path $pluginDir "Properties\AssemblyInfo.cs"

$pluginHasChanges = Test-PluginHasChanges -PluginPath "NameBuilderPlugin"
$skipPluginBuild = $SkipPluginRebuildIfUnchanged -and (-not $pluginHasChanges)

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
        PluginHasChanges = $pluginHasChanges
        Configuration = $Configuration
        SkipVersionBump = [bool]$SkipVersionBump
        SkipPluginFileVersionBump = [bool]$SkipPluginFileVersionBump
        SkipDeploy = [bool]$SkipDeploy
        Push = [bool]$Push
        SkipPush = [bool]$SkipPush
        NugetSource = $NugetSource
    }

    Write-DryRunPlan @dryRunArgs

    return
}

if ($doBuild -and -not $SkipVersionBump) {
    if ($buildConfigurator) {
        Update-ConfiguratorVersion -AssemblyInfoPath $configAssemblyInfo | Out-Null
    }

    if ($buildPlugin) {
        if ($SkipPluginFileVersionBump) {
            Write-Info "SkipPluginFileVersionBump enabled; leaving plugin version metadata unchanged."
        } elseif ($pluginHasChanges) {
            Update-PluginFileVersion -AssemblyInfoPath $pluginAssemblyInfo | Out-Null
        } else {
            Write-Info "Plugin unchanged; skipping plugin file version increment"
        }
    }
} elseif (-not $doBuild) {
    Write-Info "NoBuild enabled; skipping any version changes."
} else {
    Write-Info "SkipVersionBump enabled; using existing AssemblyInfo versions."
}

# Build Plugin (optional) and ensure plugin payload is present in configurator Assets
$pluginDll = Join-Path $pluginDir "bin\$Configuration\net462\NameBuilder.dll"
$pluginPdb = Join-Path $pluginDir "bin\$Configuration\net462\NameBuilder.pdb"
$assetsPluginDir = Join-Path $configDir "Assets\DataversePlugin"
New-Item -ItemType Directory -Force -Path $assetsPluginDir | Out-Null

$assetsPluginDll = Join-Path $assetsPluginDir "NameBuilder.dll"
$pluginDecision = $null

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
        & pwsh -NoProfile -File (Join-Path $pluginDir "build.ps1") -Configuration $Configuration -Framework "net462" -Solution ".\NameBuilder.sln" -TargetFolder $assetsPluginDir -RelativeFallback (Join-Path $configDir "Assets\DataversePlugin")
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
            throw "Plugin DLL not found at $pluginDll or $assetsPluginDir\\NameBuilder.dll. Run a build at least once or remove -NoBuild."
        }
    }
} elseif ($buildPlugin -and $doBuild) {
    # Plugin-only build.
    Write-Info "Building Plugin ($Configuration)..."
    & pwsh -NoProfile -File (Join-Path $pluginDir "build.ps1") -Configuration $Configuration -Framework "net462" -Solution ".\NameBuilder.sln" -TargetFolder $assetsPluginDir -RelativeFallback (Join-Path $configDir "Assets\DataversePlugin")
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
