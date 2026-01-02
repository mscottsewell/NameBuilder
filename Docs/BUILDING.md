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
pwsh -File .\pack-nuget.ps1 -SkipDeploy -SkipPluginRebuildIfUnchanged
```

### Compare your local nupkg to the latest published package
```powershell
pwsh -File .\compare-nuget.ps1 -BuildLocal
```

## Scripts (What They Do)

### `build.ps1` (repo root)
Orchestrates the two component builds.

**What it does**
- Builds the plugin via `NameBuilderPlugin/build.ps1` and copies `NameBuilder.dll` into `NameBuilderConfigurator/Assets/DataversePlugin`
- Builds the configurator via `NameBuilderConfigurator/build.ps1`

**Common usage**
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

### `pack-nuget.ps1` (repo root)
Builds and packages `NameBuilderConfigurator` into a `.nupkg` under `artifacts/nuget/`.

**Default behavior**
- Always builds (and refreshes) the plugin payload into the configurator `Assets/DataversePlugin` folder
- Builds the configurator
- Packs `NameBuilderConfigurator/NameBuilderConfigurator.nuspec`
- **Does not push to NuGet unless you pass `-Push`**

**Key options**
- `-SkipVersionBump`
  - Leaves AssemblyInfo versions unchanged
  - Useful for repeatable comparisons/CI
- `-SkipPluginRebuildIfUnchanged`
  - If the plugin folder has no git changes (and wasn’t modified in the last commit), the plugin project build is skipped
  - The script still ensures a plugin DLL exists and is copied into the assets folder
- `-SkipDeploy`
  - Prevents local deployment into XrmToolBox
- `-Push`
  - Opt-in NuGet push (normally you won’t use this if you only push locally)

**Common usage patterns**
- Local pack (safe defaults):
  ```powershell
  pwsh -File .\pack-nuget.ps1 -SkipDeploy -SkipPluginRebuildIfUnchanged
  ```
- Local pack without any version changes:
  ```powershell
  pwsh -File .\pack-nuget.ps1 -SkipDeploy -SkipVersionBump -SkipPluginRebuildIfUnchanged
  ```

**Versioning rules implemented**
- Configurator version:
  - Bumps automatically unless `-SkipVersionBump`
- Plugin version:
  - `AssemblyVersion` stays unchanged
  - `AssemblyFileVersion` is bumped **only if the plugin project changed**

### `compare-nuget.ps1` (repo root)
Downloads the latest published NuGet package and compares it to your local package.

**What it reports**
- Path-only differences (files added/removed)
- Content differences (hash/size), with an additional “significant” section that filters out expected signing/metadata noise
- Dependencies declared in the `.nuspec`
- File version metadata for key DLLs inside the package

**Common usage**
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

The repo includes GitHub Actions workflows that build on changes:
- `.github/workflows/build-configurator.yml` – triggers when `NameBuilderConfigurator/**` changes
- `.github/workflows/build-plugin.yml` – triggers when `NameBuilderPlugin/**` changes

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
