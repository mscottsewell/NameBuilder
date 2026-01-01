# Numeric and Currency Field Formatting

## Overview

The plugin now supports advanced formatting for numeric and currency fields, including:
- Thousands separators
- Custom decimal places
- K/M/B scaling for compact display
- Automatic currency symbol lookup from transaction currency

## Numeric Fields

### Field Type
- **type**: `"number"`
- Auto-detected for: `Integer`, `Decimal`, `Double` attribute types

### Format Property

The `format` property accepts:
1. **Standard .NET numeric format strings**
2. **K/M/B scaling suffixes**

### Common Format Examples

| Format | Input | Output | Description |
|--------|-------|--------|-------------|
| `"#,##0.00"` | 1234.56 | `1,234.56` | Thousands separator with 2 decimals |
| `"#,##0"` | 1234.56 | `1,235` | Thousands separator, no decimals (rounds) |
| `"0.0K"` | 1234 | `1.2K` | Thousands scaling with 1 decimal |
| `"0.00K"` | 1234 | `1.23K` | Thousands scaling with 2 decimals |
| `"0.0M"` | 1500000 | `1.5M` | Millions scaling with 1 decimal |
| `"0.00M"` | 1500000 | `1.50M` | Millions scaling with 2 decimals |
| `"0B"` | 3000000000 | `3B` | Billions scaling, no decimals |
| `"0.00B"` | 3500000000 | `3.50B` | Billions scaling with 2 decimals |

### Default Format
If no format is specified, defaults to `#,##0.##` (thousands separator, up to 2 decimals, no trailing zeros)

### Configuration Example

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "employeecount",
      "type": "number",
      "format": "#,##0",
      "prefix": "Employees: "
    },
    {
      "field": "annualrevenue",
      "type": "number",
      "format": "0.0M",
      "prefix": " | Revenue: $",
      "suffix": ""
    }
  ]
}
```

**Result**: `Employees: 1,250 | Revenue: $2.5M`

## Currency Fields

### Field Type
- **type**: `"currency"`
- Auto-detected for: `Money` attribute type
- Dataverse Money fields are `Microsoft.Xrm.Sdk.Money` objects

### Currency Symbol Lookup

The plugin automatically:
1. Reads the record's `transactioncurrencyid` field
2. Retrieves the `currencysymbol` from the referenced currency record
3. Prepends the symbol to the formatted amount
4. Caches symbols by currency ID for performance

**Note**: If the record has no `transactioncurrencyid`, the amount is displayed without a symbol.

### Format Property

Same as numeric fields:
1. **Standard .NET numeric format strings**
2. **K/M/B scaling suffixes**

### Common Format Examples

| Format | Input (USD) | Output | Description |
|--------|-------------|--------|-------------|
| `"#,##0.00"` | 1234.56 | `$1,234.56` | Default: symbol + thousands separator + 2 decimals |
| `"#,##0"` | 1234.56 | `$1,235` | Symbol + thousands separator, no decimals |
| `"0.0K"` | 1234 | `$1.2K` | Symbol + thousands scaling |
| `"0.00M"` | 1500000 | `$1.50M` | Symbol + millions scaling |
| `"0B"` | 3000000000 | `$3B` | Symbol + billions scaling |

### Default Format
If no format is specified, defaults to `#,##0.00` with currency symbol.

### Multi-Currency Support

The plugin respects the record's transaction currency:
- USD record: `$1,234.56`
- EUR record: `€1,234.56`
- GBP record: `£1,234.56`
- JPY record: `¥1,235`

### Configuration Example

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "estimatedvalue",
      "type": "currency",
      "format": "0.0M",
      "prefix": "Value: "
    },
    {
      "field": "budgetamount",
      "type": "currency",
      "format": "#,##0.00",
      "prefix": " | Budget: "
    }
  ]
}
```

**Result** (USD): `Value: $2.5M | Budget: $150,000.00`

**Result** (EUR): `Value: €2.5M | Budget: €150,000.00`

## Complete Example: Opportunity Name with Estimated Value/Date

```json
{
  "enableTracing": false,
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup",
      "suffix": " | ",
      "maxLength": 15
    },
    {
      "field": "estimatedvalue",
      "type": "currency",
      "format": "0.0K",
      "prefix": "Est: "
    },
    {
      "field": "estimatedclosedate",
      "type": "date",
      "format": "MMM yyyy",
      "prefix": " ",
      "timezoneOffsetHours": -6
    },
    {
      "field": "customerneed",
      "type": "string",
      "maxLength": 50,
      "truncationIndicator": "...",
      "prefix": " | "
    },
    {
      "field": "proposedsolution",
      "type": "string",
      "maxLength": 40,
      "truncationIndicator": "...",
      "prefix": " - "
    }
  ],
  "maxLength": 200
}
```

**Result**: `Contoso Corp... | Est: £2.1K Oct 2025 | Pedals - UK Road XL`

## Performance Considerations

### Caching
- Currency symbols are cached by `transactioncurrencyid` GUID
- Subsequent records with the same currency use cached symbol
- No additional lookups after first retrieval per currency

### Best Practices
1. Specify format explicitly to control rounding and decimals
2. Use K/M/B scaling for large numbers to save space
3. Combine with `maxLength` for predictable name field sizes
4. For very large datasets, consider caching implications (symbols are static per currency)

## Metadata Auto-Detection

The plugin automatically detects:
- `Integer`, `Decimal`, `Double` → `"number"`
- `Money` → `"currency"`

You can override by explicitly setting `type` in configuration.

## Format String Reference

### .NET Numeric Format Strings
- `#` = digit placeholder (omits leading/trailing zeros)
- `0` = zero placeholder (displays zero if no digit)
- `,` = thousands separator
- `.` = decimal separator

### Scaling Suffixes
- `K` = divide by 1,000
- `M` = divide by 1,000,000
- `B` = divide by 1,000,000,000

**Example**: `"0.00M"` means "divide by 1 million, show 2 decimal places, append 'M'"
