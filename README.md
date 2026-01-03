<img width="1800"  alt="image" src="https://github.com/user-attachments/assets/ab2b9728-5b66-48e5-9b81-14b9c4edc019" />

---

**NameBuilder** builds a record's primary name from other fields on the record using a fast, configuable, flexible and easy-to-deploy Dataverse plugin. <br> **The NameBuilder Configurator** give you a simple way to construct, preview and deploy the plugin from within the XrmToolBox - without writing code.

<img width="1258" alt="image" src="https://github.com/user-attachments/assets/ce3dfec3-f4a2-4e7b-9281-8d3df2254ec2" />

## Overview

NameBuilder Configurator is an XrmToolBox plug-in that:

- Reads entity metadata, views, and sample records directly from Dataverse.
- Visualizes the NameBuilder JSON schema as draggable field blocks with per-block property panes.
- Offers dialogs for include-if conditions and default-if-blank fallbacks.
- Publishes JSON payloads back to the NameBuilder Create/Update steps without leaving XrmToolBox.
  
## Feature Highlights

- 🔌 **Connection-aware startup** – Reuses your XrmToolBox connection, validates that the NameBuilder assembly exists, and surfaces hash mismatches before publishing.
- 📋 **Solution-scoped entity browser** – Filter entities by Dataverse solution, load metadata and views, pick sample records, and double-click attributes to insert them.
- 🎯 **Solution-based deployment** – Select an unmanaged solution to organize NameBuilder plugin assemblies and steps; prevents duplicate step registrations per entity.
- ✨ **Visual block editor** – Manage ordered field blocks with drag handles (▲/▼), move buttons, deletion, and inline summaries showing configured properties.
- ⚙️ **Reusable defaults** – Persist global prefix, suffix, number/date formats, and timezone offsets in `%APPDATA%\NameBuilderConfigurator\settings.json`; automatically propagate changes to untouched blocks.
- 🧮 **Default-if-blank dialog** – Select alternate attributes or literal defaults from one dialog, backed by a read-only behavior summary in the property pane showing the fallback chain.
- 🧱 **Condition builder** – Compose simple field comparisons or nested `anyOf`/`allOf` trees with support for operators like `equals`, `contains`, `isNull`, etc.
- 📄 **Import/export/publish** – Round-trip JSON files, copy payloads to the clipboard, retrieve existing configurations from Dataverse steps, or publish directly back to Create/Update steps.
- 🔍 **Live preview** – See assembled name strings in real-time as you edit, using selected sample record data.
- 🧰 **Plug-in validation & deployment** – Check NameBuilder assembly presence, verify version hashes, and deploy/update the plug-in from within the tool.
- 🧰 **Scripted build pipeline** – `build.ps1` restores packages, compiles, deploys to the local XrmToolBox folder, and mirrors outputs into `Ready To Run/`.

## Why use it?

In many Dataverse implementations, the primary name is the thing users search for, select in lookups, see in timelines, and scan in views. If that name is inconsistent (or manually maintained), users spend time opening records just to confirm what they’re looking at.

NameBuilder helps you:

- **Standardize naming** across tables so users recognize records at a glance.
- **Reduce manual data entry** by computing names automatically on Create/Update.
- **Improve search and usability** by including the most important context (customer, dates, status, identifiers).
- **Keep names accurate over time** as key fields change.

Common patterns include:

- Case/incident titles like `CASE-{ticketnumber} | {customer} | {priority}`
- Opportunities like `{account} - {estimatedvalue} - {closeprobability}%`
- Projects/requests like `{requestedby} | {createdon} | {category}`

## Key features

- **Visual designer in XrmToolBox**: build the name without writing code.
- **Live preview**: test against sample records before publishing.
- **Formatting**: dates, numbers, and currency formatting (including K/M/B scaling).
- **Fallbacks**: default-if-blank and alternate field chains.
- **Conditions**: include/exclude blocks using `includeIf` rules (supports `anyOf`/`allOf`).
- **Efficient updates**: Update steps use filtering attributes so the plug-in runs only when relevant fields change.

For almost everyone, you use it through **XrmToolBox**:

1. Install **NameBuilder Configurator** from the XrmToolBox Tool Library.
2. Connect to your Dataverse environment.
3. Design your name pattern visually.
4. Publish the JSON configuration back to the Create/Update plug-in steps.

This repository contains two parts:

- [NameBuilderConfigurator](NameBuilderConfigurator) — XrmToolBox plug-in (visual designer + publisher)
- [NameBuilderPlugin](NameBuilderPlugin) — Dataverse server plug-in (runtime that builds the name)

## Quick Start (XrmToolBox)

### 1) Install the tool

1. Open XrmToolBox.
2. Go to **Configuration ➜ Tool Library**.
3. Search for **NameBuilder Configurator**.
4. Click **Install**, then restart XrmToolBox if prompted.

### 2) Connect and open NameBuilder Configurator

1. Use the XrmToolBox connection wizard to connect to your Dataverse org.
2. Open **NameBuilder Configurator** from the tools list.

On startup, the tool validates that the **NameBuilder server plug-in** is present in the environment. If it isn't, the tool will prompt you to install/update it.

### 3) Create a configuration

Typical workflow:

1. Click **Load Metadata**.
2. Select an entity you want to configure (optional: scope the list by choosing a Solution).
3. (Optional) Choose a view and a sample record to drive the live preview.
4. Double-click attributes to add them as field blocks.
5. Configure formatting, defaults/fallbacks, and conditions:
	- Prefix/suffix
	- Date/number/currency formats
	- Default-if-blank (alternate field chains or literal defaults)
	- includeIf (conditions; supports `anyOf`/`allOf` trees)
6. Watch the **Live preview** update as you edit.

### 4) Publish to Dataverse

1. Click **Publish Configuration**.
2. Choose whether to publish to **Create**, **Update**, or both.

The configurator writes:

- The JSON into the step configuration.
- The Update step filtering attributes (so it only runs when relevant fields change).
- Any required image settings (e.g., Pre-Image) when needed for Update scenarios.

### 5) Test

- Create a record: the `name` field should be built automatically.
- Update one of the configured fields: the `name` field should refresh.

## Common Questions

### “It says the NameBuilder plug-in isn’t installed.”

Click **Publish Configuration**. If the server plug-in is missing or needs repair, the configurator will prompt you to install/update it as part of the publish flow.

### “Why doesn’t Update change the name?”

Most commonly:

- The Update step filtering attributes don’t include the field you changed.
- A needed Pre-Image attribute is missing.
- Your `includeIf` logic excluded a block.

Re-publish from the configurator to have it keep the step settings in sync.

## Documentation

- XrmToolBox user guide: [NameBuilderConfigurator/Docs/USAGE.md](NameBuilderConfigurator/Docs/USAGE.md)
- Plug-in configuration and features: [NameBuilderPlugin/README.md](NameBuilderPlugin/README.md)
- Plug-in docs (examples, schema, conditional fields): [NameBuilderPlugin/Docs](NameBuilderPlugin/Docs)

## Building / contributing

Most users do not need this. If you want to build from source or package the XrmToolBox plug-in, start here:

- [Docs/BUILDING.md](Docs/BUILDING.md)

## License

See [LICENSE](LICENSE).
