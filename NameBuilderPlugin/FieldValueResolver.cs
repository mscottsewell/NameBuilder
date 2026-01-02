using System;
using System.Globalization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk.Metadata;

namespace NameBuilder
{
    /// <summary>
    /// Resolves Dataverse attribute values into displayable strings according to pattern configuration.
    /// </summary>
    /// <remarks>
    /// <para>
    /// This class encapsulates the Dataverse-specific rules and edge cases for converting attributes into text:
    /// lookups (entity references), option sets (labels), dates (format + optional timezone adjustment), and
    /// numeric/currency formatting.
    /// </para>
    /// <para>
    /// Some operations require metadata (e.g., option set labels when no formatted value is present). To keep the
    /// plugin fast, metadata results are cached in static, thread-safe dictionaries.
    /// </para>
    /// </remarks>
    public class FieldValueResolver
    {
        private readonly IOrganizationService _service;
        private readonly ITracingService _tracingService;
        // Cache option set labels to avoid repeated metadata retrievals: key = entity|attribute|value
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _optionLabelCache = new System.Collections.Concurrent.ConcurrentDictionary<string, string>();
        // Cache primary name attributes: key = entityLogicalName
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _primaryNameCache = new System.Collections.Concurrent.ConcurrentDictionary<string, string>();
        // Cache field type metadata: key = entity|fieldname, value = AttributeTypeCode
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode> _fieldTypeCache = new System.Collections.Concurrent.ConcurrentDictionary<string, Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode>();

        /// <summary>
        /// Creates a new resolver.
        /// </summary>
        /// <param name="service">Dataverse organization service used for lookups and metadata.</param>
        /// <param name="tracingService">Tracing service for diagnostics.</param>
        public FieldValueResolver(IOrganizationService service, ITracingService tracingService)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
            _tracingService = tracingService ?? throw new ArgumentNullException(nameof(tracingService));
        }

        /// <summary>
        /// Resolves the string value for a single <see cref="PatternPart"/>.
        /// </summary>
        /// <remarks>
        /// Handles:
        /// <list type="bullet">
        /// <item><description>Conditional inclusion via <see cref="PatternPart.IncludeIf"/></description></item>
        /// <item><description>Alternate fields via <see cref="PatternPart.AlternateField"/></description></item>
        /// <item><description>Defaults via <see cref="PatternPart.DefaultValue"/></description></item>
        /// <item><description>Per-field truncation via <see cref="PatternPart.MaxFieldLength"/></description></item>
        /// <item><description>Prefix/suffix wrapping via <see cref="PatternPart.Prefix"/> and <see cref="PatternPart.Suffix"/></description></item>
        /// </list>
        /// </remarks>
        /// <param name="entity">Entity providing attribute values.</param>
        /// <param name="patternPart">Pattern part to resolve.</param>
        /// <returns>Resolved text (possibly empty).</returns>
        public string ResolvePatternFieldValue(Entity entity, PatternPart patternPart)
        {
            if (patternPart == null)
            {
                throw new ArgumentNullException(nameof(patternPart));
            }

            if (!patternPart.IsField)
            {
                return patternPart.LiteralText ?? string.Empty;
            }

            // Check conditional inclusion
            if (patternPart.IncludeIf != null)
            {
                bool conditionMet = ConditionEvaluator.EvaluateCondition(entity, patternPart.IncludeIf, _tracingService);
                if (!conditionMet)
                {
                    // Excluding the value here ensures prefix/suffix are also skipped.
                    _tracingService.Trace($"Condition not met for field '{patternPart.FieldName}', excluding from output");
                    return string.Empty;
                }
            }

            if (entity == null || !entity.Contains(patternPart.FieldName))
            {
                // Try alternate field if specified
                if (patternPart.AlternateField != null)
                {
                    // Create a derived PatternPart for the alternate field, inheriting any defaults not specified.
                    var alternatePart = new PatternPart
                    {
                        IsField = true,
                        FieldName = patternPart.AlternateField.Field,
                        FieldType = patternPart.AlternateField.Type ?? PatternParser.InferFieldType(patternPart.AlternateField.Field),
                        DateFormat = patternPart.AlternateField.Format ?? "yyyy-MM-dd",
                        MaxFieldLength = patternPart.AlternateField.MaxLength,
                        TruncationIndicator = patternPart.AlternateField.TruncationIndicator ?? "...",
                        DefaultValue = patternPart.AlternateField.Default
                    };
                    return ResolvePatternFieldValue(entity, alternatePart);
                }
                
                // Return default value if specified
                if (!string.IsNullOrEmpty(patternPart.DefaultValue))
                {
                    return patternPart.DefaultValue;
                }
                
                return string.Empty;
            }

            string value = string.Empty;

            try
            {
                switch (patternPart.FieldType.ToLowerInvariant())
                {
                    case "string":
                        value = ResolveStringField(entity, patternPart.FieldName);
                        break;

                    case "lookup":
                        value = ResolveLookupField(entity, patternPart.FieldName);
                        break;

                    case "date":
                    case "datetime":
                        value = ResolveDateField(entity, patternPart.FieldName, patternPart.DateFormat, patternPart.TimezoneOffsetHours);
                        break;

                    case "number":
                        value = ResolveNumberField(entity, patternPart.FieldName, patternPart.DateFormat);
                        break;

                    case "currency":
                        value = ResolveCurrencyField(entity, patternPart.FieldName, patternPart.DateFormat, entity);
                        break;

                    case "optionset":
                    case "picklist":
                        value = ResolveOptionSetField(entity, patternPart.FieldName);
                        break;

                    default:
                        _tracingService.Trace($"Unknown field type: {patternPart.FieldType}");
                        break;
                }
                
                // If value is empty and we have a default, use it
                if (string.IsNullOrEmpty(value))
                {
                    // Try alternate field if specified
                    if (patternPart.AlternateField != null)
                    {
                        var alternatePart = new PatternPart
                        {
                            IsField = true,
                            FieldName = patternPart.AlternateField.Field,
                            FieldType = patternPart.AlternateField.Type ?? PatternParser.InferFieldType(patternPart.AlternateField.Field),
                            DateFormat = patternPart.AlternateField.Format ?? "yyyy-MM-dd",
                            MaxFieldLength = patternPart.AlternateField.MaxLength,
                            TruncationIndicator = patternPart.AlternateField.TruncationIndicator ?? "...",
                            DefaultValue = patternPart.AlternateField.Default,
                            TimezoneOffsetHours = patternPart.AlternateField.TimezoneOffsetHours
                        };
                        value = ResolvePatternFieldValue(entity, alternatePart);
                    }
                    
                    if (string.IsNullOrEmpty(value) && !string.IsNullOrEmpty(patternPart.DefaultValue))
                    {
                        value = patternPart.DefaultValue;
                    }
                }
                
                // Apply field-level truncation if specified
                if (patternPart.MaxFieldLength.HasValue && value.Length > patternPart.MaxFieldLength.Value)
                {
                    var indicator = patternPart.TruncationIndicator ?? "...";
                    var maxLen = patternPart.MaxFieldLength.Value;
                    if (maxLen > indicator.Length)
                    {
                        value = value.Substring(0, maxLen - indicator.Length) + indicator;
                    }
                }
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error resolving field '{patternPart.FieldName}': {ex.Message}");
                
                // Try alternate field on error
                if (patternPart.AlternateField != null)
                {
                    var alternatePart = new PatternPart
                    {
                        IsField = true,
                        FieldName = patternPart.AlternateField.Field,
                        FieldType = patternPart.AlternateField.Type ?? PatternParser.InferFieldType(patternPart.AlternateField.Field),
                        DateFormat = patternPart.AlternateField.Format ?? "yyyy-MM-dd",
                        MaxFieldLength = patternPart.AlternateField.MaxLength,
                        TruncationIndicator = patternPart.AlternateField.TruncationIndicator ?? "...",
                        DefaultValue = patternPart.AlternateField.Default,
                        TimezoneOffsetHours = patternPart.AlternateField.TimezoneOffsetHours
                    };
                    return ResolvePatternFieldValue(entity, alternatePart);
                }
                
                return patternPart.DefaultValue ?? string.Empty;
            }

            // Wrap with prefix/suffix if value is not empty
            return WrapWithPrefixSuffix(value, patternPart);
        }

        /// <summary>
        /// Wraps a resolved field value with prefix/suffix when configured.
        /// </summary>
        private string WrapWithPrefixSuffix(string value, PatternPart patternPart)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            var result = value;
            if (!string.IsNullOrEmpty(patternPart.Prefix))
            {
                result = patternPart.Prefix + result;
            }
            if (!string.IsNullOrEmpty(patternPart.Suffix))
            {
                result = result + patternPart.Suffix;
            }
            return result;
        }

        /// <summary>
        /// Resolve numeric field value with optional formatting.
        /// Supports standard .NET numeric formats (e.g., "#,##0.00") and K/M/B scaling like "0.0K", "0.00M", "0B".
        /// </summary>
        /// <remarks>
        /// If the underlying attribute type is not a numeric CLR type, this falls back to <see cref="object.ToString"/>.
        /// </remarks>
        private string ResolveNumberField(Entity entity, string fieldName, string format)
        {
            // Handle integer, decimal, double as object and convert to decimal for consistency
            if (!entity.Contains(fieldName) || entity[fieldName] == null)
            {
                return string.Empty;
            }

            decimal number;
            var val = entity[fieldName];
            if (val is int i)
            {
                number = i;
            }
            else if (val is long l)
            {
                number = l;
            }
            else if (val is double d)
            {
                number = (decimal)d;
            }
            else if (val is float f)
            {
                number = (decimal)f;
            }
            else if (val is decimal m)
            {
                number = m;
            }
            else
            {
                return val.ToString();
            }

            if (string.IsNullOrWhiteSpace(format))
            {
                // Default with thousands separators and up to 2 decimals
                return number.ToString("#,##0.##", CultureInfo.InvariantCulture);
            }

            // K/M/B scaling detection: format ends with K/M/B (case-insensitive)
            char last = char.ToUpperInvariant(format[format.Length - 1]);
            decimal divisor = 1m;
            string suffix = string.Empty;
            if (last == 'K' || last == 'M' || last == 'B')
            {
                switch (last)
                {
                    case 'K': divisor = 1_000m; suffix = "K"; break;
                    case 'M': divisor = 1_000_000m; suffix = "M"; break;
                    case 'B': divisor = 1_000_000_000m; suffix = "B"; break;
                }
                // Remove the suffix char from format to use remaining digits/decimals
                var coreFormat = format.Substring(0, format.Length - 1);
                var scaled = number / divisor;
                return scaled.ToString(coreFormat, CultureInfo.InvariantCulture) + suffix;
            }

            // Standard numeric format
            return number.ToString(format, CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Resolve currency field value with optional formatting and currency symbol.
        /// Money fields are Microsoft.Xrm.Sdk.Money; symbol is retrieved from transactioncurrencyid.currencysymbol.
        /// </summary>
        /// <remarks>
        /// Currency symbol lookup requires a retrieve call to the <c>transactioncurrency</c> table; results are cached
        /// in-memory by currency id.
        /// </remarks>
        private string ResolveCurrencyField(Entity entity, string fieldName, string format, Entity fullEntity)
        {
            var money = entity.GetAttributeValue<Money>(fieldName);
            if (money == null)
            {
                return string.Empty;
            }

            var amount = money.Value;
            string amountText;
            if (string.IsNullOrWhiteSpace(format))
            {
                amountText = amount.ToString("#,##0.00", CultureInfo.InvariantCulture);
            }
            else
            {
                // Support K/M/B scaling similar to numeric
                char last = char.ToUpperInvariant(format[format.Length - 1]);
                decimal divisor = 1m; string suffix = string.Empty;
                if (last == 'K' || last == 'M' || last == 'B')
                {
                    switch (last)
                    {
                        case 'K': divisor = 1_000m; suffix = "K"; break;
                        case 'M': divisor = 1_000_000m; suffix = "M"; break;
                        case 'B': divisor = 1_000_000_000m; suffix = "B"; break;
                    }
                    var coreFormat = format.Substring(0, format.Length - 1);
                    amountText = (amount / divisor).ToString(coreFormat, CultureInfo.InvariantCulture) + suffix;
                }
                else
                {
                    amountText = amount.ToString(format, CultureInfo.InvariantCulture);
                }
            }

            // Resolve currency symbol via transactioncurrencyid
            string symbol = GetCurrencySymbol(fullEntity);
            if (!string.IsNullOrEmpty(symbol))
            {
                return symbol + amountText;
            }
            return amountText;
        }

        /// <summary>
        /// Retrieve currency symbol from the record's transactioncurrencyid.
        /// Caches by currency id to reduce lookups.
        /// </summary>
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, string> _currencySymbolCache = new System.Collections.Concurrent.ConcurrentDictionary<Guid, string>();
        private string GetCurrencySymbol(Entity entity)
        {
            try
            {
                if (entity == null || !entity.Contains("transactioncurrencyid"))
                {
                    return string.Empty;
                }
                var currencyRef = entity.GetAttributeValue<EntityReference>("transactioncurrencyid");
                if (currencyRef == null)
                {
                    return string.Empty;
                }

                if (_currencySymbolCache.TryGetValue(currencyRef.Id, out var cached))
                {
                    return cached;
                }

                var cols = new ColumnSet("currencysymbol");
                var currency = _service.Retrieve("transactioncurrency", currencyRef.Id, cols);
                var symbol = currency.GetAttributeValue<string>("currencysymbol") ?? string.Empty;
                _currencySymbolCache[currencyRef.Id] = symbol;
                return symbol;
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error retrieving currency symbol: {ex.Message}");
                return string.Empty;
            }
        }

        /// <summary>
        /// Resolves a simple text attribute.
        /// </summary>
        private string ResolveStringField(Entity entity, string fieldName)
        {
            var value = entity.GetAttributeValue<string>(fieldName);
            return value ?? string.Empty;
        }

        /// <summary>
        /// Resolves a lookup attribute into the referenced record's primary name.
        /// </summary>
        /// <remarks>
        /// Dataverse often supplies <see cref="EntityReference.Name"/>; when it is missing we retrieve the referenced
        /// record's primary name attribute.
        /// </remarks>
        private string ResolveLookupField(Entity entity, string fieldName)
        {
            var lookup = entity.GetAttributeValue<EntityReference>(fieldName);
            if (lookup == null)
            {
                return string.Empty;
            }

            // If the Name property is already populated, use it
            if (!string.IsNullOrEmpty(lookup.Name))
            {
                return lookup.Name;
            }

            // Otherwise, retrieve the name from the referenced entity
            try
            {
                var logicalName = lookup.LogicalName;
                var primaryNameAttribute = GetPrimaryNameAttribute(logicalName);

                var referencedEntity = _service.Retrieve(
                    logicalName,
                    lookup.Id,
                    new ColumnSet(primaryNameAttribute)
                );

                if (referencedEntity.Contains(primaryNameAttribute))
                {
                    return referencedEntity.GetAttributeValue<string>(primaryNameAttribute) ?? string.Empty;
                }
                else
                {
                    _tracingService.Trace($"Error: Primary name attribute '{primaryNameAttribute}' not found on entity '{logicalName}'");
                }
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error retrieving lookup name for '{fieldName}': {ex.Message}");
            }

            return string.Empty;
        }

        /// <summary>
        /// Resolves a date/datetime attribute with formatting.
        /// </summary>
        /// <param name="entity">Entity containing the attribute.</param>
        /// <param name="fieldName">Attribute logical name.</param>
        /// <param name="dateFormat">.NET date format string.</param>
        /// <param name="timezoneOffsetHours">
        /// Optional timezone offset (hours) applied to the stored value before formatting.
        /// Dataverse stores DateTime values in UTC in many scenarios; this is a simple display-time adjustment.
        /// </param>
        private string ResolveDateField(Entity entity, string fieldName, string dateFormat, double? timezoneOffsetHours = null)
        {

            var dateValue = entity.GetAttributeValue<DateTime>(fieldName);
            if (dateValue == DateTime.MinValue)
            {
                return string.Empty;
            }
            // Apply timezone offset if specified
            if (timezoneOffsetHours.HasValue)
            {
                dateValue = dateValue.AddHours(timezoneOffsetHours.Value);
            }

            try
            {
                return dateValue.ToString(dateFormat, CultureInfo.InvariantCulture);
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error formatting date with format '{dateFormat}': {ex.Message}");
                // Fallback to ISO format
                return dateValue.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            }
        }

        /// <summary>
        /// Resolves an option set attribute into its display label.
        /// </summary>
        /// <remarks>
        /// Preferred source is <see cref="Entity.FormattedValues"/>. If not present, metadata is queried to map
        /// the numeric value to a label.
        /// </remarks>
        private string ResolveOptionSetField(Entity entity, string fieldName)
        {
            var optionSet = entity.GetAttributeValue<OptionSetValue>(fieldName);
            
            if (optionSet == null)
            {
                return string.Empty;
            }
            
            // Try to get the formatted value which contains the label
            if (entity.FormattedValues.Contains(fieldName))
            {
                return entity.FormattedValues[fieldName];
            }

            // If formatted value is not available, retrieve it from metadata
            try
            {
                string cacheKey = entity.LogicalName + "|" + fieldName + "|" + optionSet.Value.ToString();
                if (_optionLabelCache.TryGetValue(cacheKey, out var cachedLabel))
                {
                    return cachedLabel;
                }

                var retrieveAttributeRequest = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
                {
                    EntityLogicalName = entity.LogicalName,
                    LogicalName = fieldName,
                    RetrieveAsIfPublished = false
                };

                var retrieveAttributeResponse = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)_service.Execute(retrieveAttributeRequest);
                var attributeMetadata = (EnumAttributeMetadata)retrieveAttributeResponse.AttributeMetadata;

                // Find the option matching the value
                foreach (var option in attributeMetadata.OptionSet.Options)
                {
                    if (option.Value == optionSet.Value)
                    {
                        var label = option.Label.UserLocalizedLabel?.Label ?? option.Label.LocalizedLabels[0]?.Label;
                        var finalLabel = label ?? optionSet.Value.ToString();
                        _optionLabelCache[cacheKey] = finalLabel;
                        return finalLabel;
                    }
                }
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error retrieving metadata for '{fieldName}': {ex.Message}");
            }

            // If all else fails, return the numeric value as string
            return optionSet.Value.ToString();
        }

        /// <summary>
        /// Gets the primary name attribute for an entity type using metadata.
        /// </summary>
        /// <remarks>
        /// The primary name attribute is usually <c>name</c>, but custom entities may differ.
        /// </remarks>
        private string GetPrimaryNameAttribute(string entityLogicalName)
        {
            // Check cache first
            if (_primaryNameCache.TryGetValue(entityLogicalName, out var cachedName))
            {
                return cachedName;
            }

            try
            {
                // Retrieve entity metadata to get primary name attribute
                var entityMetadata = ((Microsoft.Xrm.Sdk.Messages.RetrieveEntityResponse)_service.Execute(
                    new Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest
                    {
                        LogicalName = entityLogicalName,
                        EntityFilters = Microsoft.Xrm.Sdk.Metadata.EntityFilters.Entity
                    }
                )).EntityMetadata;

                var primaryName = entityMetadata.PrimaryNameAttribute;
                _primaryNameCache[entityLogicalName] = primaryName;
                return primaryName;
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error retrieving primary name attribute for '{entityLogicalName}': {ex.Message}");
                // Fallback to "name" as default
                return "name";
            }
        }

        /// <summary>
        /// Retrieves the Dataverse metadata attribute type for a field.
        /// </summary>
        /// <remarks>
        /// This is useful when parsing patterns or when type inference from naming conventions is insufficient.
        /// </remarks>
        public Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode? GetFieldType(string entityLogicalName, string fieldName)
        {
            string cacheKey = entityLogicalName + "|" + fieldName;
            
            // Check cache first
            if (_fieldTypeCache.TryGetValue(cacheKey, out var cachedType))
            {
                return cachedType;
            }

            try
            {
                var retrieveAttributeRequest = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
                {
                    EntityLogicalName = entityLogicalName,
                    LogicalName = fieldName,
                    RetrieveAsIfPublished = false
                };

                var retrieveAttributeResponse = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)_service.Execute(retrieveAttributeRequest);
                var attributeType = retrieveAttributeResponse.AttributeMetadata.AttributeType;

                if (attributeType.HasValue)
                {
                    _fieldTypeCache[cacheKey] = attributeType.Value;
                    return attributeType.Value;
                }
            }
            catch (Exception ex)
            {
                _tracingService.Trace($"Error retrieving field type for '{entityLogicalName}.{fieldName}': {ex.Message}");
            }

            return null;
        }
    }
}
