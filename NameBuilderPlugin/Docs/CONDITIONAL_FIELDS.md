# Conditional Field Inclusion

**Conditional Field Inclusion** allows you to show or hide fields in the generated name based on other field values in the record. This is useful for displaying different information depending on the record's state, priority, type, or any other criteria.

## Overview

Use the `includeIf` property in a field configuration to specify a condition. If the condition evaluates to `true`, the field (including its prefix and suffix) is included in the name. If `false`, the field and its prefix/suffix are excluded.

## Basic Example

Show estimated value for open opportunities, actual value for closed opportunities:

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

## Condition Structure

The `includeIf` object has three properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | ✅ | Logical name of the field to evaluate |
| `operator` | string | ✅ | Comparison operator (see below) |
| `value` | string | ❌ | Value to compare against (not required for `isEmpty`/`isNotEmpty`) |

## Supported Operators

### Equality Operators

| Operator | Aliases | Description | Example |
|----------|---------|-------------|---------|
| `equals` | `eq` | Exact match (case-insensitive) | `"statecode"` equals `"0"` |
| `notEquals` | `ne` | Not equal (case-insensitive) | `"statuscode"` notEquals `"1"` |

### String Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `contains` | Field value contains the substring | `"subject"` contains `"urgent"` |
| `notContains` | Field value does not contain the substring | `"description"` notContains `"test"` |

### List Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Field value is in comma-separated list | `"prioritycode"` in `"1,2"` (high or urgent priority) |
| `notIn` | Field value is not in list | `"statecode"` notIn `"2,3"` (not inactive or cancelled) |

### Numeric Comparison Operators

| Operator | Aliases | Description | Example |
|----------|---------|-------------|---------|
| `greaterThan` | `gt` | Field value > comparison value | `"estimatedvalue"` gt `"100000"` |
| `lessThan` | `lt` | Field value < comparison value | `"actualvalue"` lt `"50000"` |
| `greaterThanOrEqual` | `gte` | Field value >= comparison value | `"numberofemployees"` gte `"100"` |
| `lessThanOrEqual` | `lte` | Field value <= comparison value | `"revenue"` lte `"1000000"` |

### Existence Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `isEmpty` | Field has no value (null or empty string) | `"primarycontactid"` isEmpty |
| `isNotEmpty` | Field has a value | `"customerid"` isNotEmpty |

## Type-Aware Comparison

The condition evaluator automatically handles different Dataverse field types:

### OptionSet / Picklist / State / Status

Compares the **numeric value** of the option:

```json
{
  "field": "prioritycode",
  "operator": "equals",
  "value": "1"
}
```

- Evaluates `entity.GetAttributeValue<OptionSetValue>("prioritycode")?.Value` against `1`
- Use the numeric value (1, 2, 3), not the label ("High", "Medium", "Low")

### Lookup / Customer / Owner

Compares the **name** of the referenced entity:

```json
{
  "field": "ownerid",
  "operator": "equals",
  "value": "John Smith"
}
```

- Evaluates `entity.GetAttributeValue<EntityReference>("ownerid")?.Name` against `"John Smith"`
- Use the display name of the referenced record

### Money / Currency

Compares the **decimal value**:

```json
{
  "field": "estimatedvalue",
  "operator": "greaterThan",
  "value": "100000"
}
```

- Evaluates `entity.GetAttributeValue<Money>("estimatedvalue")?.Value` against `100000.0`

### Date / DateTime

Compares the **formatted date** (yyyy-MM-dd):

```json
{
  "field": "createdon",
  "operator": "greaterThan",
  "value": "2025-01-01"
}
```

- Formats date as `yyyy-MM-dd` before comparison

### Boolean

Compares as `"true"` or `"false"` strings:

```json
{
  "field": "donotbulkemail",
  "operator": "equals",
  "value": "true"
}
```

### String / Memo

Direct string comparison (case-insensitive for equals/notEquals):

```json
{
  "field": "emailaddress1",
  "operator": "contains",
  "value": "@contoso.com"
}
```

## Compound Conditions

### anyOf (OR Logic)

Use `anyOf` when you want to include a field if **any** of the sub-conditions is true:

```json
{
  "field": "actualvalue",
  "type": "currency",
  "format": "0.00M",
  "prefix": " - Closed: ",
  "includeIf": {
    "anyOf": [
      { "field": "statecode", "operator": "equals", "value": "1" },
      { "field": "statecode", "operator": "equals", "value": "2" }
    ]
  }
}
```

**Result**: Shows actualvalue if opportunity is Won (1) **OR** Lost (2).

### allOf (AND Logic)

Use `allOf` when you want to include a field only if **all** sub-conditions are true:

```json
{
  "field": "estimatedvalue",
  "type": "currency",
  "format": "0.00M",
  "prefix": " - Large Deal: ",
  "includeIf": {
    "allOf": [
      { "field": "statecode", "operator": "equals", "value": "0" },
      { "field": "estimatedvalue", "operator": "greaterThan", "value": "1000000" }
    ]
  }
}
```

**Result**: Shows estimatedvalue only if opportunity is Open (0) **AND** value > $1M.

### Nested Compound Conditions

You can nest `anyOf` and `allOf` for complex logic:

```json
{
  "field": "subject",
  "type": "string",
  "prefix": "⚠️ ",
  "includeIf": {
    "anyOf": [
      { "field": "subject", "operator": "contains", "value": "Emergency" },
      { "field": "subject", "operator": "isEmpty" },
      {
        "allOf": [
          { "field": "prioritycode", "operator": "equals", "value": "1" },
          { "field": "statecode", "operator": "equals", "value": "0" }
        ]
      }
    ]
  }
}
```

**Result**: Shows warning emoji if subject contains "Emergency" **OR** is empty **OR** (priority is 1 **AND** case is active).

## Advanced Examples

### Example 1: High-Priority Cases

Show "URGENT:" prefix only for high-priority cases:

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "subject",
      "type": "string",
      "prefix": "URGENT: ",
      "includeIf": {
        "field": "prioritycode",
        "operator": "in",
        "value": "1,2"
      }
    }
  ]
}
```

**Result**:

- Priority 1 or 2: `URGENT: Server Down`
- Priority 3 or 4: `Server Down`

### Example 2: Large Opportunities

Show account size only for opportunities over $1M:

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup"
    },
    {
      "field": "numberofemployees",
      "type": "number",
      "format": "#,##0",
      "prefix": " (",
      "suffix": " employees)",
      "includeIf": {
        "field": "estimatedvalue",
        "operator": "greaterThan",
        "value": "1000000"
      }
    }
  ]
}
```

**Result**:

- $2.5M opportunity: `Contoso Ltd (1,250 employees)`
- $500K opportunity: `Fabrikam Inc`

### Example 3: Conditional Date Display

Show estimated close date for open opportunities, actual close date for closed:

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "customerid",
      "type": "lookup"
    },
    {
      "field": "estimatedclosedate",
      "type": "date",
      "format": "yyyy-MM-dd",
      "prefix": " - Est Close: ",
      "includeIf": {
        "field": "statecode",
        "operator": "equals",
        "value": "0"
      }
    },
    {
      "field": "actualclosedate",
      "type": "date",
      "format": "yyyy-MM-dd",
      "prefix": " - Closed: ",
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

- Open: `Contoso Ltd - Est Close: 2025-06-15`
- Closed: `Contoso Ltd - Closed: 2025-05-20`

### Example 4: Empty Field Check

Show contact only if assigned:

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "title",
      "type": "string"
    },
    {
      "field": "primarycontactid",
      "type": "lookup",
      "prefix": " - Contact: ",
      "includeIf": {
        "field": "primarycontactid",
        "operator": "isNotEmpty"
      }
    }
  ]
}
```

**Result**:

- With contact: `Q4 2025 Campaign - Contact: John Smith`
- No contact: `Q4 2025 Campaign`

### Example 5: Owner-Based Conditional

Show "MY OPPORTUNITY" prefix for opportunities owned by current user:

```json
{
  "targetField": "name",
  "fields": [
    {
      "field": "name",
      "type": "string",
      "prefix": "MY OPPORTUNITY: ",
      "includeIf": {
        "field": "ownerid",
        "operator": "equals",
        "value": "Current User Name"
      }
    },
    {
      "field": "customerid",
      "type": "lookup"
    }
  ]
}
```

**Note**: You'll need to use the actual owner name in the condition value.

### Example 6: Won or Lost Opportunities (anyOf)

Show actual value for opportunities that are Won OR Lost:

```json
{
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
    }
  ]
}
```

**Result**:

- Won (statecode=1): `Contoso Ltd - Final: $2.35M`
- Lost (statecode=2): `Contoso Ltd - Final: $0.00M`
- Open (statecode=0): `Contoso Ltd`

### Example 7: Large Active Deals (allOf)

Show special indicator for large deals that are still active:

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
      "prefix": " 🎯 MAJOR DEAL: ",
      "includeIf": {
        "allOf": [
          { "field": "statecode", "operator": "equals", "value": "0" },
          { "field": "estimatedvalue", "operator": "greaterThanOrEqual", "value": "5000000" }
        ]
      }
    }
  ]
}
```

**Result**:

- $7M active opportunity: `Contoso Ltd 🎯 MAJOR DEAL: $7.00M`
- $2M active opportunity: `Fabrikam Inc`
- $7M closed opportunity: `Northwind Traders`

## Prefix/Suffix Behavior

When a condition evaluates to `false`, the **entire field is excluded**, including its `prefix` and `suffix`:

```json
{
  "field": "estimatedvalue",
  "type": "currency",
  "format": "0.00M",
  "prefix": " - Est: ",
  "suffix": " USD",
  "includeIf": {
    "field": "statecode",
    "operator": "equals",
    "value": "0"
  }
}
```

If `statecode` is **not** `0`:

- ❌ Field value excluded
- ❌ Prefix `" - Est: "` excluded
- ❌ Suffix `" USD"` excluded
- Result: No extra delimiters or spacing

## Performance Considerations

- **In-Memory Evaluation**: All condition checks are performed in memory using the entity data already loaded by the plugin
- **No Additional Queries**: Conditional evaluation does not trigger additional Dataverse queries
- **PreImage/PostImage**: Ensure condition fields are included in the plugin step's PreImage or are present in the Target entity
- **Metadata Caching**: Field metadata is cached, so condition evaluation is fast

## Debugging Conditional Fields

Enable tracing to see condition evaluation results:

```json
{
  "targetField": "name",
  "enableTracing": true,
  "fields": [
    {
      "field": "estimatedvalue",
      "type": "currency",
      "includeIf": {
        "field": "statecode",
        "operator": "equals",
        "value": "0"
      }
    }
  ]
}
```

**Trace Output**:

```text
ConditionEvaluator: Evaluating condition for field 'statecode' with operator 'equals' and value '0'
ConditionEvaluator: Condition result = True
```

## JSON Schema Support

The plugin includes a JSON schema that provides IntelliSense and validation for conditional fields in VS Code:

1. **Auto-Completion**: Type `"includeIf"` and see available properties
2. **Operator Enum**: Select from valid operators with descriptions
3. **Validation**: Get warnings for invalid operator values or missing required fields

**Enable Schema**: Add to the top of your config file:

```json
{
  "$schema": "./plugin-config.schema.json",
  "targetField": "name",
  ...
}
```

## Common Patterns

### State-Based Display

Different fields for different record states (draft, active, completed):

```json
{
  "fields": [
    {
      "field": "draftvalue",
      "includeIf": { "field": "statecode", "operator": "equals", "value": "0" }
    },
    {
      "field": "activevalue",
      "includeIf": { "field": "statecode", "operator": "equals", "value": "1" }
    },
    {
      "field": "completedvalue",
      "includeIf": { "field": "statecode", "operator": "equals", "value": "2" }
    }
  ]
}
```

### Priority-Based Formatting

Add visual indicators for high-priority records:

```json
{
  "fields": [
    {
      "field": "title",
      "prefix": "🔴 ",
      "includeIf": { "field": "prioritycode", "operator": "equals", "value": "1" }
    },
    {
      "field": "title",
      "prefix": "🟡 ",
      "includeIf": { "field": "prioritycode", "operator": "equals", "value": "2" }
    },
    {
      "field": "title",
      "includeIf": { "field": "prioritycode", "operator": "notIn", "value": "1,2" }
    }
  ]
}
```

### Threshold-Based Display

Show additional details only when values exceed thresholds:

```json
{
  "fields": [
    {
      "field": "customerid",
      "type": "lookup"
    },
    {
      "field": "estimatedvalue",
      "type": "currency",
      "format": "0.00M",
      "prefix": " - VALUE: ",
      "includeIf": { "field": "estimatedvalue", "operator": "greaterThan", "value": "1000000" }
    }
  ]
}
```

### Type-Based Conditional

Different formatting based on record type:

```json
{
  "fields": [
    {
      "field": "accountnumber",
      "prefix": "Acct: ",
      "includeIf": { "field": "type", "operator": "equals", "value": "customer" }
    },
    {
      "field": "partnumber",
      "prefix": "Partner: ",
      "includeIf": { "field": "type", "operator": "equals", "value": "partner" }
    }
  ]
}
```

## See Also

- [EXAMPLES.md](EXAMPLES.md) - More configuration examples
- [SCHEMA.md](SCHEMA.md) - JSON schema documentation
- [README.md](README.md) - Main documentation
