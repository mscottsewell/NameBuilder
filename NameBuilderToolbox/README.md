# NameBuilder for Power Platform ToolBox

**Visually design automatic record names for Dataverse — and publish the plugin steps in one click — right inside [Power Platform ToolBox](https://www.powerplatformtoolbox.com/).**

This is the Power Platform ToolBox (PPTB) edition of the NameBuilder Configurator. It replaces the WinForms-based XrmToolBox tool with a sandboxed web tool built on the [PPTB tool APIs](https://docs.powerplatformtoolbox.com/tool-development). The **Dataverse server plugin is unchanged** — this tool produces the exact same JSON configuration and registers the exact same plugin steps as the XrmToolBox configurator, so both tools are fully interchangeable against the same environment.

## What it does

1. **Pick a table** (searchable dropdown, optionally filtered by solution), and optionally a **view** — the view scopes both the column palette and the preview-record picker.
2. **Click columns** to add them as name blocks — text, lookups, dates, numbers, currency, and choice columns are supported.
3. **Configure each block**: prefix/suffix separators, date formats (with `upper:` / `lower:` / `title:` casing transforms and timezone offsets), number/currency formats with K/M/B scaling, default values, per-block truncation, alternate-column fallback chains, and conditional inclusion (`equals`, `contains`, `in`, numeric comparisons, empty checks, with ANY/ALL grouping).
4. **Watch the live preview** update against a real record from your environment, block by block.
5. **Publish** — the tool installs (or updates) the NameBuilder plugin assembly if needed, then creates or updates the synchronous pre-operation steps on **Create** and **Update**, maintains the Update step's **PreImage** and **filtering attributes**, and optionally adds everything to a solution.

The configuration JSON is always visible and editable — **Apply**, **Copy**, **Import…**, and **Export** keep it interchangeable with hand-written configs and with the XrmToolBox configurator.

### Round-trip, defaults, and session persistence

- **Load a deployed configuration** — selecting a table auto-loads the configuration already registered for it (prefers the Update step, falls back to Create), so you can edit what's live instead of starting blank. Use **Reload deployed** in the designer header to pull it again on demand. Auto-load can be turned off in **Field defaults…**.
- **Reusable field defaults** — **Field defaults…** sets a default separator (prefix), suffix, date format, number format, and timezone offset. New blocks inherit them, and changing a default propagates to existing blocks that still use the previous value (the first block never gets a leading separator). "Apply defaults to all existing blocks" forces them onto every block.
- **First-time setup, and resuming where you left off** — the very first time the tool opens against a given connection (no prior session recorded for it), a **Welcome** modal prompts you to pick a solution and a table to begin. On every later load against that same connection, the tool silently restores the last solution filter, table, and in-progress configuration — including any edits that hadn't been published yet — with no prompt. This is tracked per connection, so switching environments always resumes (or starts) independently.
- **Persisted preferences** — field defaults, the auto-load toggle, and per-connection session state (solution/table/configuration) are saved via the ToolBox per-tool settings store (`toolboxAPI.settings`), with a `localStorage` fallback so they also persist in demo mode.

## How it maps to the XrmToolBox configurator

| XrmToolBox (WinForms) | PPTB (this tool) |
| --- | --- |
| `IOrganizationService` SDK calls | `window.dataverseAPI` Web API bridge |
| Bundled `NameBuilder.dll` on disk | Same DLL embedded (base64) in the bundle |
| Reflection over the DLL to find plugin types | Known type `NameBuilder.NameBuilderPlugin` registered directly |
| `RetrieveEntityRequest` / attribute metadata | `EntityDefinitions` OData metadata queries (with graceful degradation) |
| View + sample-record picker dialogs | View selector (scopes the column palette and record picker) |
| Modal dialogs for conditions/alternates | Inline expanding block editors |
| Auto-load published step config on entity select | Same (via `getPublishedConfig`), with a manual **Reload deployed** button |
| Default field properties + propagation, saved to `%APPDATA%` | **Field defaults…** dialog, saved via `toolboxAPI.settings` |

Step registration is identical: `SdkMessageProcessingStep` with **stage 20 (pre-operation), mode 0 (synchronous), rank 1**, unsecure configuration = the JSON, filtering attributes = all referenced columns, and a `PreImage` (alias `PreImage`, on `Target`) for the Update step whose attribute list is merged, never trimmed.

## Development

```bash
npm install
npm run dev      # opens the tool in a browser with built-in DEMO data (no PPTB required)
npm run check    # TypeScript type-check
npm run build    # produces the single-file dist/index.html + dist/icons/
```

Outside PPTB the tool runs in **demo mode** (sample Case and Opportunity tables) so the whole designer can be exercised without a connection; publishing is disabled. Inside PPTB it uses `toolboxAPI` / `dataverseAPI` automatically.

### Testing inside Power Platform ToolBox

1. `npm run build`
2. In PPTB, enable the **Debug Menu** under Settings.
3. Load this folder as a local tool from the Debug section and connect to an environment.

### Updating the embedded plugin DLL

The Dataverse plugin (`NameBuilderPlugin`) is embedded as base64 in `src/generated/plugin-assembly.ts`. After rebuilding the plugin, regenerate it:

```bash
npm run embed-plugin
# or explicitly:
node scripts/embed-plugin.mjs path/to/NameBuilder.dll 1.0.0.0 d3dc72745a5fddc3
```

The publish dialog compares the server's installed assembly version to the embedded one and upgrades it automatically when they differ.

## Publishing to the ToolBox

1. Bump `version` in `package.json`.
2. `npm run build`
3. `npm publish --access public`
4. Submit/refresh via the [Tool Submission Form](https://www.powerplatformtoolbox.com/submit-tool).

The `package.json` doubles as the PPTB tool manifest (`displayName`, `icon`, `main`, `configurations`, `features.minAPI`).

## Project layout

```
NameBuilderToolbox/
├── index.html                  # entry (Vite dev / built shell)
├── package.json                # npm package + PPTB manifest
├── vite.config.ts              # single-file IIFE build for the PPTB sandbox
├── icons/namebuilder.svg       # theme-aware manifest icon (currentColor)
├── scripts/embed-plugin.mjs    # regenerates the embedded plugin DLL module
└── src/
    ├── app.ts                  # bootstrap, theme, layout
    ├── model.ts                # config schema (mirrors the plugin's JSON contract)
    ├── engine.ts               # live-preview engine (port of the plugin runtime)
    ├── formatting.ts           # .NET-style date/number formatting (invariant culture)
    ├── dataverse.ts            # PPTB dataverseAPI data layer (metadata, records, caching)
    ├── demo.ts                 # standalone demo data service
    ├── publish.ts              # assembly install + step/PreImage/solution registration + read-back
    ├── settings.ts             # persisted preferences (toolboxAPI.settings + localStorage)
    ├── controller.ts           # orchestration between panels, model, and data layer
    ├── state.ts                # topic-based store
    ├── generated/plugin-assembly.ts  # embedded NameBuilder.dll (auto-generated)
    └── ui/                     # sidebar, designer, preview, welcome/publish/defaults dialogs, toasts
```

## Documentation

The plugin's configuration schema, pattern examples, and administration guidance are shared with the main repo:

- [JSON Schema Reference](../NameBuilderPlugin/Docs/SCHEMA.md)
- [Fields Array Examples](../NameBuilderPlugin/Docs/EXAMPLES.md)
- [Conditional Fields](../NameBuilderPlugin/Docs/CONDITIONAL_FIELDS.md)
- [Numeric & Currency Formatting](../NameBuilderPlugin/Docs/NUMERIC_CURRENCY_DOCS.md)
- [Administrator Guide](../ADMINISTRATOR.md)

## License

MIT — see [LICENSE](../LICENSE).
