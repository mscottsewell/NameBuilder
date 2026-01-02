# NameBuilder (Monorepo)

This repo contains:
- NameBuilderConfigurator/ (XrmToolBox configurator)
- NameBuilderPlugin/ (Dataverse plugin)

## TL;DR

- Build everything:
	- `pwsh -File .\build.ps1`
- Build a local NuGet package (no deploy):
	- `pwsh -File .\pack-nuget.ps1 -SkipDeploy -SkipPluginRebuildIfUnchanged`
- Build + compare local package vs latest published NuGet:
	- `pwsh -File .\compare-nuget.ps1 -BuildLocal`

More details: Docs/BUILDING.md
