# Copilot Instructions — NameBuilder

## Build Commands

All builds use the root orchestrator. Requires PowerShell 7+ (`pwsh`).

```powershell
# Build everything (both projects)
pwsh -File .\build.ps1

# Build only the Dataverse plugin
pwsh -File .\build.ps1 -PluginOnly

# Build only the XrmToolBox configurator
pwsh -File .\build.ps1 -ConfiguratorOnly

# Build + create NuGet package (no deploy, no push)
pwsh -File .\build.ps1 -Pack -SkipDeploy

# Build + pack + deploy to local XrmToolBox
pwsh -File .\build.ps1 -Configuration Release -Pack

# Preview what a build would do without making changes
pwsh -File .\build.ps1 -DryRun
```

There are no automated tests. Validation is done via XrmToolBox live preview and Dataverse Plugin Trace Log.

## Architecture

This is a monorepo with two tightly coupled .NET Framework projects that ship together as a single NuGet package:

### NameBuilderPlugin (`net462`) — Dataverse Server-Side Plugin
A sandboxed `IPlugin` that runs during **PreOperation** on Create/Update messages. It reads a JSON configuration from the plugin step's unsecure config, resolves field values from the entity Target (and PreImage on Update), and assembles a computed string into the target field (typically `name`).

**Execution flow:** `NameBuilder.Execute()` → parse config → check `ShouldTrigger()` → for each `PatternPart`: evaluate `IncludeIf` conditions via `ConditionEvaluator` → resolve value via `FieldValueResolver` (type-specific: string/lookup/date/number/currency/optionset) → apply prefix/suffix/truncation → set target field.

Key classes:
- `NameBuilder` — plugin entry point (`IPlugin.Execute`)
- `PluginConfiguration` — JSON deserialization + caching (uses `DataContractJsonSerializer`, not Newtonsoft)
- `FieldValueResolver` — type-specific field resolution with static `ConcurrentDictionary` caches for metadata
- `ConditionEvaluator` — recursive condition evaluation (`anyOf`/`allOf`/single operators)
- `PatternParser` — parses simple pattern strings like `"createdon:date | ownerid:lookup"`
- `FieldArrayParser` — parses structured `fields[]` JSON arrays

### NameBuilderConfigurator (`net48`) — XrmToolBox UI Tool
A WinForms-based XrmToolBox plugin (discovered via MEF export) that provides a visual designer for building plugin configurations. It connects to Dataverse, loads metadata, and lets users compose field blocks, configure conditions, preview output against live records, and publish JSON config directly to plugin steps.

Key classes:
- `NameBuilderConfiguratorPlugin` — MEF entry point for XrmToolBox
- `NameBuilderConfiguratorControl` — main UI control (inherits `PluginControlBase`)
- `FieldBlockControl` — visual representation of one `FieldConfiguration` in a `FlowLayoutPanel`
- `FieldConfiguration` — data model for per-field settings (DataContract)
- `PluginAssemblyInstaller` — validates, uploads, and registers the plugin DLL in Dataverse
- Dialog classes — modal editors for field properties, conditions, alternate fields, publish targets

### How They Connect
The plugin DLL is built first and copied into `NameBuilderConfigurator/Assets/DataversePlugin/`. The configurator NuGet package bundles both DLLs. The configurator can deploy the embedded plugin DLL to Dataverse via `PluginAssemblyInstaller`.

## Conventions

### Versioning
- **Plugin `AssemblyVersion`** stays fixed at `1.0.0.0` to avoid assembly binding issues in the Dataverse sandbox. Only `AssemblyFileVersion` is bumped (automatically by `build.ps1` if the plugin was modified in the last commit).
- **Configurator version** drives the NuGet package version. Bumped automatically unless `-SkipVersionBump`.
- Version metadata lives in `Properties/AssemblyInfo.cs` (not auto-generated; `GenerateAssemblyInfo` is false in both `.csproj` files).

### Configuration Format
The plugin supports two JSON configuration modes:
- **Pattern string**: `"pattern": "createdon:date:yyyy-MM-dd | ownerid:lookup"` — simple pipe-delimited syntax parsed by `PatternParser`
- **Structured fields array**: `"fields": [{ "field": "name", "type": "string", ... }]` — parsed by `FieldArrayParser`

Both modes produce a `List<PatternPart>` internally. JSON keys use **camelCase**. Deserialization uses `DataContractJsonSerializer` (System.Runtime.Serialization), not Newtonsoft.Json (the configurator uses Newtonsoft, but the plugin does not).

### Caching
The plugin uses static `ConcurrentDictionary` caches that persist across executions in the Dataverse sandbox:
- Configuration cache (keyed by raw JSON string)
- Option set label cache (`entity|attribute|value` → label)
- Primary name attribute cache (`entityLogicalName` → attribute name)
- Field type cache (`entity|field` → `AttributeTypeCode`)
- Currency symbol cache (`Guid` → symbol string)

These caches have no size limits or TTL — be aware of this when modifying caching logic.

### Error Handling
- **Plugin**: top-level try-catch wraps `Execute()`, re-throws as `InvalidPluginExecutionException`. Field resolution errors fall back to alternate fields, then default values. Metadata call failures are caught and degraded gracefully.
- **Configurator**: uses XrmToolBox's `WorkAsync()` for background operations. `DiagnosticLog` writes to `%APPDATA%` for UI-level logging.
- `enableTracing` config flag controls plugin verbosity. When disabled, a `NullTracingService` avoids string formatting overhead.

### Assembly Signing
Both projects are strong-named using `NameBuilder.snk` at the repo root.

### Naming
- Namespaces: `NameBuilder` (plugin), `NameBuilderConfigurator` (configurator)
- Public properties: PascalCase. Private fields: `_camelCase`.
- JSON config keys: camelCase.

### Plugin SDK Patterns
The plugin targets Dataverse SDK v9.0.2.56 (`Microsoft.CrmSdk.CoreAssemblies`). It uses:
- `IPlugin`, `ITracingService`, `IPluginExecutionContext`, `IOrganizationServiceFactory`
- `Entity`, `EntityReference`, `OptionSetValue`, `Money` for field value access
- `RetrieveAttributeRequest` / `RetrieveEntityRequest` for metadata queries
- `FormattedValues` collection for pre-formatted option set labels
- PreImage alias is always `"PreImage"`
