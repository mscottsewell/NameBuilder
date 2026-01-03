# NameBuilder Plugin – Developer Documentation

A configurable Dataverse plugin that dynamically constructs the primary name field based on other field values. This document is for **developers** who want to understand the plugin architecture, build from source, or extend the code.

**For end users**: See the main [README.md](../README.md) for installation and usage via XrmToolBox.

**For administrators**: See [ADMINISTRATOR.md](../ADMINISTRATOR.md) for reviewing, troubleshooting, and managing plugin components.

## Overview

This plugin executes during Create/Update operations in the PreOperation stage, assembling the target field (typically `name`) from a JSON-configured pattern. The companion [NameBuilderConfigurator](../NameBuilderConfigurator) provides a visual designer for building these configurations, but manual JSON editing is fully supported.

## Features

- ✅ **Multiple Field Types**: String, Lookup, Date/DateTime, OptionSet (Picklist), Number, Currency
- ✅ **Numeric Formatting**: Thousands separators, decimal places, and K/M/B scaling (e.g., `1.5K`, `2.3M`, `450B`)
- ✅ **Currency Formatting**: Automatic currency symbol lookup from transaction currency with K/M/B support
- ✅ **Metadata-Driven Intelligence**: Uses Dataverse metadata for accurate field type detection and validation
- ✅ **Auto-Type Detection**: Infers field types from metadata first, then naming conventions as fallback
- ✅ **Auto-Length Detection**: Automatically sets max length from target field metadata
- ✅ **Per-Field Truncation**: Limit individual field lengths with custom truncation indicators
- ✅ **Default Values**: Fallback values for missing or empty fields
- ✅ **Alternate Field Fallback**: Chain alternate fields when primary field is unavailable
- ✅ **Max Length & Truncation**: Configurable max length with smart truncation (`...`)
- ✅ **Configurable via Plugin Registration Tool**: JSON-based configuration
- ✅ **Smart Triggering**: Only fires when configured fields are modified
- ✅ **Create & Update Support**: Works on both record creation and updates
- ✅ **Lookup Resolution**: Uses text values, not GUIDs
- ✅ **OptionSet Labels**: Uses display labels, not numeric values
- ✅ **Date Formatting**: Customizable date formats (defaults to ISO: yyyy-MM-dd)
- ✅ **Flexible Delimiters**: Any text between fields becomes a delimiter
- ✅ **Timezone Offset for Dates**: Adjust date/datetime fields by a configurable number of hours for user/local time display
- ✅ **Conditional Field Inclusion**: Show/hide fields based on other field values (e.g., show estimated value if open, actual value if closed)
- ✅ **JSON Schema**: IntelliSense and validation support for configuration files

## Architecture

### Plugin Execution Flow

```text
1. Dataverse triggers Create/Update message
2. Plugin executes in PreOperation stage (synchronous)
3. Parse JSON configuration from step's unsecure configuration
4. Retrieve field values from Target (Create) or Target + PreImage (Update)
5. Process each field block:
   - Evaluate includeIf conditions
   - Resolve field values (lookups, optionsets, etc.)
   - Apply formatting (dates, numbers, currency)
   - Apply fallbacks (alternateField, default values)
   - Handle truncation
6. Assemble final string with prefixes/suffixes
7. Set target field value
8. Dataverse completes the save operation
```

### Key Components

| Component | Purpose |
| --------- | ------- |
| **NameBuilderPlugin.cs** | Main plugin class, implements `IPlugin` |
| **Configuration Parser** | Deserializes JSON into strongly-typed configuration objects |
| **Metadata Cache** | Caches entity/attribute metadata for performance |
| **Field Resolvers** | Type-specific logic for lookups, optionsets, dates, etc. |
| **Condition Evaluator** | Processes `includeIf` logic (anyOf/allOf) |
| **Formatter** | Handles date/number/currency formatting and K/M/B scaling |

### Performance Optimizations

- **Metadata Caching**: Uses `ConcurrentDictionary` to cache metadata queries
- **OptionSet Label Caching**: Caches picklist labels to avoid repeated metadata calls
- **Currency Symbol Caching**: Caches currency symbols by transaction currency ID
- **Configuration Caching**: Parses JSON configuration once per pattern
- **Smart Filtering**: Update steps only fire when configured fields change

## Quick Configuration Reference

### Basic Pattern-Based Configuration

```json
{
  "$schema": "./Docs/plugin-config.schema.json",
  "targetField": "name",
  "pattern": "createdon | ownerid - statuscode",
  "maxLength": 100
}
```

**Result:** `2025-12-01 | John Smith - Active`

**Tip:** Add `"$schema": "./Docs/plugin-config.schema.json"` to enable IntelliSense and validation in VS Code. See [Docs/SCHEMA.md](Docs/SCHEMA.md) for details.

## Configuration Format

The plugin supports two configuration formats:

### Option 1: Pattern-Based (Simple)

Best for straightforward name building with inline delimiters:

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid - statuscode",
  "maxLength": 100
}
```

**Pattern Syntax:**

- Field names are auto-detected (letters, digits, underscores)
- Everything else is literal text (delimiters)
- Field types are inferred from Dataverse metadata (fallback to naming conventions)
- Optional explicit types: `fieldname:type` or `fieldname:date:format`

**See [Docs/PATTERN_EXAMPLES.md](Docs/PATTERN_EXAMPLES.md) for detailed pattern documentation.**

### Option 2: Fields Array (Advanced)

Best for per-field control with truncation, defaults, and fallbacks:

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup",
      "maxLength": 30,
      "truncationIndicator": "...",
      "default": "Unknown Customer",
      "alternateField": {
        "field": "accountid",
        "type": "lookup"
      },
      "suffix": " | "
    },
    {
      "field": "createdon",
      "type": "date",
      "format": "yyyy-MM-dd",
      "suffix": " | "
    },
    {
      "field": "casetypecode",
      "type": "optionset"
    }
  ],
  "maxLength": 200
}
```

**Fields Array Properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | ✅ | Field logical name |
| `type` | string | - | Field type (auto-detected if omitted) |
| `format` | string | - | Date format (e.g., `yyyy-MM-dd`), numeric format (e.g., `#,##0.00`, `0.0K`, `0.00M`), or currency format |
| `maxLength` | number | - | Maximum characters for this field |
| `truncationIndicator` | string | - | String to append when truncated (default: `...`) |
| `default` | string | - | Value when field is missing/empty |
| `alternateField` | object | - | Fallback field configuration |
| `prefix` | string | - | Text before field value |
| `suffix` | string | - | Text after field value |
| `includeIf` | object | - | Condition for including this field (see Conditional Fields) |
| `timezoneOffsetHours` | number | - | Adjusts UTC date/time by this many hours (e.g., `-5` for EST, `1` for CET) |

**See [Docs/EXAMPLES.md](Docs/EXAMPLES.md) for comprehensive fields array examples.**

### Configuration Properties

#### Pattern-Based Format

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `entity` | string | No | - | Logical name of the entity this configuration applies to (e.g., `"account"`, `"opportunity"`) - optional, for documentation/validation |
| `targetField` | string | No | `"name"` | The field to populate with the constructed value |
| `pattern` | string | **Yes** | - | Pattern string defining the format (e.g., `"createdon \| ownerid"`) |
| `maxLength` | integer | No | Auto-detected | Maximum length; auto-detected from `targetField` metadata, or specify explicitly; truncates to `(n-3) + "..."` if exceeded |

#### Fields Array Format

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `entity` | string | No | - | Logical name of the entity this configuration applies to (e.g., `"account"`, `"opportunity"`) - optional, for documentation/validation |
| `targetField` | string | No | `"name"` | The field to populate with the constructed value |
| `fields` | array | **Yes** | - | Array of field configuration objects (see Fields Array Properties above) |
| `maxLength` | integer | No | Auto-detected | Maximum length for entire result; auto-detected from `targetField` metadata, or specify explicitly; truncates to `(n-3) + "..."` if exceeded |

## Pattern Examples

### Example 1: Date + Owner

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid"
}
```

**Result**: `2025-12-01 | John Smith`

### Example 2: With Max Length Truncation

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid - accountid - statuscode",
  "maxLength": 50
}
```

**Result (if > 50 chars)**: `2025-12-01 | John Smith - Contoso Corporatio...`

### Example 3: Custom Date Format

```json
{
  "targetField": "name",
  "pattern": "createdon:date:MM/dd/yyyy | ownerid"
}
```

**Result**: `12/01/2025 | John Smith`

### Example 4: Complex Pattern

```json
{
  "targetField": "name",
  "pattern": "CASE-ticketnumber [prioritycode] createdon:date:yyyy-MM-dd",
  "maxLength": 100
}
```

**Result**: `CASE-1001 [High] 2025-12-01`

### Example 5: Fields Array with Truncation

```json
{
  "targetField": "title",
  "fields": [
    {
      "field": "createdon",
      "type": "date",
      "format": "yyyyMMdd"
    },
    {
      "field": "customerid",
      "type": "lookup",
      "prefix": " ",
      "maxLength": 30,
      "truncationIndicator": "..."
    },
    {
      "field": "productid",
      "type": "lookup",
      "prefix": " | "
    },
    {
      "field": "casetypecode",
      "type": "optionset",
      "prefix": " | "
    }
  ],
  "maxLength": 200
}
```

**Result**: `20251201 Adventure Works Cycles Cor... | Surface Pro 9 | Request`

### Example 6: Fields Array with Default Values and Fallback

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "primarycontactid",
      "type": "lookup",
      "alternateField": {
        "field": "customerid",
        "type": "lookup",
        "default": "No Contact"
      }
    },
    {
      "field": "createdon",
      "type": "date",
      "format": "yyyy-MM-dd",
      "prefix": " - "
    }
  ]
}
```

**Fallback Logic**:

1. Try `primarycontactid`
2. If missing, try `customerid`
3. If also missing, use `"No Contact"`

**Result**: `John Smith - 2025-12-01` or `Contoso Ltd - 2025-12-01` or `No Contact - 2025-12-01`

### Example 7: Date Field with Timezone Offset

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "estimatedclosedate",
      "type": "date",
      "format": "yyyy-MM-dd HH:mm",
      "timezoneOffsetHours": -5,
      "prefix": " (local time)"
    }
  ]
}
```

**Result**: `2025-12-15 09:00 (local time)` (if UTC value is 2025-12-15 14:00)

### Example 8: Numeric and Currency Formatting

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "estimatedvalue",
      "type": "currency",
      "format": "0.00M"
    },
    {
      "field": "numberofemployees",
      "type": "number",
      "format": "#,##0",
      "prefix": " | "
    },
    {
      "field": "revenue",
      "type": "currency",
      "format": "0.0K",
      "prefix": " | Rev: "
    }
  ]
}
```

**Result**: `$2.50M | 1,250 | Rev: $450.0K`
- `estimatedvalue`: $2,500,000 formatted as `$2.50M` (millions with currency symbol)
- `numberofemployees`: 1250 formatted as `1,250` (thousands separator)
- `revenue`: $450,000 formatted as `$450.0K` (thousands scaling with currency symbol)

**📖 For more pattern examples, see [Docs/PATTERN_EXAMPLES.md](Docs/PATTERN_EXAMPLES.md)**
**📖 For more fields array examples, see [Docs/EXAMPLES.md](Docs/EXAMPLES.md)**
**📖 For detailed numeric/currency formatting documentation, see [Docs/NUMERIC_CURRENCY_DOCS.md](Docs/NUMERIC_CURRENCY_DOCS.md)**

### Example 9: Conditional Field Inclusion

Show different fields based on record values (e.g., estimated value if open, actual value if closed):

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup"
    },
    {
      "field": "estimatedvalue",
      "type": "currency",
      "format": "0.00M",
      "prefix": " - Est: ",
      "includeIf": {
        "field": "statecode",
        "operator": "equals",
        "value": "0"
      }
    },
    {
      "field": "actualvalue",
      "type": "currency",
      "format": "0.00M",
      "prefix": " - Actual: ",
      "includeIf": {
        "field": "statecode",
        "operator": "equals",
        "value": "1"
      }
    }
  ]
}
```

**Result**:

- Open opportunity (statecode=0): `Contoso Ltd - Est: $2.50M`
- Closed opportunity (statecode=1): `Contoso Ltd - Actual: $2.35M`

**Supported Operators**:

- `equals` / `eq`: Exact match
- `notEquals` / `ne`: Not equal
- `contains`: Substring match
- `notContains`: Substring not present
- `in`: Value in comma-separated list (e.g., `"1,2,3"`)
- `notIn`: Value not in list
- `greaterThan` / `gt`: Numeric comparison
- `lessThan` / `lt`: Numeric comparison
- `greaterThanOrEqual` / `gte`: Numeric comparison
- `lessThanOrEqual` / `lte`: Numeric comparison
- `isEmpty`: Field has no value
- `isNotEmpty`: Field has a value

**Compound Conditions:**
- `anyOf`: Array of conditions; include if **any** is true (OR logic)
- `allOf`: Array of conditions; include only if **all** are true (AND logic)

**Type Handling**:

- **OptionSetValue**: Compares numeric value (`optionSetValue.Value`)
- **EntityReference**: Compares referenced entity name (`entityReference.Name`)
- **Money**: Compares decimal value (`money.Value`)
- **DateTime**: Compares formatted date (`yyyy-MM-dd`)
- **Boolean**: Compares `"true"` or `"false"` strings

**Prefix/Suffix Behavior**: When a condition is not met, both the field value and its prefix/suffix are excluded from the name.

**Compound Conditions Example** (Won OR Lost):
```json
{
  "field": "actualvalue",
  "type": "currency",
  "format": "0.00M",
  "prefix": " - Final: ",
  "includeIf": {
    "anyOf": [
      { "field": "statecode", "operator": "equals", "value": "1" },
      { "field": "statecode", "operator": "equals", "value": "2" }
    ]
  }
}
```
Shows actual value if opportunity is Won (1) or Lost (2).

**📖 For more pattern examples, see [Docs/PATTERN_EXAMPLES.md](Docs/PATTERN_EXAMPLES.md)**
**📖 For more fields array examples, see [Docs/EXAMPLES.md](Docs/EXAMPLES.md)**
**📖 For detailed numeric/currency formatting documentation, see [Docs/NUMERIC_CURRENCY_DOCS.md](Docs/NUMERIC_CURRENCY_DOCS.md)**

## Metadata-Driven Intelligence

The plugin leverages Dataverse metadata APIs for improved accuracy and reliability:

### Auto-Detect Field Types

- **Metadata First**: Queries `AttributeMetadata` to determine actual field types
- **Fallback to Conventions**: Uses naming patterns (e.g., `*id` = lookup) only when metadata unavailable
- **Accurate Detection**: Correctly identifies custom lookup fields that don't follow naming conventions
- **Type Mapping**: 
  - `AttributeTypeCode.Lookup/Customer/Owner` → `"lookup"`
  - `AttributeTypeCode.DateTime` → `"date"`
  - `AttributeTypeCode.Picklist/State/Status` → `"optionset"`
  - `AttributeTypeCode.String/Memo` → `"string"`

### Auto-Detect Max Length

- **Target Field Metadata**: Automatically retrieves `StringAttributeMetadata.MaxLength` from `targetField`
- **No Manual Configuration**: Skip `maxLength` in configuration to use the field's defined maximum
- **Override When Needed**: Explicitly set `maxLength` to use a smaller limit

### Dynamic Primary Name Resolution

- **Entity Metadata**: Queries `EntityMetadata.PrimaryNameAttribute` for lookup name resolution
- **Custom Entities**: Works with any custom entity's primary name field
- **No Hardcoding**: Eliminates need to maintain entity-to-primary-field mappings

### Performance Optimizations

- **Metadata Caching**: Uses `ConcurrentDictionary` to cache metadata queries
- **OptionSet Label Caching**: Caches picklist labels to avoid repeated metadata calls
- **Currency Symbol Caching**: Caches currency symbols by transaction currency ID
- **Configuration Caching**: Parses JSON configuration once per pattern

## Building from Source

### Prerequisites

- Visual Studio 2019 or later
- .NET Framework 4.6.2 or later
- NuGet package manager

### Build Steps

#### Option 1: Using build script (recommended)

From the repo root:

```powershell
pwsh -File .\build.ps1 -Configuration Release -PluginOnly
```

Or from the plugin folder:

```powershell
pwsh -File .\NameBuilderPlugin\build.ps1 -Configuration Release
```

The compiled DLL will be at: `NameBuilderPlugin\bin\Release\net462\NameBuilder.dll`

#### Option 2: Using Visual Studio

1. Open the solution in Visual Studio 2019 or later
2. Restore NuGet packages
3. Build the solution in **Release** mode
4. Locate the compiled assembly: `DataverseNamePlugin\bin\Release\net462\DataverseNameBuilder.dll`

### Step 2: Sign the Assembly (Optional but Recommended)

```powershell
# Create a strong name key
sn -k NameBuilder.snk

# Add to your .csproj:
# <AssemblyOriginatorKeyFile>NameBuilder.snk</AssemblyOriginatorKeyFile>
# <SignAssembly>true</SignAssembly>
```

### Step 3: Register the Plugin

1. Download and install the **Plugin Registration Tool** from NuGet or Microsoft
2. Connect to your Dataverse environment
3. Click **Register** > **Register New Assembly**
4. Select `DataverseNameBuilder.dll`
5. Choose isolation mode: **Sandbox**
6. Click **Register Selected Plugins**

### Step 4: Register a Step

1. Right-click the `NameBuilderPlugin` in the Plugin Registration Tool
2. Click **Register New Step**

#### Create Step Configuration

| Setting | Value |
|---------|-------|
| **Message** | `Create` |
| **Primary Entity** | Your entity (e.g., `account`, `contact`, custom entity) |
| **Event Pipeline Stage** | `PreOperation` (20) |
| **Execution Mode** | `Synchronous` |
| **Deployment** | `Server` |
| **Unsecure Configuration** | Your JSON configuration (see examples above) |
| **Secure Configuration** | (Leave empty) |

**Important**: If your configuration includes the `createdon` field, the plugin MUST be registered on the `Create` message to populate it during creation.

3. Click **Register New Step**

#### Update Step Configuration (Optional)

If you want the name to update when fields change:

1. Right-click the `NameBuilderPlugin` again
2. Click **Register New Step**

| Setting | Value |
|---------|-------|
| **Message** | `Update` |
| **Primary Entity** | Your entity |
| **Filtering Attributes** | Select all fields referenced in your configuration |
| **Event Pipeline Stage** | `PreOperation` (20) |
| **Execution Mode** | `Synchronous` |
| **Deployment** | `Server` |
| **Unsecure Configuration** | Same JSON configuration |

3. Click **Register New Step**

### Step 5: Register PreImage for Update Step

**Critical for Update**: You must register a PreImage to access all field values.

1. Right-click your **Update** step
2. Click **Register New Image**

| Setting | Value |
|---------|-------|
| **Image Type** | `PreImage` |
| **Name** | `PreImage` |
| **Entity Alias** | `PreImage` |
| **Parameters** | Select all fields from your configuration |

3. Click **OK**

## Field Types Reference

### String Fields

- **fieldType**: `"string"`
- Returns the text value as-is
- Examples: `firstname`, `lastname`, `emailaddress1`, `telephone1`

### Lookup Fields

- **fieldType**: `"lookup"`
- Returns the **name** of the referenced record, not the GUID
- Examples: `ownerid`, `parentcustomerid`, `accountid`
- Automatically detects lookup fields via metadata (no need to specify type for standard fields)
- Dynamically retrieves the primary name field from the referenced entity using metadata

### Date/DateTime Fields

- **fieldType**: `"date"` or `"datetime"`
- Returns formatted date string
- **dateFormat**: Any valid .NET date format string
- Examples: `createdon`, `modifiedon`, `birthdate`, custom date fields
- Common formats:
  - `"yyyy-MM-dd"` → `2025-12-01`
  - `"MM/dd/yyyy"` → `12/01/2025`
  - `"yyyy-MM-dd HH:mm"` → `2025-12-01 14:30`
  - `"MMMM dd, yyyy"` → `December 01, 2025`

### OptionSet/Picklist Fields

- **fieldType**: `"optionset"` or `"picklist"`
- Returns the **label** (display text), not the numeric value
- Examples: `statecode`, `statuscode`, `prioritycode`, custom picklists

### Numeric Fields

- **fieldType**: `"number"`
- Handles Integer, Decimal, Double, Float fields
- **format**: Any valid .NET numeric format string
- Common formats:
  - `"#,##0"` → `1,234` (thousands separator, no decimals)
  - `"#,##0.00"` → `1,234.56` (thousands separator, 2 decimals)
  - `"0.0K"` → `1.2K` (thousands scaling: 1234 → 1.2K)
  - `"0.00M"` → `1.23M` (millions scaling: 1234567 → 1.23M)
  - `"0B"` → `2B` (billions scaling: 1500000000 → 2B)
- **K/M/B Scaling**: Automatically divides values and appends suffix
  - K = ÷ 1,000 (thousands)
  - M = ÷ 1,000,000 (millions)
  - B = ÷ 1,000,000,000 (billions)
- Examples: `estimatedvalue`, `revenue`, `numberofemployees`

### Currency/Money Fields

- **fieldType**: `"currency"`
- Handles Money field types with automatic currency symbol lookup
- **format**: Same as numeric formats (supports K/M/B scaling)
- **Currency Symbol Resolution**:
  - Automatically retrieves currency symbol from `transactioncurrency` entity
  - Uses `transactioncurrencyid` lookup on the record
  - Falls back to `$` if currency not found
  - Caches currency symbols for performance
- Common formats:
  - `"#,##0.00"` → `$1,234.56` (symbol + formatted value)
  - `"0.0K"` → `$1.2K` (symbol + thousands scaling)
  - `"0.00M"` → `$1.23M` (symbol + millions scaling)
- Examples: `estimatedvalue`, `totalamount`, `budgetamount`
- **Multi-Currency Support**: Displays correct symbol based on record's transaction currency

## Manual Plugin Deployment

For most users, the XrmToolBox Configurator handles plugin deployment automatically. For developers who need manual control, see [QUICKSTART.md](QUICKSTART.md) for step-by-step instructions on:

- Registering the assembly with the Plugin Registration Tool
- Creating Create/Update steps manually
- Configuring filtering attributes and PreImages
- Setting up the JSON configuration

## Extending the Plugin

### Adding Custom Field Types

To add support for new field types:

1. Update the `FieldType` enum
2. Add a resolver method in the field processing logic
3. Update the JSON schema in `Docs/plugin-config.schema.json`
4. Add examples to the documentation

### Adding Custom Operators

To add new `includeIf` operators:

1. Add the operator to the supported operators list
2. Implement the comparison logic in the condition evaluator
3. Update `Docs/CONDITIONAL_FIELDS.md` with examples

### Testing Changes

When modifying the plugin:

1. Build in Debug mode for local testing
2. Deploy to a development environment
3. Enable tracing in the configuration (`"enableTracing": true`)
4. Review Plugin Trace Logs for diagnostics
5. Test with Create and Update operations
6. Verify filtering attributes work correctly for Update steps

## Developer Resources

- **Configuration Examples**: [Docs/EXAMPLES.md](Docs/EXAMPLES.md)
- **Pattern Syntax**: [Docs/PATTERN_EXAMPLES.md](Docs/PATTERN_EXAMPLES.md)
- **Conditional Logic**: [Docs/CONDITIONAL_FIELDS.md](Docs/CONDITIONAL_FIELDS.md)
- **Numeric/Currency Formatting**: [Docs/NUMERIC_CURRENCY_DOCS.md](Docs/NUMERIC_CURRENCY_DOCS.md)
- **JSON Schema**: [Docs/SCHEMA.md](Docs/SCHEMA.md)
- **Manual Deployment**: [QUICKSTART.md](QUICKSTART.md)
- **Build Scripts**: [../Docs/BUILDING.md](../Docs/BUILDING.md)

## Troubleshooting for Developers

### Name field is not being populated

1. **Check Plugin Execution**:
   - Open Plugin Trace Log in Dataverse
   - Look for errors or warnings from `NameBuilderPlugin`

2. **Verify Configuration**:
   - Ensure JSON is valid (use a JSON validator)
   - Check field names are correct (logical names, not display names)
   - Field types are auto-detected from metadata; explicit types override if needed

3. **Check Filtering Attributes** (Update step):
   - Ensure all configured fields are in the filtering attributes list
   - Missing fields won't trigger the plugin

4. **Verify PreImage** (Update step):
   - PreImage must be registered with alias `PreImage`
   - Must include all configured fields

### Plugin throws an error

- Check the **Plugin Trace Log** for detailed error messages
- Common issues:
  - Invalid JSON configuration
  - Field name doesn't exist
  - Wrong field type specified
  - Insufficient permissions to access lookup records

### Lookup shows GUID instead of name

- Ensure fieldType is set to `"lookup"`, not `"string"`
- Plugin automatically retrieves the name from the referenced entity
- Check that the user has read permissions on the referenced entity

## Performance Considerations

- **Lightweight**: Plugin only fires when configured fields change
- **Minimal API Calls**: Only retrieves lookup names when needed
- **Efficient**: Uses PreImage to avoid additional retrieve operations
- **Metadata Caching**: Caches field types, primary names, and optionset labels for performance
- **Smart Auto-Detection**: Metadata-based type inference reduces configuration errors
- **Best Practice**: Register only on necessary messages (Create/Update)

## Supported Dataverse Versions

- Dynamics 365 CE 9.x and later
- Power Apps (Dataverse)
- Built with .NET Framework 4.6.2

## Contributing

Contributions are welcome! When contributing:

1. **Code Style**: Follow existing patterns and conventions
2. **Testing**: Test changes in a development environment before submitting
3. **Documentation**: Update relevant docs in `Docs/` folder
4. **Schema**: Update `plugin-config.schema.json` for configuration changes
5. **Examples**: Add examples for new features

## License

See [../LICENSE](../LICENSE).

## Support

**For users**: See the main [README.md](../README.md) for common questions and getting started.

**For administrators**: See [ADMINISTRATOR.md](../ADMINISTRATOR.md) for troubleshooting plugin execution.

**For developers**:

1. Check the Plugin Trace Log in your Dataverse environment
2. Enable tracing in configuration (`"enableTracing": true`)
3. Review configuration JSON syntax against the schema
4. Verify field names and types match your entity schema
5. Review this documentation and examples in `Docs/`
