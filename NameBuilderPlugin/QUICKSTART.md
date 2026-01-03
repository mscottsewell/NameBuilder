# NameBuilder Plugin – Manual Deployment Quick Start

This guide is for developers who need to manually register the NameBuilder plugin using the Plugin Registration Tool.

**For most users**: The [XrmToolBox Configurator](../README.md) handles plugin deployment automatically—use that instead.

**For developers extending the plugin**: See [README.md](README.md) for architecture and development details.

## Prerequisites

- Visual Studio 2019 or later
- .NET Framework 4.6.2 or later
- Plugin Registration Tool ([download here](https://aka.ms/pluginregistrationtool))
- Access to a Dataverse environment with System Administrator or System Customizer role

## Build and Deploy in 5 Steps

### 1. Build the Plugin

From the repo root (recommended):

```powershell
pwsh -File .\build.ps1 -Configuration Release -PluginOnly
```

Or from the plug-in folder:

```powershell
pwsh -File .\NameBuilderPlugin\build.ps1 -Configuration Release
```

The compiled DLL will be at: `NameBuilderPlugin\bin\Release\net462\NameBuilder.dll`

### 2. Open Plugin Registration Tool

1. Download from: <https://aka.ms/pluginregistrationtool>
2. Connect to your Dataverse environment
3. Click **Register** > **Register New Assembly**

### 3. Register the Assembly

1. Click **Browse** and select `NameBuilder.dll`
2. Select **Sandbox** isolation mode
3. Click **Register Selected Plugins**

### 4. Create Your Configuration

**Simple Pattern-Based Configuration:**

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid"
}
```

**Result:** `2025-12-01 | John Smith`

**Notes:**

- `maxLength` is auto-detected from the `name` field metadata
- Field types (`date`, `lookup`) are auto-detected from metadata
- You can override by explicitly setting `maxLength` or using `:type` syntax

**Enable Tracing (optional):**

Add `enableTracing: true` in your JSON configuration to emit additional trace messages to the Plugin Trace Log. This is helpful when verifying whether fields (e.g., `estimatedvalue`, `transactioncurrencyid`) are present in the Target/PreImage during execution.

```json
{
   "targetField": "name",
   "pattern": "createdon | ownerid",
   "enableTracing": true
}
```

Set `enableTracing` back to `false` (or remove it) for normal operation.

### 5. Register the Step

#### For Create Message  

1. Right-click **NameBuilderPlugin** in the tool
2. Click **Register New Step**
3. Configure:
   - **Message**: `Create`
   - **Primary Entity**: Your entity (e.g., `account`)
   - **Event Pipeline Stage**: `PreOperation`
   - **Execution Mode**: `Synchronous`
   - **Unsecure Configuration**: Paste your JSON configuration
4. Click **Register New Step**

#### For Update Message (Optional)

1. Right-click **NameBuilderPlugin** again
2. Click **Register New Step**
3. Configure:
   - **Message**: `Update`
   - **Primary Entity**: Your entity
   - **Filtering Attributes**: Select fields from your configuration
   - **Event Pipeline Stage**: `PreOperation`
   - **Execution Mode**: `Synchronous`
   - **Unsecure Configuration**: Same JSON configuration
4. Click **Register New Step**
5. **Important**: Right-click the new step > **Register New Image**
   - **Image Type**: `PreImage`
   - **Name**: `PreImage`
   - **Entity Alias**: `PreImage`
   - **Attributes**: Select all the fields used by your configuration. (or just select 'All Attributes')
   - Tip: Use `enableTracing` to confirm the image contains your fields during execution.

## Test the Plugin

### Test on Create

1. Open your Dataverse environment
2. Create a new record of your entity
3. The `name` field should automatically populate based on your configuration

### Test on Update

1. Open an existing record
2. Modify one of the configured fields (e.g., change the owner)
3. Save the record
4. The `name` field should update automatically

## Troubleshooting

### Plugin doesn't fire

- Check Plugin Trace Log in Dataverse
- Verify the step is registered correctly
- Ensure filtering attributes include your fields (for Update)

### Name field is empty

- Verify field names in configuration are correct (logical names)
- Check that fields have values
- Review Plugin Trace Log for errors

### Error messages

- Open **Plugin Trace Log** in Dataverse
- Look for entries with your plugin name
- Check error details and stack trace

## Common Field Names Reference

### Contact

- `firstname`, `lastname`, `fullname`
- `emailaddress1`, `telephone1`
- `parentcustomerid` (Account lookup)
- `ownerid` (User/Team lookup)

### Account

- `name`, `accountnumber`
- `primarycontactid` (Contact lookup)
- `ownerid` (User/Team lookup)
- `accountcategorycode`, `industrycode` (optionsets)

### Case (Incident)

- `title`, `ticketnumber`
- `customerid` (Account/Contact lookup)
- `prioritycode`, `caseorigincode` (optionsets)

### Common System Fields

- `createdon`, `modifiedon` (datetime)
- `createdby`, `modifiedby` (User lookup)
- `ownerid` (User/Team lookup)
- `statecode`, `statuscode` (optionsets)

## Next Steps

**For configuration examples and patterns:**

- [Docs/EXAMPLES.md](Docs/EXAMPLES.md) – Fields array configuration examples
- [Docs/PATTERN_EXAMPLES.md](Docs/PATTERN_EXAMPLES.md) – Pattern-based configuration examples
- [Docs/CONDITIONAL_FIELDS.md](Docs/CONDITIONAL_FIELDS.md) – Conditional logic and operators
- [Docs/NUMERIC_CURRENCY_DOCS.md](Docs/NUMERIC_CURRENCY_DOCS.md) – Number and currency formatting
- [Docs/SCHEMA.md](Docs/SCHEMA.md) – Complete JSON schema reference

**For understanding and managing the plugin:**

- [README.md](README.md) – Plugin architecture and developer documentation
- [../ADMINISTRATOR.md](../ADMINISTRATOR.md) – Reviewing, troubleshooting, and uninstalling
- [../README.md](../README.md) – Getting started guide for end users
