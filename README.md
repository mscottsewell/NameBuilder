# NameBuilder (Monorepo)

This repo contains:
- NameBuilderConfigurator/ (XrmToolBox configurator)
- NameBuilderPlugin/ (Dataverse plugin)

## TL;DR

- Build everything:
	- `pwsh -File .\build.ps1`
- Build a local NuGet package (no deploy):
	- `pwsh -File .\build.ps1 -Pack -SkipDeploy -SkipPluginRebuildIfUnchanged`

Notes:
- `build.ps1` is the unified build/pack script.
- Use `-Pack` to enable NuGet packaging (default is build-only).
- Use `-NoBuild`/`-NoPack` (aliases: `-PackOnly`/`-BuildOnly`) to switch modes.
- Common scenario commands are in `Docs/BUILDING.md`.
- Build + compare local package vs latest published NuGet:
	- `pwsh -File .\compare-nuget.ps1 -BuildLocal`

More details: Docs/BUILDING.md
