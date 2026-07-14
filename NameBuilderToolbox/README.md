# NameBuilder for Power Platform ToolBox

**Stop typing the same information twice.** NameBuilder visually designs automatic record-name patterns for Dataverse — and publishes them with one click — right inside [Power Platform ToolBox](https://www.powerplatformtoolbox.com/). No code, no manual JSON editing required.

In Dataverse, the primary name field is what users see in lookups, timelines, views, and search results. It's usually built from information that's already on the form somewhere else, so re-typing it is wasted effort — and when it's inconsistent or missing, people waste time opening records just to figure out what they're looking at. NameBuilder assembles that name automatically from the fields that actually matter, every time a record is created or updated.

## Why NameBuilder

- **No code, no manual configuration files.** Build a pattern by clicking or dragging columns into place; the tool generates and publishes the underlying JSON for you.
- **See it before you ship it.** The live preview shows the exact assembled name against a real record from your environment as you build — including which blocks got skipped by a condition, which fell back to a default, and where truncation kicked in.
- **Know what's already been set up.** Tables are grouped into **Configured** and **Unconfigured** everywhere you pick one, so you can see at a glance what already has a pattern and jump straight to editing it.
- **Runs anywhere.** It's a sandboxed web tool — no Windows-only dependencies, no separate install. It follows your Power Platform ToolBox theme (light/dark) automatically.
- **Picks up where you left off.** The tool remembers the table, view, and in-progress configuration you were last working on for each connection, so switching between environments never loses your place.
- **Try it without connecting to anything.** Open the tool outside Power Platform ToolBox and it runs in a demo mode with sample data, so you can explore the whole designer before pointing it at a real environment.

## Features

### Designing a pattern

- **Table picker** — searchable dropdown, optionally scoped to a solution, grouped into **Configured** / **Unconfigured**.
- **View picker** — pick a system or personal view to scope both the column palette and the sample records used for preview.
- **Column palette** — click a column to append it, or **drag it** into the pattern at any position, including between two existing blocks.
- **Reorder blocks** by dragging (the block number or its name/type text both work as drag handles) or with the up/down buttons.
- Per-block configuration:
  - **Prefix / suffix** text, added only when the block produces a value
  - **Date formats**, including `upper:` / `lower:` / `title:` casing transforms (e.g. `upper:MMM` → `JAN`) and a timezone offset for UTC-stored values
  - **Number / currency formats**, including `K` / `M` / `B` scaling (e.g. `0.00M` → `2.50M`)
  - **Default values** for when a column is empty
  - **Alternate-column fallback chains** (e.g. try the contact, then the account, then a literal default)
  - **Conditional inclusion** — simple comparisons or `anyOf` / `allOf` groups, with `equals`, `contains`, `in`, numeric comparisons, and empty checks
  - **Per-block truncation** with a custom indicator
- **Live preview** against a real sample record, with a running character count against your configured maximum.

### Managing configuration

- **Global Configuration** — target field, global max length, plugin trace logging, and which solution publish registers components into (defaults to match your table filter, until you override it).
- **Reusable field defaults** — set a default separator, suffix, date/number format, and timezone once; new blocks inherit them, and changing a default retroactively updates existing blocks that still use the old value.
- **JSON view** — the generated configuration is always readable and editable: **Apply** your own edits, **Copy**, **Import** a file, or **Export** one. Fully interchangeable with hand-written or XrmToolBox-authored configurations.
- **Auto-loads what's already deployed** when you pick a table, so you're editing what's live instead of starting from scratch — with a manual **Reload deployed** option too.
- **Resumes your session** per connection: the last solution filter, table, view, and in-progress configuration (including unpublished edits) come back automatically the next time you open the tool against that environment. The first time you connect to a new environment, a short welcome prompt helps you pick a solution and table to start with.

### Publishing

One click installs (or upgrades) the NameBuilder plugin assembly if needed, registers the synchronous **Create** and **Update** steps, maintains the Update step's **PreImage** and filtering attributes, and optionally adds everything to a solution for ALM. The tool detects when the server's plugin version differs from what's bundled and offers to upgrade it automatically.

## Getting started

1. **Install** the tool in Power Platform ToolBox and connect to your environment.
2. **Pick a table** — optionally filter by solution, and check whether it's already **Configured**.
3. **Add columns** to the pattern by clicking or dragging them from the column palette.
4. **Configure each block** — prefix/suffix, format, defaults, conditions — and watch the **live preview** update against a real record.
5. Fine-tune **Global Configuration** and **field defaults** as needed.
6. **Publish** — the tool handles the plugin assembly and step registration for you.
7. Create or update a record on that table and confirm the name populates automatically.

## Compatible with the XrmToolBox configurator

If you or your team already uses the XrmToolBox **NameBuilder Configurator**, this tool is a drop-in alternative, not a replacement you need to migrate away from. Both produce the exact same JSON configuration and register the exact same Dataverse plugin steps — the underlying server plugin is entirely unchanged — so you can freely switch between the two tools against the same environment, or have different team members use whichever one they prefer.

> **Known Dataverse quirk**: publishing an Update step's PreImage occasionally fails with `0x80040216: An unexpected error occurred` — this is a server-side platform bug, not a data or permissions problem, and both tools work around it the same way (by recreating the image instead of updating it in place). If you see it, just retry the publish.

---

## For developers

### Development

```bash
npm install
npm run dev      # opens the tool in a browser with built-in DEMO data (no PPTB required)
npm run check    # TypeScript type-check
npm run build    # produces the single-file dist/index.html + dist/icons/
```

Outside PPTB the tool runs in **demo mode** (sample Case and Opportunity tables) so the whole designer can be exercised without a connection; publishing is disabled. Inside PPTB it uses `toolboxAPI` / `dataverseAPI` automatically.

#### Testing inside Power Platform ToolBox

1. `npm run build`
2. In PPTB, enable the **Debug Menu** under Settings.
3. Load this folder as a local tool from the Debug section and connect to an environment.

#### Updating the embedded plugin DLL

The Dataverse plugin (`NameBuilderPlugin`) is embedded as base64 in `src/generated/plugin-assembly.ts`. After rebuilding the plugin, regenerate it:

```bash
npm run embed-plugin
# or explicitly:
node scripts/embed-plugin.mjs path/to/NameBuilder.dll 1.0.0.0 d3dc72745a5fddc3
```

The publish dialog compares the server's installed assembly version to the embedded one and upgrades it automatically when they differ.

### Publishing to the ToolBox

1. This branch/PR must be merged to `main` first — `configurations.readmeUrl` points at the raw GitHub README on `main`, and `pptb-validate` (and the ToolBox registry) require it to actually resolve.
2. Bump `version` in `package.json` — npm never lets you republish an already-used version number.
3. `npm shrinkwrap` — regenerates `npm-shrinkwrap.json` from `package-lock.json` with the new version. **Required**: the PPTB Tool Submission Form's own `structure_validation` check rejects packages without it, separately from anything `pptb-validate` checks locally. Unlike `package-lock.json` (which npm always excludes from published tarballs), `npm-shrinkwrap.json` actually ships — but only because it's explicitly listed in `files` below; npm doesn't include it automatically just for existing.
4. `npm run build`
5. `npm run validate` (runs `pptb-validate`) — must show `✔ Validation passed` with no errors.
6. `npm login` (first time only), then `npm publish --access public`. Sanity-check with `npm pack --dry-run` first if you want to see exactly what will ship — `npm-shrinkwrap.json` should be in the "Tarball Contents" list.
7. Install from npm in PPTB's Debug menu and smoke-test the published package before submitting.
8. Submit/refresh via the [Tool Submission Form](https://www.powerplatformtoolbox.com/submit-tool) (package name + up to 3 category tags). Automated + manual review typically takes 48–72 hours.

The `package.json` doubles as the PPTB tool manifest (`displayName`, `icon`, `main`, `configurations`). A package-local [LICENSE](LICENSE) file is required alongside the root repo license, since npm only packages files inside this directory. `files` explicitly lists `dist` and `npm-shrinkwrap.json` — npm's own always-included files (`package.json`, `README.md`, `LICENSE`) ship regardless of `files`, but the shrinkwrap does not.

The manifest intentionally omits `features` — NameBuilder always operates against a single Dataverse connection and never uses a secondary one, so per the manifest docs ("omit this section entirely if neither field applies") there's nothing to declare.

### Project layout

```
NameBuilderToolbox/
├── index.html                  # entry (Vite dev / built shell)
├── package.json                # npm package + PPTB manifest
├── vite.config.ts              # single-file IIFE build for the PPTB sandbox
├── icons/namebuilder.svg       # manifest icon
├── scripts/embed-plugin.mjs    # regenerates the embedded plugin DLL module
└── src/
    ├── app.ts                        # bootstrap, theme, layout
    ├── model.ts                      # config schema (mirrors the plugin's JSON contract)
    ├── engine.ts                     # live-preview engine (port of the plugin runtime)
    ├── formatting.ts                 # .NET-style date/number formatting (invariant culture)
    ├── dataverse.ts                  # PPTB dataverseAPI data layer (metadata, records, caching)
    ├── demo.ts                       # standalone demo data service
    ├── publish.ts                    # assembly install + step/PreImage/solution registration + read-back
    ├── settings.ts                   # persisted preferences (toolboxAPI.settings + localStorage)
    ├── controller.ts                 # orchestration between panels, model, and data layer
    ├── state.ts                      # topic-based store
    ├── generated/plugin-assembly.ts  # embedded NameBuilder.dll (auto-generated)
    └── ui/                           # sidebar, config pane (Configuration/Properties/JSON tabs),
                                       # welcome/publish dialogs, drag-and-drop, toasts
```

### Documentation

The plugin's configuration schema, pattern examples, and administration guidance are shared with the main repo:

- [JSON Schema Reference](../NameBuilderPlugin/Docs/SCHEMA.md)
- [Fields Array Examples](../NameBuilderPlugin/Docs/EXAMPLES.md)
- [Conditional Fields](../NameBuilderPlugin/Docs/CONDITIONAL_FIELDS.md)
- [Numeric & Currency Formatting](../NameBuilderPlugin/Docs/NUMERIC_CURRENCY_DOCS.md)
- [Administrator Guide](../ADMINISTRATOR.md)

### License

MIT — see [LICENSE](LICENSE).
