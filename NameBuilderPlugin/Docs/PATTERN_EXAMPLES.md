# Pattern-Based Configuration Guide

## Overview

The plugin uses a simple **pattern-based configuration** using the `pattern` property. This allows you to define the name format inline with delimiters, making configuration intuitive and readable.

**Key Features:**
- **Metadata-Driven**: Field types auto-detected from Dataverse metadata (with naming convention fallback)
- **Auto-Length Detection**: Target field max length retrieved from metadata
- **Smart Type Inference**: Works with custom lookup fields that don't follow naming conventions

## Pattern Syntax

### Basic Format

```text
fieldname | another_field - third_field
```

- **Field names** are detected automatically (letters, digits, underscores)
- **Everything else** is treated as literal text (delimiters, separators, etc.)
- **Field types** are auto-detected from Dataverse metadata first
- **Custom types** can be specified using `:type` syntax to override

### Field Type Auto-Detection

The plugin intelligently detects field types using a two-tier approach:

**1. Metadata-Based (Primary)**
- Queries Dataverse `AttributeMetadata` to determine actual field type
- Works with custom fields regardless of naming conventions
- More accurate and reliable than naming patterns

**2. Naming Convention Fallback (Secondary)**

| Field Name Pattern | Detected Type | Examples |
|-------------------|---------------|----------|
| Ends with `on`, `date`, or contains `date` | `date` | `createdon`, `modifiedon`, `birthdate`, `startdate` |
| Ends with `id` (but not just "id") | `lookup` | `ownerid`, `customerid`, `accountid` |
| Ends with `code`, `status`, or `state` | `optionset` | `statuscode`, `statecode`, `prioritycode` |
| Metadata: Integer, Decimal, Double | `number` | `numberofemployees`, `revenue`, custom number fields |
| Metadata: Money | `currency` | `estimatedvalue`, `totalamount`, `budgetamount` |
| Everything else | `string` | `firstname`, `lastname`, `name` |

**Note**: With metadata detection, custom lookup fields like `new_customer`, `new_primarycontact`, etc., are correctly identified even though they don't end with "id".

### Explicit Type Specification

You can override auto-detection by specifying the type explicitly:

```text
fieldname:type
```

**Supported types:**

- `string`
- `lookup`
- `date` or `datetime`
- `optionset` or `picklist`
- `number`
- `currency`

### Date Format Specification

For date fields, you can specify a custom format:

```text
fieldname:date:format
```

**Examples:**

- `createdon:date:yyyy-MM-dd` → `2025-12-01`
- `createdon:date:MM/dd/yyyy` → `12/01/2025`
- `createdon:date:MMMM dd, yyyy` → `December 01, 2025`

### Numeric Format Specification

For numeric fields (Integer, Decimal, Double), you can specify a format:

```text
fieldname:number:format
```

**Standard Formats:**

- `fieldname:number:#,##0` → Thousands separator, no decimals (`1,234`)
- `fieldname:number:#,##0.00` → Thousands separator, 2 decimals (`1,234.56`)

**K/M/B Scaling Formats:**

- `fieldname:number:0.0K` → Thousands scaling (`1234` → `1.2K`)
- `fieldname:number:0.00M` → Millions scaling (`1234567` → `1.23M`)
- `fieldname:number:0B` → Billions scaling (`1500000000` → `2B`)

### Currency Format Specification

For currency/money fields, you can specify a format:

```text
fieldname:currency:format
```

**Features:**
- Automatically retrieves currency symbol from `transactioncurrency` entity
- Uses `transactioncurrencyid` lookup on the record
- Caches currency symbols for performance
- Falls back to `$` if currency not found

**Standard Formats:**

- `fieldname:currency:#,##0.00` → Currency symbol + formatted value (`$1,234.56`)
- `fieldname:currency:0.0K` → Currency symbol + thousands scaling (`$1.2K`)
- `fieldname:currency:0.00M` → Currency symbol + millions scaling (`$1.23M`)
- `fieldname:currency:0B` → Currency symbol + billions scaling (`$2B`)

## Configuration Examples

### Example 1: Simple Pattern

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid - statuscode"
}
```

**What happens:**

- `createdon` → auto-detected as `date` (ISO format: yyyy-MM-dd)
- ` | ` → literal text (delimiter)
- `ownerid` → auto-detected as `lookup`
- ` - ` → literal text (delimiter)
- `statuscode` → auto-detected as `optionset`

**Result:** `2025-12-01 | John Smith - Active`

### Example 2: Pattern with Max Length

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid - accountid",
  "maxLength": 50
}
```

**If the result is longer than 50 characters:**

- Truncates to 47 characters
- Adds `...` at the end

**Result (truncated):** `2025-12-01 | John Smith - Contoso Corporatio...`

### Example 3: Custom Date Format

```json
{
  "targetField": "name",
  "pattern": "createdon:date:MM/dd/yyyy | ownerid"
}
```

**Result:** `12/01/2025 | John Smith`

### Example 4: Multiple Date Formats

```json
{
  "targetField": "name",
  "pattern": "createdon:date:yyyy-MM-dd @ modifiedon:date:HH:mm"
}
```

**Result:** `2025-12-01 @ 14:30`

### Example 5: Explicit Type Specification

```json
{
  "targetField": "name",
  "pattern": "accountnumber:string [statuscode:optionset] - createdon:date:MMM yyyy"
}
```

**Result:** `ACC-001 [Active] - Dec 2025`

### Example 6: Complex Delimiters

```json
{
  "targetField": "name",
  "pattern": "firstname lastname (parentcustomerid) - createdon:date:yyyy"
}
```

**Result:** `John Smith (Contoso Ltd) - 2025`

### Example 7: Case/Ticket Naming

```json
{
  "targetField": "title",
  "pattern": "CASE-ticketnumber [prioritycode] createdon:date:yyyy-MM-dd",
  "maxLength": 100
}
```

**Result:** `CASE-1001 [High] 2025-12-01`

### Example 8: Project Naming

```json
{
  "targetField": "name",
  "pattern": "new_projectcode :: customerid :: new_status :: new_startdate:date:yyyy-MM"
}
```

**Result:** `PRJ-2025-001 :: Contoso Ltd :: Active :: 2025-12`

### Example 9: Order Naming with Compact Date

```json
{
  "targetField": "name",
  "pattern": "ORD-createdon:date:yyyyMMdd-ordernumber-customerid",
  "maxLength": 80
}
```

**Result:** `ORD-20251201-12345-Adventure Works`

### Example 10: Maximum Truncation

```json
{
  "targetField": "name",
  "pattern": "accountnumber | name | primarycontactid | ownerid | industrycode",
  "maxLength": 50
}
```

**Result (if too long):** `ACC001 | Contoso Corporation Ltd | Jane Doe...`

## Pattern vs Fields Array

### Pattern-Based

**Pros:**
✅ Simpler, more intuitive syntax
✅ Inline delimiters visible in pattern
✅ Auto-detects field types
✅ Less verbose configuration

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid - statuscode"
}
```

### Fields Array

**Pros:**
✅ Explicit field type specification
✅ Per-field length limits with truncation
✅ Default values for missing/empty fields
✅ Alternate field fallback support
✅ Prefix/suffix per field

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup",
      "maxLength": 50,
      "truncationIndicator": "...",
      "default": "Unknown Customer",
      "alternateField": {
        "field": "accountid",
        "type": "lookup"
      }
    },
    {
      "field": "createdon",
      "type": "date",
      "format": "yyyy-MM-dd"
    },
    {
      "field": "casetypecode",
      "type": "optionset",
      "prefix": "[",
      "suffix": "]"
    }
  ]
}
```

**Both formats are supported!** Choose the one that fits your needs.

- Use **pattern** for simple, readable configurations
- Use **fields array** for advanced per-field control (truncation, defaults, alternates)

## Max Length Feature

### Basic Usage

```json
{
  "targetField": "name",
  "pattern": "field1 | field2 | field3",
  "maxLength": 100
}
```

### Truncation Rules

1. If the concatenated result is **≤ maxLength**, no truncation occurs
2. If the result is **> maxLength**, it truncates to `(maxLength - 3)` and appends `...`
3. If `maxLength ≤ 3`, the feature is ignored (can't truncate meaningfully)

### Examples

| maxLength | Original Result | Final Result |
|-----------|----------------|--------------|
| 50 | `2025-12-01 \| John Smith \| Active` | `2025-12-01 \| John Smith \| Active` (35 chars, no truncation) |
| 30 | `2025-12-01 \| John Smith \| Active` | `2025-12-01 \| John Smith \|...` (30 chars) |
| 20 | `2025-12-01 \| John Smith \| Active` | `2025-12-01 \| Joh...` (20 chars) |

## Common Patterns

### ISO Date + Owner

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid"
}
```

### Case Number + Priority + Date

```json
{
  "targetField": "title",
  "pattern": "CASE-ticketnumber [prioritycode] createdon:date:MMM-dd"
}
```

### Account with Year

```json
{
  "targetField": "name",
  "pattern": "accountnumber-createdon:date:yyyy"
}
```

### Full Contact Name with Company

```json
{
  "targetField": "name",
  "pattern": "firstname lastname @ parentcustomerid"
}
```

### Project Code with Status

```json
{
  "targetField": "name",
  "pattern": "new_projectcode | new_status | createdon:date:yyyy-MM"
}
```

## Field Type Reference

### String Fields

- Pattern: `fieldname` or `fieldname:string`
- Auto-detected for most text fields

### Lookup Fields

- Pattern: `ownerid` or `ownerid:lookup`
- Auto-detected if field name ends with `id`
- Returns the **name** of the referenced record

### Date Fields

- Pattern: `createdon` or `createdon:date` or `createdon:date:yyyy-MM-dd`
- Auto-detected if field name contains `date` or ends with `on`
- Default format: `yyyy-MM-dd` (ISO)

### OptionSet Fields

- Pattern: `statuscode` or `statuscode:optionset`
- Auto-detected if field name ends with `code`, `status`, or `state`
- Returns the **label** (display text)

### Numeric Fields

- Pattern: `fieldname:number` or `fieldname:number:format`
- Auto-detected from metadata for Integer, Decimal, Double fields
- Supports standard .NET numeric formats and K/M/B scaling

**Standard Formatting Examples:**

```json
{
  "targetField": "name",
  "pattern": "accountnumber | numberofemployees:number:#,##0"
}
```

**Result:** `ACC-1001 | 1,250`

**K/M/B Scaling Examples:**

```json
{
  "targetField": "name",
  "pattern": "Company: accountname | Revenue: revenue:number:0.0M"
}
```

**Result:** `Company: Contoso Ltd | Revenue: 2.5M` (if revenue = 2,500,000)

**Common Numeric Formats:**

| Format | Example Input | Example Output | Description |
|--------|--------------|----------------|-------------|
| `#,##0` | 1234 | `1,234` | Thousands separator, no decimals |
| `#,##0.00` | 1234.5 | `1,234.50` | Thousands separator, 2 decimals |
| `0.0K` | 1234 | `1.2K` | Thousands scaling (÷ 1,000) |
| `0.00M` | 1234567 | `1.23M` | Millions scaling (÷ 1,000,000) |
| `0B` | 1500000000 | `2B` | Billions scaling (÷ 1,000,000,000) |

### Currency Fields

- Pattern: `fieldname:currency` or `fieldname:currency:format`
- Auto-detected from metadata for Money fields
- Automatically retrieves currency symbol from `transactioncurrency` entity
- Supports same formats as numeric fields

**Standard Currency Formatting:**

```json
{
  "targetField": "name",
  "pattern": "Opportunity: customerid | Value: estimatedvalue:currency:#,##0.00"
}
```

**Result:** `Opportunity: Contoso Ltd | Value: $125,000.00`

**Currency with K/M/B Scaling:**

```json
{
  "targetField": "name",
  "pattern": "estimatedvalue:currency:0.00M | Budget: budgetamount:currency:0.0K"
}
```

**Result:** `$2.50M | Budget: $450.0K`

**Multi-Currency Support:**

The plugin automatically resolves the correct currency symbol based on the record's `transactioncurrencyid` lookup:

- Record with USD currency → `$2.50M`
- Record with EUR currency → `€2.50M`
- Record with GBP currency → `£2.50M`
- Falls back to `$` if currency not found

**Currency Symbol Caching:**

- Currency symbols are cached by transaction currency GUID
- First lookup retrieves from Dataverse
- Subsequent uses of the same currency use cached symbol
- Improves performance for bulk operations

**Common Currency Formats:**

| Format | Example Input (USD) | Example Output | Description |
|--------|---------------------|----------------|-------------|
| `#,##0.00` | 1234.50 | `$1,234.50` | Standard currency with decimals |
| `0.0K` | 1234 | `$1.2K` | Thousands scaling with symbol |
| `0.00M` | 1234567 | `$1.23M` | Millions scaling with symbol |
| `0B` | 1500000000 | `$2B` | Billions scaling with symbol |

## Tips for Creating Effective Patterns

1. **Keep it Simple**: Start with basic patterns and add complexity as needed
2. **Use Auto-Detection**: Let the plugin infer types when possible
3. **Test Incrementally**: Test with one or two fields before adding more
4. **Consider Max Length**: Set `maxLength` to match your field's schema limit
5. **Use Meaningful Delimiters**: Choose separators that make sense for your data (e.g., `|`, `-`, `::`)
6. **Override Types When Needed**: Use explicit types (`fieldname:type`) for edge cases
