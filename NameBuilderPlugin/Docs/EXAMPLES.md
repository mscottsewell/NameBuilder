# Configuration Examples

Comprehensive examples of pattern-based configurations
for the Dataverse Name Builder Plugin.

## Key Features

- **Metadata-Driven Type Detection**: Field types automatically detected from Dataverse metadata
- **Auto-Length Detection**: Target field max length retrieved from metadata (can be overridden)
- **Smart Inference**: Works with custom lookup fields regardless of naming conventions

## Pattern Syntax Quick Reference

```text
fieldname                    → Auto-detected type via metadata
fieldname:type               → Explicit type (overrides auto-detection)
fieldname:date:format        → Date with custom format
literal text                 → Any non-field text becomes delimiter
```

## 1. Simple Patterns

### Date Only

```json
{
  "targetField": "name",
  "pattern": "createdon"
}
```

Result: `2025-12-01`

### Lookup Only

```json
{
  "targetField": "name",
  "pattern": "ownerid"
}
```

Result: `John Smith`

### OptionSet Only

```json
{
  "targetField": "name",
  "pattern": "statecode"
}
```

Result: `Active`

## 2. Account Entity Examples

### Account Number + Category + Year

```json
{
  "targetField": "name",
  "pattern": "accountnumber - accountcategorycode - createdon:date:yyyy"
}
```

Result: `ACC001 - Preferred Customer - 2025`

### Account with Status and Date

```json
{
  "targetField": "name",
  "pattern": "ACC-accountnumber | statecode | createdon:date:MMM dd, yyyy"
}
```

Result: `ACC-12345 | Active | Dec 01, 2025`

## 3. Contact Entity Examples

### Full Name with Account

```json
{
  "targetField": "name",
  "pattern": "firstname lastname @ parentcustomerid"
}
```

Result: `John Smith @ Contoso Ltd`

### Contact with Parentheses Around Company

```json
{
  "targetField": "name",
  "pattern": "firstname lastname (parentcustomerid)"
}
```

Result: `John Smith (Contoso Ltd)`

## 4. Case/Incident Entity Examples

### Case Number + Priority + Date

```json
{
  "targetField": "title",
  "pattern": "CASE-ticketnumber [prioritycode] createdon:date:MMM-dd"
}
```

Result: `CASE-1001 [High] Dec-01`

### Case with Full DateTime

```json
{
  "targetField": "title",
  "pattern": "CASE-ticketnumber [prioritycode] createdon:date:yyyy-MM-dd HH:mm"
}
```

Result: `CASE-1001 [High] 2025-12-01 14:30`

## 5. Custom Entity Examples

### Project Entity

```json
{
  "targetField": "name",
  "pattern": "new_projectcode :: new_customerid :: new_status :: new_startdate:date:yyyy-MM"
}
```

Result: `PRJ-2025-001 :: Contoso Ltd :: Active :: 2025-12`

### Order Entity with Compact Date

```json
{
  "targetField": "name",
  "pattern": "ORD-createdon:date:yyyyMMdd-ordernumber-customerid"
}
```

Result: `ORD-20251201-12345-Adventure Works`

## 6. Advanced Formatting Examples

### Sequential Parts Without Delimiter

```json
{
  "targetField": "name",
  "pattern": "new_year-new_month-SEQnew_sequence"
}
```

Result: `2025-12-SEQ001`

### Complex Delimiter

```json
{
  "targetField": "name",
  "pattern": "new_department :: new_employeeid :: ownerid"
}
```

Result: `Sales :: EMP001 :: John Smith`

### Mixed Delimiters

```json
{
  "targetField": "name",
  "pattern": "firstname lastname | parentcustomerid - createdon:date:yyyy"
}
```

Result: `John Smith | Contoso Ltd - 2025`

## 7. Date Format Examples

### ISO Format (Default)

```json
{
  "targetField": "name",
  "pattern": "createdon"
}
```

Result: `2025-12-01`

### US Format

```json
{
  "targetField": "name",
  "pattern": "createdon:date:MM/dd/yyyy"
}
```

Result: `12/01/2025`

### European Format

```json
{
  "targetField": "name",
  "pattern": "createdon:date:dd.MM.yyyy"
}
```

Result: `01.12.2025`

### Long Date

```json
{
  "targetField": "name",
  "pattern": "createdon:date:MMMM dd, yyyy"
}
```

Result: `December 01, 2025`

### Short Month and Year

```json
{
  "targetField": "name",
  "pattern": "createdon:date:MMM-yy"
}
```

Result: `Dec-25`

### Year and Week

```json
{
  "targetField": "name",
  "pattern": "createdon:date:yyyy-'W'ww"
}
```

Result: `2025-W48`

### DateTime with Time

```json
{
  "targetField": "name",
  "pattern": "createdon:datetime:yyyy-MM-dd HH:mm:ss"
}
```

Result: `2025-12-01 14:30:45`

### Compact Format

```json
{
  "targetField": "name",
  "pattern": "createdon:date:yyyyMMdd"
}
```

Result: `20251201`

## 8. Examples with Max Length

### Basic Truncation

```json
{
  "targetField": "name",
  "pattern": "accountnumber | name | primarycontactid | ownerid | industrycode",
  "maxLength": 50
}
```

Result (if too long): `ACC001 | Contoso Corporation Ltd | Jane Doe...`

### Case with Length Limit

```json
{
  "targetField": "title",
  "pattern": "CASE-ticketnumber [prioritycode] customerid - createdon:date:yyyy-MM-dd",
  "maxLength": 80
}
```

Result: Full string if ≤80 chars, truncated with `...` if longer

### Project with Controlled Length

```json
{
  "targetField": "name",
  "pattern": "new_projectcode | new_name | new_customerid | new_status",
  "maxLength": 100
}
```

Result: Ensures name field never exceeds 100 characters

## 9. Real-World Use Cases

### Sales Order

```json
{
  "targetField": "name",
  "pattern": "SO-ordernumber | customerid | createdon:date:yyyyMMdd",
  "maxLength": 150
}
```

Result: `SO-12345 | Contoso Ltd | 20251201`

### Service Ticket

```json
{
  "targetField": "title",
  "pattern": "TKT-ticketnumber [prioritycode] [caseorigincode] createdon:date:MMM-dd",
  "maxLength": 100
}
```

Result: `TKT-1001 [High] [Phone] Dec-01`

### Quote

```json
{
  "targetField": "name",
  "pattern": "QTE-quotenumber | customerid | totalamount - createdon:date:yyyy-MM",
  "maxLength": 120
}
```

Result: `QTE-Q2025-001 | Adventure Works | 50000 - 2025-12`

### Invoice

```json
{
  "targetField": "name",
  "pattern": "INV-createdon:date:yyyyMMdd-invoicenumber-customerid",
  "maxLength": 100
}
```

Result: `INV-20251201-INV001-Contoso`

### Appointment

```json
{
  "targetField": "name",
  "pattern": "scheduledstart:date:MMM dd @ HH:mm | regardingobjectid",
  "maxLength": 150
}
```

Result: `Dec 01 @ 14:30 | Project Kickoff Meeting`

## 10. Explicit Type Specifications

### When Auto-Detection Might Fail

```json
{
  "targetField": "name",
  "pattern": "new_customid:string | new_customdate:date:yyyy-MM-dd | new_customstatus:optionset"
}
```

Use explicit types for custom fields that don't follow naming conventions.

### Mixed Standard and Custom Fields

```json
{
  "targetField": "name",
  "pattern": "createdon | ownerid | new_customfield:lookup | new_priority:optionset"
}
```

Standard fields auto-detect, custom fields use explicit types.

## 11. Testing Configurations

### Minimal Test

```json
{
  "targetField": "name",
  "pattern": "createdon"
}
```

### Full Feature Test

```json
{
  "targetField": "name",
  "pattern": "new_string|new_lookup|new_date:date:yyyy-MM-dd|new_option",
  "maxLength": 200
}
```

Result: `TestValue | Related Record | 2025-12-01 | Active`

## 12. Fields Array Configuration

The plugin supports an alternative **fields array** format for advanced per-field control.

### Basic Fields Array

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup"
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

Result: `Contoso Ltd 2025-12-01 [Request]`

### Field-Level Truncation

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup",
      "maxLength": 30,
      "truncationIndicator": "..."
    },
    {
      "field": "title",
      "type": "string",
      "maxLength": 50,
      "truncationIndicator": "…"
    }
  ]
}
```

If `customerid` resolves to `"Adventure Works Cycles Corporation"` (36 chars), it truncates to:
`Adventure Works Cycles Cor...` (30 chars)

### Default Values for Missing Fields

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup",
      "default": "Unknown Customer"
    },
    {
      "field": "prioritycode",
      "type": "optionset",
      "default": "Normal"
    }
  ]
}
```

If `customerid` is empty/missing, returns: `Unknown Customer Normal`

### Alternate Field Fallback

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup",
      "alternateField": {
        "field": "accountid",
        "type": "lookup"
      }
    }
  ]
}
```

**Fallback logic:**

1. Try `customerid` first
2. If missing/empty, try `accountid`
3. If both fail, return empty string

### Complex Alternate Chain with Defaults

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "primarycontactid",
      "type": "lookup",
      "maxLength": 40,
      "truncationIndicator": "...",
      "alternateField": {
        "field": "customerid",
        "type": "lookup",
        "default": "No Contact"
      }
    }
  ]
}
```

**Resolution order:**

1. Try `primarycontactid`
2. If missing, try `customerid`
3. If `customerid` is also missing, use `"No Contact"`
4. Apply 40-char truncation to final result

### Real-World Example: Customer Support Case

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
      "maxLength": 50,
      "truncationIndicator": "...",
      "alternateField": {
        "field": "accountid",
        "type": "lookup",
        "default": "Walk-in Customer"
      },
      "prefix": " ",
      "suffix": " |"
    },
    {
      "field": "productid",
      "type": "lookup",
      "default": "General",
      "prefix": " "
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

**Example output:**
`20251201 Adventure Works Cycles Corporation... | Surface Pro 9 | Request`

### Fields Array Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | ✅ | Field logical name |
| `type` | string | ❌ | Field type (auto-detected if omitted) |
| `format` | string | ❌ | Date format (e.g., `yyyy-MM-dd`) |
| `maxLength` | number | ❌ | Maximum characters for this field |
| `truncationIndicator` | string | ❌ | String to append when truncated (default: `...`) |
| `default` | string | ❌ | Value when field is missing/empty |
| `alternateField` | object | ❌ | Fallback field configuration |
| `prefix` | string | ❌ | Text before field value |
| `suffix` | string | ❌ | Text after field value |

### Pattern vs Fields Array Comparison

| Feature | Pattern | Fields Array |
|---------|---------|--------------|
| Syntax simplicity | ✅ Simple | ⚠️ Verbose |
| Auto-type detection | ✅ Yes | ✅ Yes (optional override) |
| Inline delimiters | ✅ Yes | ❌ No (use prefix/suffix) |
| Per-field truncation | ❌ No | ✅ Yes |
| Default values | ❌ No | ✅ Yes |
| Alternate fallback | ❌ No | ✅ Yes |
| Global maxLength | ✅ Yes | ✅ Yes |

**Recommendation:**

- Use **pattern** for straightforward name building
- Use **fields array** when you need truncation, defaults, or alternate field fallback

Additional examples ensure names stay readable and
consistent with your chosen pattern semantics.
