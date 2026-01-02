# JSON Schema for Plugin Configuration

This directory contains the JSON schema (`plugin-config.schema.json`) for validating Dataverse Name Builder Plugin configurations.

## Features

- ✅ **Validation**: Automatically validates configuration structure
- ✅ **IntelliSense**: Auto-completion in VS Code and other editors
- ✅ **Documentation**: Inline descriptions for all properties
- ✅ **Examples**: Sample values for each field type
- ✅ **Type Safety**: Ensures correct data types and enums

## Usage

### In VS Code (Automatic)

The repo-root `.vscode/settings.json` file automatically associates common configuration filename patterns with this schema.

- `*-config.json` (e.g., `opportunity-config.json`, `case-config.json`)
- `Configuration Examples.txt`
- `Example for Service Case.txt`

**You'll get:**

- Auto-completion when typing (Ctrl+Space)
- Hover documentation on properties
- Red squiggles for validation errors
- Suggestions for enum values (field types, etc.)

### In Any JSON File

Add this line at the top of your JSON configuration.

If your JSON config file lives in the plug-in folder (next to `README.md`), reference the schema under `Docs/`:

```json
{
  "$schema": "./Docs/plugin-config.schema.json",
  "targetField": "name",
  "pattern": "createdon | ownerid"
}
```

If your JSON config file lives in this `Docs/` folder, you can use:

```json
{
  "$schema": "./plugin-config.schema.json",
  "targetField": "name",
  "pattern": "createdon | ownerid"
}
```

Or use a URL if you publish the schema (for example, the raw GitHub URL in your fork):

```json
{
  "$schema": "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/NameBuilderPlugin/Docs/plugin-config.schema.json",
  "targetField": "name",
  "pattern": "createdon | ownerid"
}
```

### Manual Validation

You can validate any configuration file using tools like:

**Using VS Code:**

1. Open your JSON file
2. Look for validation errors (red squiggles)
3. Check the "Problems" panel (Ctrl+Shift+M)

**Using Online Validators:**

- <https://www.jsonschemavalidator.net/>
- Paste the schema and your configuration

**Using Command Line:**

```powershell
# Install ajv-cli
npm install -g ajv-cli

# Validate a file
ajv validate -s plugin-config.schema.json -d opportunity-config.json
```

## Schema Properties

### Root Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `entity` | string | No | Logical name of the entity (e.g., 'account', 'opportunity') - optional, for documentation/validation |
| `targetField` | string | No | Field to populate (default: "name") |
| `enableTracing` | boolean | No | Enable debug tracing (default: false) |
| `pattern` | string | Yes* | Pattern-based configuration |
| `fields` | array | Yes* | Fields array configuration |
| `maxLength` | integer | No | Max length (auto-detected if omitted) |

*Either `pattern` OR `fields` is required, not both.

### Field Configuration (for `fields` array)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | Yes | Field logical name |
| `type` | enum | No | Field type (auto-detected if omitted) |
| `format` | string | No | Date/number/currency format |
| `maxLength` | integer | No | Max characters for this field |
| `truncationIndicator` | string | No | Truncation suffix (default: "...") |
| `default` | string | No | Default value if empty |
| `alternateField` | object | No | Fallback field configuration |
| `prefix` | string | No | Text before value |
| `suffix` | string | No | Text after value |
| `includeIf` | object | No | Condition for field inclusion |
| `timezoneOffsetHours` | number | No | UTC offset for dates |

### Conditional Field Inclusion (for `includeIf`)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | Yes | Field logical name to evaluate |
| `operator` | enum | Yes | Comparison operator |
| `value` | string | No | Value to compare (not needed for isEmpty/isNotEmpty) |

**Supported Operators:**

- `equals` / `eq` - Exact match
- `notEquals` / `ne` - Not equal
- `contains` - Substring match
- `notContains` - Substring not present
- `in` - Value in comma-separated list
- `notIn` - Value not in list
- `greaterThan` / `gt` - Numeric comparison (>)
- `lessThan` / `lt` - Numeric comparison (<)
- `greaterThanOrEqual` / `gte` - Numeric comparison (>=)
- `lessThanOrEqual` / `lte` - Numeric comparison (<=)
- `isEmpty` - Field has no value
- `isNotEmpty` - Field has a value

**Compound Conditions:**

- `anyOf` - Array of conditions; include if any is true (OR)
- `allOf` - Array of conditions; include if all are true (AND)

### Supported Field Types

- `string` - Text fields
- `lookup` - EntityReference fields
- `date` / `datetime` - Date/DateTime fields
- `optionset` / `picklist` - OptionSet fields
- `number` - Integer, Decimal, Double fields
- `currency` - Money fields

### Format Examples

**Date Formats:**

- `yyyy-MM-dd` → 2025-12-01
- `MM/dd/yyyy` → 12/01/2025
- `yyyy-MM-dd HH:mm` → 2025-12-01 14:30

**Number/Currency Formats:**

- `#,##0.00` → 1,234.56 (thousands separator)
- `0.0K` → 1.2K (thousands scaling)
- `0.00M` → 1.23M (millions scaling)
- `0B` → 2B (billions scaling)

## IntelliSense Features

When editing with schema support, you get:

1. **Property Suggestions:**
   - Type `"` and see all available properties
   - Ctrl+Space to trigger completion

2. **Enum Values:**
   - For `type` field, see all valid types
   - Auto-complete with descriptions

3. **Format Examples:**
   - Hover over properties to see examples
   - See valid format strings inline

4. **Error Detection:**
   - Missing required fields
   - Invalid property names
   - Wrong data types
   - Invalid enum values

## Examples

### Pattern-Based with Schema

```json
{
  "$schema": "./plugin-config.schema.json",
  "entity": "incident",
  "targetField": "name",
  "pattern": "createdon | ownerid - statuscode",
  "maxLength": 100
}
```

### Fields Array with Schema

```json
{
  "$schema": "./plugin-config.schema.json",
  "entity": "opportunity",
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
      "prefix": " Est: "
    }
  ]
}
```

### Conditional Fields with Schema

```json
{
  "$schema": "./plugin-config.schema.json",
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

**IntelliSense Features:**

- Auto-complete `"includeIf"` property
- Operator enum shows all 18 valid operators
- Hover on operators for descriptions
- Validation ensures field/operator are provided

### Compound Conditions with Schema

```json
{
  "$schema": "./plugin-config.schema.json",
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup"
    },
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
    },
    {
      "field": "estimatedvalue",
      "type": "currency",
      "format": "0.00M",
      "prefix": " - Major Deal: ",
      "includeIf": {
        "allOf": [
          { "field": "statecode", "operator": "equals", "value": "0" },
          { "field": "estimatedvalue", "operator": "greaterThan", "value": "5000000" }
        ]
      }
    }
  ]
}
```

**IntelliSense Features:**

- Auto-complete `"anyOf"` and `"allOf"` arrays
- Nested condition validation
- Self-referential schema support for deep nesting

### With Tracing Enabled

```json
{
  "$schema": "./plugin-config.schema.json",
  "targetField": "name",
  "pattern": "createdon | ownerid",
  "enableTracing": true
}
```

## Troubleshooting

### Schema Not Working in VS Code

1. Ensure the file matches the patterns in `.vscode/settings.json`
2. Reload the window: Ctrl+Shift+P → "Reload Window"
3. Check the JSON language mode is active (bottom-right status bar)

### Schema Path Issues

If using relative paths (`./plugin-config.schema.json`), ensure:

- The schema file is in the same directory as your config
- Or adjust the path relative to your config file location

### Custom File Extensions

Add your custom patterns to `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": [
        "*-config.json",
        "my-custom-pattern*.json"
      ],
      "url": "./plugin-config.schema.json"
    }
  ]
}
```

## Publishing the Schema

To make the schema publicly available:

1. Commit `plugin-config.schema.json` to your repository
2. Use the raw GitHub URL in `$schema`:

   ```
   https://raw.githubusercontent.com/mscottsewell/DataverseNamePlugin/main/plugin-config.schema.json
   ```

3. Or publish to <https://schemastore.org/> for global availability

## Resources

- [JSON Schema Documentation](https://json-schema.org/)
- [VS Code JSON Schemas](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)
- [Schema Store](https://schemastore.org/)
