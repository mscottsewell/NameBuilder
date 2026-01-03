# NameBuilder Administrator Guide

This guide is for Dataverse administrators who need to understand, review, troubleshoot, or uninstall NameBuilder components in their environment.

## Table of Contents

- [Understanding NameBuilder Components](#understanding-namebuilder-components)
- [Reviewing Installed Components](#reviewing-installed-components)
- [Understanding Plugin Steps](#understanding-plugin-steps)
- [Solution Management](#solution-management)
- [Uninstalling NameBuilder](#uninstalling-namebuilder)
- [Troubleshooting](#troubleshooting)
- [ALM Considerations](#alm-considerations)

## Understanding NameBuilder Components

NameBuilder consists of two main components in your Dataverse environment:

### 1. Plugin Assembly

- **Name**: `NameBuilder`
- **Type**: Sandbox isolation
- **Location**: Stored in the `pluginassembly` table
- **Contains**: The NameBuilderPlugin class that executes when records are created/updated

### 2. SDK Message Processing Steps

For each entity configured with NameBuilder, you'll find **two plugin steps**:

- **Create Step**: Runs when a new record is created
- **Update Step**: Runs when an existing record is updated

Each step contains:
- **Unsecure Configuration**: The JSON configuration defining the name pattern
- **Filtering Attributes** (Update step only): The fields that trigger the plugin
- **Images** (Update step only): Pre-Image containing field values needed for processing

## Reviewing Installed Components

### Using Plugin Registration Tool

The Plugin Registration Tool is the primary way to review NameBuilder components:

1. Download the Plugin Registration Tool from [https://aka.ms/pluginregistrationtool](https://aka.ms/pluginregistrationtool)
2. Connect to your Dataverse environment
3. Locate the **NameBuilder** assembly in the list

#### Reviewing the Assembly

Click on the NameBuilder assembly to see:
- **Version**: Assembly version number
- **Isolation Mode**: Should be "Sandbox"
- **Source Type**: Should be "Database"

#### Reviewing Plugin Steps

Expand the NameBuilder assembly to see:
- **Plugin Types**: NameBuilderPlugin
- **SDK Message Processing Steps**: All Create/Update steps for configured entities

Click on a step to see:
- **Message**: Create or Update
- **Primary Entity**: The entity this step applies to (e.g., account, contact, incident)
- **Stage**: Should be "PreOperation" (20)
- **Mode**: Should be "Synchronous"
- **Filtering Attributes**: (Update steps only) Fields that trigger this plugin
- **Configuration**: The JSON defining the name pattern

#### Reviewing Images

For Update steps, expand the step to see the **PreImage**:
- **Image Type**: PreImage
- **Name/Alias**: Should be "PreImage"
- **Attributes**: All fields referenced in the configuration

### Using the Maker Portal

You can also review plugin steps in the Power Apps Maker Portal:

1. Go to [make.powerapps.com](https://make.powerapps.com)
2. Select your environment
3. Go to **Solutions**
4. Open the solution containing NameBuilder components
5. Filter by **Plug-in assemblies** and **SDK message processing steps**

## Understanding Plugin Steps

### Create Step

The Create step runs **before** a record is created (PreOperation stage):

| Setting | Value | Purpose |
|---------|-------|---------|
| Message | Create | Triggers on record creation |
| Stage | PreOperation (20) | Modifies the record before it's saved |
| Mode | Synchronous | Runs in the same transaction |
| Configuration | JSON pattern | Defines how to build the name |
| Filtering Attributes | (not applicable) | Create steps don't use filtering |
| Images | (not needed) | Target contains all new values |

**Key point**: If your configuration includes the `createdon` field, the Create step is **required** to populate it during creation.

### Update Step

The Update step runs **before** a record is updated (PreOperation stage):

| Setting | Value | Purpose |
|---------|-------|---------|
| Message | Update | Triggers on record update |
| Stage | PreOperation (20) | Modifies the record before it's saved |
| Mode | Synchronous | Runs in the same transaction |
| Configuration | JSON pattern (same as Create) | Defines how to build the name |
| Filtering Attributes | List of fields | Plugin only fires when these fields change |
| Images | PreImage | Provides access to all field values |

**Filtering Attributes** are critical for performance:
- Only fields referenced in your configuration should be included
- When a user updates a record, the plugin only fires if one of these fields changed
- This prevents unnecessary plugin executions

**PreImage** is required because:
- The Update message only provides changed fields in the Target
- To build the name, the plugin needs access to ALL fields (changed or not)
- The PreImage provides a complete snapshot of the record before the update

## Solution Management

### Solution Layering

When publishing configurations via the XrmToolBox Configurator, you're prompted to select an **unmanaged solution**:

- All NameBuilder components (assembly + steps) are added to this solution
- This enables proper ALM workflows (dev → test → prod)
- Managed solutions cannot contain new plugin registrations (only unmanaged)

### Viewing Components in a Solution

1. Open the solution in the Maker Portal
2. Filter by:
   - **Plug-in assemblies**: Shows the NameBuilder assembly
   - **SDK message processing steps**: Shows all Create/Update steps

### Moving to a Different Solution

To move NameBuilder to a different solution:

1. Open the target solution
2. Click **Add existing** → **More** → **Developer**
3. Select **Plug-in assembly** and add the NameBuilder assembly
4. Select **SDK message processing step** and add the relevant steps

## Uninstalling NameBuilder

### Uninstalling from a Single Entity

To remove NameBuilder from one entity while keeping it for others:

#### Using Plugin Registration Tool

1. Connect to your environment
2. Expand the NameBuilder assembly → NameBuilderPlugin
3. Find the steps for the entity you want to remove
4. Right-click each step → **Unregister**
5. Confirm the deletion

The entity's name field will no longer auto-populate, but existing names remain unchanged.

#### Using XrmToolBox Configurator

There's currently no "uninstall" button in the Configurator. Use the Plugin Registration Tool instead.

### Uninstalling Completely

To remove NameBuilder from your entire environment:

1. **Unregister all steps** first:
   - Expand NameBuilder → NameBuilderPlugin in Plugin Registration Tool
   - Unregister each SDK Message Processing Step
   - Delete any images if steps don't auto-delete them

2. **Unregister the assembly**:
   - Right-click the NameBuilder assembly
   - Click **Unregister**
   - Confirm deletion

3. **Verify removal**:
   - Refresh the Plugin Registration Tool
   - Confirm NameBuilder no longer appears in the list

**Important**: Uninstalling NameBuilder does NOT change existing record names. Previously generated names remain in the `name` field.

### What Happens to Record Names After Uninstall?

- Existing record names are **preserved** (they're just text fields)
- New records will have **blank** or **manually entered** names
- Updates to existing records will **not** refresh the name

If you want to clear names after uninstalling, you'll need to:
1. Create a bulk update workflow, or
2. Use the XrmToolBox Bulk Data Updater tool, or
3. Write a script to clear the `name` field values

## Troubleshooting

### Plugin Not Firing

**Symptoms**: Name field remains blank or doesn't update

**Common causes**:

1. **Filtering Attributes** (Update step):
   - The field you changed isn't in the filtering attributes list
   - **Fix**: Re-publish from XrmToolBox Configurator to sync attributes

2. **Missing or incomplete PreImage** (Update step):
   - PreImage doesn't exist or doesn't include all required fields
   - **Fix**: Re-publish from XrmToolBox Configurator

3. **Plugin step disabled**:
   - Step was manually disabled in Plugin Registration Tool
   - **Fix**: Right-click step → **Enable**

4. **Configuration errors**:
   - Invalid JSON in the step configuration
   - Field names don't match entity schema
   - **Fix**: Check Plugin Trace Log for errors

### Viewing Plugin Execution Logs

1. **Power Apps Maker Portal**:
   - Go to **Settings** → **Plug-in trace log**
   - Filter by `typename` contains "NameBuilder"
   - Click a log entry to see details

2. **Plugin Registration Tool**:
   - Click **View** → **Display Plug-in Trace Logs**
   - Set filters and click **Load**

3. **Enable Tracing** in configuration:
   ```json
   {
     "enableTracing": true,
     "targetField": "name",
     "pattern": "..."
   }
   ```
   This adds verbose diagnostic messages to the trace log.

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Field [fieldname] does not exist" | Configuration references a non-existent field | Fix field name in configuration |
| "Target does not contain [fieldname]" | PreImage missing or incomplete (Update) | Re-publish to recreate PreImage |
| "Invalid JSON configuration" | Malformed JSON in step configuration | Validate JSON syntax |
| "The plug-in execution failed" | Various runtime errors | Check Plugin Trace Log for details |

### Performance Issues

**Symptoms**: Slow record creation/updates

**Causes**:
- Too many lookups in the configuration (each requires a retrieve)
- Complex conditional logic
- Plugin firing on unnecessary field updates

**Solutions**:
1. Minimize the number of lookup fields in your pattern
2. Ensure Update step filtering attributes are correctly configured
3. Consider if Update step is necessary (Create-only might be sufficient)
4. Review Plugin Trace Log timing data

## ALM Considerations

### Development → Test → Production

Best practices for moving NameBuilder configurations between environments:

#### Option 1: Solution Export/Import (Recommended)

1. **Development Environment**:
   - Install NameBuilder via XrmToolBox
   - Create an unmanaged solution
   - Configure entities using XrmToolBox Configurator
   - Select your solution when publishing

2. **Export the Solution**:
   - Export as **managed** for test/prod environments
   - Include all NameBuilder components

3. **Import to Test/Production**:
   - Import the managed solution
   - NameBuilder plugin assembly and steps are deployed automatically

**Advantages**:
- Proper ALM lifecycle
- Clean deployment
- Easy rollback (uninstall managed solution)

#### Option 2: Manual Configuration (Not Recommended)

- Install NameBuilder in each environment
- Manually recreate configurations in XrmToolBox Configurator
- Publish to each environment individually

**Disadvantages**:
- Error-prone
- No version control
- Difficult to track changes

### Configuration Version Control

To track configuration changes:

1. **Export JSON configurations**:
   - Use XrmToolBox Configurator → **Export JSON**
   - Save to your source control repository

2. **Name files clearly**:
   - `account-config.json`
   - `opportunity-config.json`
   - `incident-config.json`

3. **Import in other environments**:
   - Use **Import JSON** in the Configurator
   - Then publish to Dataverse

### Preventing Duplicate Steps

The XrmToolBox Configurator prevents duplicates automatically:
- It detects existing steps for each entity
- Updates existing steps rather than creating new ones
- Logs a diagnostic warning if multiple steps are found

If you manually create steps using Plugin Registration Tool, you may create duplicates. Always use the Configurator for consistency.

## Security Considerations

### Required Privileges

To install and configure NameBuilder, users need:

- **System Administrator** or **System Customizer** role, or
- Custom role with:
  - `prvCreatePluginAssembly`
  - `prvCreateSdkMessageProcessingStep`
  - `prvWritePluginAssembly`
  - `prvWriteSdkMessageProcessingStep`
  - Entity-level write permissions for configured entities

### Runtime Execution Context

The plugin executes in the **calling user's context**:
- If the plugin references lookup fields, the user must have read access to those records
- If a user can't access a related record, the lookup will show blank in the name
- Plugin failures won't prevent the record from saving (unless there's a critical error)

### Secure vs. Unsecure Configuration

- **Unsecure Configuration**: Contains the JSON pattern (visible to all users)
- **Secure Configuration**: Not used by NameBuilder (always empty)

Configuration JSON does not contain sensitive data, so unsecure configuration is appropriate.

## Support and Additional Resources

- **User Guide**: [README.md](README.md)
- **Configuration Examples**: [NameBuilderPlugin/Docs/EXAMPLES.md](NameBuilderPlugin/Docs/EXAMPLES.md)
- **Developer Documentation**: [NameBuilderPlugin/README.md](NameBuilderPlugin/README.md)
- **Building from Source**: [Docs/BUILDING.md](Docs/BUILDING.md)

For issues or questions:
1. Check the Plugin Trace Log for error details
2. Review the configuration JSON syntax
3. Verify field names match your entity schema
4. Consult the documentation above
