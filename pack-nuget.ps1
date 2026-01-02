param(
    [ValidateSet('Debug','Release')]
    [string]$Configuration = "Release",

    [string]$NugetSource = "https://api.nuget.org/v3/index.json",
    [string]$NugetApiKey = $env:NUGET_API_KEY,

    # Only push to NuGet when explicitly requested.
    [switch]$Push,
    [switch]$SkipPush,
    [switch]$SkipDeploy,
    [switch]$SkipVersionBump,
    [switch]$SkipPluginRebuildIfUnchanged,

    [string]$XrmToolBoxPluginsPath = "$env:APPDATA\MscrmTools\XrmToolBox\Plugins"
)

# Builds, packs, and optionally deploys/pushes the configurator + plugin payload.
# -SkipVersionBump keeps AssemblyInfo versions unchanged (useful for CI repeatability).
# Plugin AssemblyVersion stays unchanged; only AssemblyFileVersion is bumped (and only if plugin changed).
# -SkipDeploy prevents local XrmToolBox deployment.
# -Push enables pushing the nupkg to NuGet.
# -SkipPush forces skipping the NuGet push (overrides -Push).

$ErrorActionPreference = "Stop"

function Write-Info($message) {
    Write-Host $message -ForegroundColor Cyan
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

    $fileVersionMatch = [regex]::Match($content, 'AssemblyFileVersion\("(?<ver>[^"]+)"\)')
    if (-not $fileVersionMatch.Success) {
        throw "AssemblyFileVersion attribute not found in $AssemblyInfoPath"
    }

    $current = $fileVersionMatch.Groups['ver'].Value
    $next = Increment-Revision -VersionString $current

    # Preserve AssemblyVersion; only bump AssemblyFileVersion
    $content = $content -replace 'AssemblyFileVersion\("[^"]*"\)', "AssemblyFileVersion(`"$next`")"

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

if (-not $SkipVersionBump) {
    Update-ConfiguratorVersion -AssemblyInfoPath $configAssemblyInfo | Out-Null

    if ($pluginHasChanges) {
        Update-PluginFileVersion -AssemblyInfoPath $pluginAssemblyInfo | Out-Null
    } else {
        Write-Info "Plugin unchanged; skipping plugin file version increment"
    }
} else {
    Write-Info "SkipVersionBump enabled; using existing AssemblyInfo versions."
}

# Build Plugin (optional) and ensure plugin payload is present in configurator Assets
$pluginDll = Join-Path $pluginDir "bin\$Configuration\net462\NameBuilder.dll"
$pluginPdb = Join-Path $pluginDir "bin\$Configuration\net462\NameBuilder.pdb"
$assetsPluginDir = Join-Path $configDir "Assets\DataversePlugin"
New-Item -ItemType Directory -Force -Path $assetsPluginDir | Out-Null

if (-not $skipPluginBuild) {
    Write-Info "Building Plugin ($Configuration)..."
    & pwsh -NoProfile -File (Join-Path $pluginDir "build.ps1") -Configuration $Configuration -Framework "net462" -Solution ".\NameBuilder.sln" -TargetFolder $assetsPluginDir -RelativeFallback (Join-Path $configDir "Assets\DataversePlugin")
} else {
    Write-Info "Plugin unchanged; skipping plugin build (using existing binaries)"
    if (-not (Test-Path $pluginDll)) {
        throw "Plugin build output not found at $pluginDll (cannot skip build)."
    }
    Copy-Item -Path $pluginDll -Destination (Join-Path $assetsPluginDir "NameBuilder.dll") -Force
}

# Build Configurator
Write-Info "Building Configurator ($Configuration)..."
$cfgBuildArgs = @(
    '-NoProfile','-File', (Join-Path $configDir 'build.ps1'),
    '-Configuration', $Configuration
)
if ($SkipVersionBump) { $cfgBuildArgs += '-SkipVersionBump' }
if ($SkipDeploy) { $cfgBuildArgs += '-SkipDeploy' }

Push-Location $configDir
try {
    & pwsh @cfgBuildArgs
} finally {
    Pop-Location
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

Write-Info "Packing NameBuilderConfigurator v$version..."
& $nugetExe pack $nuspecPath -Version $version -OutputDirectory $outputDir -BasePath $configDir -NoPackageAnalysis
if ($LASTEXITCODE -ne 0) {
    throw "nuget.exe pack failed with exit code $LASTEXITCODE"
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
