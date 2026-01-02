param(
    [string]$PackageId = "NameBuilderConfigurator",

    # If set, will run the local pack script first (safe local defaults).
    [switch]$BuildLocal,

    [ValidateSet('Debug','Release')]
    [string]$Configuration = "Release",

    # Explicit local .nupkg path; if not supplied, the newest matching artifacts/nuget/*.nupkg is used.
    [string]$LocalNupkgPath,

    # Override which remote version to compare against; default is latest available.
    [string]$RemoteVersion,

    # Max number of diffs to print in each section.
    [int]$MaxDiff = 50,

    # Keep extracted files under .tmp for inspection.
    [switch]$KeepTemp
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host $Message -ForegroundColor Yellow }
function Write-Ok([string]$Message) { Write-Host $Message -ForegroundColor Green }

function Get-RelPath([string]$Root, [string]$FullName) {
    $rel = $FullName.Substring($Root.Length).TrimStart('\')
    return ($rel -replace '\\','/')
}

function Get-Manifest([string]$Root) {
    Get-ChildItem -Path $Root -File -Recurse |
        ForEach-Object {
            [PSCustomObject]@{
                Path = Get-RelPath -Root $Root -FullName $_.FullName
                Sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
                Length = $_.Length
            }
        } |
        Sort-Object Path
}

function Is-ExpectedMetadataPath([string]$Path) {
    return (
        $Path -eq "_rels/.rels" -or
        $Path -eq "[Content_Types].xml" -or
        $Path -eq ".signature.p7s" -or
        $Path -like "package/services/metadata/core-properties/*.psmdcp"
    )
}

function Ensure-Dir([string]$Path) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Download-LatestNuGetNupkg {
    param(
        [string]$PackageId,
        [string]$DownloadDir,
        [string]$RemoteVersion
    )

    $lower = $PackageId.ToLowerInvariant()
    $indexUrl = "https://api.nuget.org/v3-flatcontainer/$lower/index.json"

    Write-Info "Fetching NuGet index: $indexUrl"
    $index = Invoke-RestMethod -Uri $indexUrl -Method Get

    $versions = [string[]]$index.versions
    if (-not $versions -or $versions.Count -eq 0) {
        throw "No versions returned for $PackageId"
    }

    if ($RemoteVersion) {
        $versionsDesc = @($RemoteVersion)
    } else {
        # Sort versions by System.Version to find newest.
        $versionsDesc = $versions | Sort-Object { [Version]$_ } -Descending
    }

    Ensure-Dir $DownloadDir

    foreach ($v in $versionsDesc) {
        # NuGet v3 flat container uses lowercase package id in the file name.
        $url = "https://api.nuget.org/v3-flatcontainer/$lower/$v/$lower.$v.nupkg"
        $out = Join-Path $DownloadDir "$lower.$v.nupkg"

        try {
            Write-Info "Downloading $PackageId $v..."
            Invoke-WebRequest -Uri $url -OutFile $out -ErrorAction Stop | Out-Null
            return [PSCustomObject]@{ Version = $v; Path = $out }
        } catch {
            if ($RemoteVersion) {
                throw "Failed downloading requested version ${v}: $($_.Exception.Message)"
            }
            Write-Warn "Download failed for $v; trying previous version"
        }
    }

    throw "Unable to download any version for $PackageId"
}

function Get-NuspecDeps([string]$NuspecPath) {
    [xml]$x = Get-Content $NuspecPath
    $nsUri = $x.DocumentElement.NamespaceURI
    $ns = New-Object System.Xml.XmlNamespaceManager($x.NameTable)
    $ns.AddNamespace('n', $nsUri)

    $nodes = $x.SelectNodes('//n:dependencies/n:dependency', $ns)
    if (-not $nodes) { return @() }

    return @($nodes | ForEach-Object { "$($_.id) $($_.version)" })
}

$repoRoot = (Resolve-Path -Path $PSScriptRoot).Path

if ($BuildLocal) {
    $pack = Join-Path $repoRoot "pack-nuget.ps1"
    if (-not (Test-Path $pack)) {
        throw "pack-nuget.ps1 not found at $pack"
    }

    Write-Info "Building local nupkg via pack-nuget.ps1 (safe defaults)..."
    & pwsh -NoProfile -File $pack -Configuration $Configuration -SkipDeploy -SkipVersionBump -SkipPluginRebuildIfUnchanged | Out-Host
}

if (-not $LocalNupkgPath) {
    $glob = Join-Path $repoRoot "artifacts\nuget\$PackageId.*.nupkg"
    $local = Get-ChildItem $glob -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $local) {
        throw "No local nupkg found matching $glob. Run: pwsh -File .\\pack-nuget.ps1"
    }
    $LocalNupkgPath = $local.FullName
}

if (-not (Test-Path $LocalNupkgPath)) {
    throw "Local nupkg not found: $LocalNupkgPath"
}

$downloadDir = Join-Path $repoRoot ".tmp\nuget"
$remote = Download-LatestNuGetNupkg -PackageId $PackageId -DownloadDir $downloadDir -RemoteVersion $RemoteVersion

$work = Join-Path $repoRoot ".tmp\compare"
$localDir = Join-Path $work "local"
$remoteDir = Join-Path $work "remote"

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Ensure-Dir $localDir
Ensure-Dir $remoteDir

Write-Info "Extracting local: $LocalNupkgPath"
Expand-Archive -Path $LocalNupkgPath -DestinationPath $localDir -Force

Write-Info "Extracting remote: $($remote.Path)"
Expand-Archive -Path $remote.Path -DestinationPath $remoteDir -Force

Write-Ok "Local SHA256:  $((Get-FileHash $LocalNupkgPath -Algorithm SHA256).Hash)"
Write-Ok "Remote SHA256: $((Get-FileHash $remote.Path -Algorithm SHA256).Hash)"
Write-Info "Remote version: $($remote.Version)"

$localManifest = Get-Manifest $localDir
$remoteManifest = Get-Manifest $remoteDir

$localPaths = $localManifest.Path
$remotePaths = $remoteManifest.Path

$pathOnly = Compare-Object -ReferenceObject $remotePaths -DifferenceObject $localPaths
$contentDiff = Compare-Object -ReferenceObject $remoteManifest -DifferenceObject $localManifest -Property Path,Sha256,Length -PassThru | Sort-Object Path

Write-Host ""
Write-Info "Path-only differences (added/removed files): $($pathOnly.Count)"
if ($pathOnly.Count -gt 0) {
    $pathOnly | Sort-Object InputObject | Select-Object -First $MaxDiff | ForEach-Object {
        $side = $_.SideIndicator
        if ($side -eq '<=') { "$side REMOTE-ONLY $($_.InputObject)" }
        else { "$side LOCAL-ONLY  $($_.InputObject)" }
    } | Out-Host
    if ($pathOnly.Count -gt $MaxDiff) { Write-Warn "(showing first $MaxDiff)" }
}

Write-Host ""
Write-Info "Content differences (hash/size/path): $($contentDiff.Count)"

$significant = @($contentDiff | Where-Object { -not (Is-ExpectedMetadataPath $_.Path) })
Write-Info "Significant differences (excluding signing/metadata): $($significant.Count)"

if ($significant.Count -gt 0) {
    $significant | Select-Object -First $MaxDiff | ForEach-Object {
        "$($_.SideIndicator) $($_.Path) (len=$($_.Length))"
    } | Out-Host
    if ($significant.Count -gt $MaxDiff) { Write-Warn "(showing first $MaxDiff)" }
} else {
    Write-Ok "No significant content differences detected (only signing/metadata/version artifacts)."
}

# Compare dependencies
$localNuspec = Join-Path $localDir "$PackageId.nuspec"
$remoteNuspec = Join-Path $remoteDir "$PackageId.nuspec"

if ((Test-Path $localNuspec) -and (Test-Path $remoteNuspec)) {
    $localDeps = Get-NuspecDeps $localNuspec
    $remoteDeps = Get-NuspecDeps $remoteNuspec

    Write-Host ""
    Write-Info "Dependencies (local):"
    if ($localDeps.Count -eq 0) { Write-Host "(none)" } else { $localDeps | Out-Host }

    Write-Info "Dependencies (remote):"
    if ($remoteDeps.Count -eq 0) { Write-Host "(none)" } else { $remoteDeps | Out-Host }

    $depDiff = Compare-Object -ReferenceObject $remoteDeps -DifferenceObject $localDeps
    if ($depDiff.Count -eq 0) {
        Write-Ok "Dependency list matches."
    } else {
        Write-Warn "Dependency differences detected:"
        $depDiff | Format-Table SideIndicator,InputObject -AutoSize | Out-Host
    }
}

# Show DLL version metadata for the main binaries, if present
Write-Host ""
$checkPaths = @(
    'lib/net472/Plugins/NameBuilderConfigurator.dll',
    'content/Plugins/NameBuilderConfigurator/Assets/DataversePlugin/NameBuilder.dll'
)

foreach ($p in $checkPaths) {
    $l = Join-Path $localDir ($p -replace '/','\')
    $r = Join-Path $remoteDir ($p -replace '/','\')

    if (Test-Path $l) {
        $li = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($l)
        Write-Info "LOCAL  $p FileVersion=$($li.FileVersion) ProductVersion=$($li.ProductVersion)"
    }
    if (Test-Path $r) {
        $ri = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($r)
        Write-Info "REMOTE $p FileVersion=$($ri.FileVersion) ProductVersion=$($ri.ProductVersion)"
    }
    Write-Host "---"
}

if (-not $KeepTemp) {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Ok "Compare complete."
