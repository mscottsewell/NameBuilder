# NameBuilder Monorepo – Build & Packaging Reference

This repo is a monorepo containing:

- `NameBuilderConfigurator/` – the XrmToolBox configurator (packaged as a NuGet package)
- `NameBuilderPlugin/` – the Dataverse plugin DLL (copied into configurator Assets for packaging)

This doc covers the local scripts and common usage patterns.

## Quick Start (Most Common)

### Build everything (local)

```powershell
pwsh -File .\build.ps1
```

### Build a local NuGet package (no deploy, no NuGet push)

```powershell
pwsh -File .\build.ps1 -Pack -SkipDeploy -SkipPluginRebuildIfUnchanged
```

## Common Scenarios (Recommended)

All scenarios below use the single entrypoint: `build.ps1`.

Plugin version rules:

- Plugin `AssemblyVersion` is never changed.
- Plugin `AssemblyFileVersion` is bumped **only if the plugin was modified in the last commit** (committed changes).

### 1) Rebuild everything + package + deploy to local XrmToolBox only

```powershell
pwsh -File .\build.ps1 -Configuration Release -Pack -SkipVersionBump
```

### 2) Rebuild everything + package + deploy to local XrmToolBox only + bump configurator build number

```powershell
pwsh -File .\build.ps1 -Configuration Release -Pack
```

### 3) Rebuild everything + package + deploy to local XrmToolBox + push to NuGet

```powershell
pwsh -File .\build.ps1 -Configuration Release -Pack -Push -SkipVersionBump
```

### 4) Rebuild everything + package + deploy to local XrmToolBox + push to NuGet + bump configurator build number

```powershell
pwsh -File .\build.ps1 -Configuration Release -Pack -Push
```

Notes:

- To **skip configurator version bump** (keep package version unchanged), add `-SkipVersionBump`.
- If you use `-Push` with `-SkipVersionBump`, NuGet may reject the upload if that package version already exists.
- To **force no plugin version metadata changes** (even if committed plugin changes exist), add `-SkipPluginFileVersionBump`.
- To **avoid local deployment**, add `-SkipDeploy`.

### Compare your local nupkg to the latest published package

```powershell
pwsh -File .\compare-nuget.ps1 -BuildLocal
```

## Scripts (What They Do)

### `build.ps1` (repo root)

Unified build/pack orchestrator for the monorepo.

#### What it does

- Builds the plugin and/or configurator (based on `-PluginOnly` / `-ConfiguratorOnly`)
- Ensures the plugin payload is present under `NameBuilderConfigurator/Assets/DataversePlugin`
- Optionally packs the configurator into a `.nupkg` under `artifacts/nuget/` (enable with `-Pack`)
- Optionally deploys to local XrmToolBox (disable with `-SkipDeploy`)
- Optionally pushes the `.nupkg` to NuGet (enable with `-Push`)

By default (no `-Pack`), `build.ps1` runs build-only and avoids modifying version metadata.

#### Common usage (build.ps1)

- Build both:

  ```powershell
  pwsh -File .\build.ps1 -Configuration Release
  ```

- Only plugin:

  ```powershell
  pwsh -File .\build.ps1 -PluginOnly
  ```

- Only configurator:

  ```powershell
  pwsh -File .\build.ps1 -ConfiguratorOnly
  ```

- Build configurator + also pack it:

  ```powershell
  pwsh -File .\build.ps1 -ConfiguratorOnly -Pack
  ```

#### Key options

- `-Pack`
  - Enables NuGet packaging (default is build-only)
- `-NoPack` (alias: `-BuildOnly`)
  - Runs build steps only (no `.nupkg` creation)
- `-NoBuild` (alias: `-PackOnly`)
  - Packs using existing build outputs (fails if the expected DLLs are missing)
- `-DryRun`
  - Prints what the script *would* do (build/pack/push/deploy/version bump) and exits
- `-SkipVersionBump`
  - Skips configurator version bump (and therefore keeps the package version unchanged)
- `-SkipPluginFileVersionBump`
  - Prevents changing plugin version metadata
- `-SkipPluginRebuildIfUnchanged`
  - Skips plugin project build if no changes are detected (still ensures a plugin DLL exists in assets)
- `-SkipDeploy`
  - Prevents local deployment into XrmToolBox
- `-Push`
  - Opt-in NuGet push

#### Versioning rules implemented

- Configurator version (package version):
  - Bumps automatically unless `-SkipVersionBump`
- Plugin version:
  - `AssemblyVersion` stays unchanged
  - `AssemblyFileVersion` is bumped only if the plugin was modified in the last commit (unless `-SkipPluginFileVersionBump`)

### `compare-nuget.ps1` (repo root)

Downloads the latest published NuGet package and compares it to your local package.

#### What it reports

- Path-only differences (files added/removed)
- Content differences (hash/size), with an additional “significant” section that filters out expected signing/metadata noise
- Dependencies declared in the `.nuspec`
- File version metadata for key DLLs inside the package

#### Common usage (compare-nuget.ps1)

- Build local (safe) + compare:

  ```powershell
  pwsh -File .\compare-nuget.ps1 -BuildLocal
  ```

- Compare without rebuilding (uses newest local `artifacts/nuget/NameBuilderConfigurator.*.nupkg`):

  ```powershell
  pwsh -File .\compare-nuget.ps1
  ```

- Compare against a specific NuGet version:

  ```powershell
  pwsh -File .\compare-nuget.ps1 -RemoteVersion 1.2025.1.110
  ```

- Keep extracted temp output for inspection:

  ```powershell
  pwsh -File .\compare-nuget.ps1 -BuildLocal -KeepTemp
  ```

## CI Workflows

Workflows normally live under `.github/workflows/`.

They are currently disabled in this repo by moving them to `.github/workflows-disabled/`:

- `.github/workflows-disabled/build-configurator.yml` – triggers when `NameBuilderConfigurator/**` changes
- `.github/workflows-disabled/build-plugin.yml` – triggers when `NameBuilderPlugin/**` changes

These restore/build using the root solution `NameBuilder.sln`.

## Notes / Gotchas

### Generated plugin payload

`NameBuilderConfigurator/Assets/DataversePlugin/*.dll` and `*.pdb` are treated as generated and ignored by git.

- This keeps your working tree clean after builds.
- Packaging still includes the files because `nuget pack` uses the working directory files, not git tracking.

### “My build changed files”

Some scripts can update `AssemblyInfo.cs` unless you pass `-SkipVersionBump`.

- If you want repeatable comparisons, always include `-SkipVersionBump`.

### NuGet API key handling

If you ever choose to push from automation:

- Prefer storing `NUGET_API_KEY` as a secret (never commit it).
- Don’t paste API keys into issues/PRs/chat logs; rotate them if exposed.

## Troubleshooting

- **MSBuild not found** (configurator build)
  - Install Visual Studio with “.NET desktop development” workload
- **Plugin build skipped but DLL missing**
  - Remove `-SkipPluginRebuildIfUnchanged` for one run, or ensure the plugin has been built at least once
- **Compare script can’t download a NuGet version**
  - Use `-RemoteVersion` to force a specific version, or rerun to pick the next available
