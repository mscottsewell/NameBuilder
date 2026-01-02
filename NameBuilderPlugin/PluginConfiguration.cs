using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.IO;

namespace NameBuilder
{
    /// <summary>
    /// Configuration model for the Name Builder plugin.
    /// </summary>
    /// <remarks>
    /// This type is deserialized from JSON provided as the plugin's unsecure configuration string.
    /// The configuration can be expressed either as a single <see cref="Pattern"/> string or as a structured
    /// array of <see cref="FieldConfiguration"/> entries.
    /// </remarks>
    [DataContract]
    public class PluginConfiguration
    {
        // Cache parsed configurations to avoid re-parsing JSON for every invocation.
        // Key is the raw JSON string. This keeps parsing costs low but means changes to config require a plugin reload.
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, PluginConfiguration> _configCache = new System.Collections.Concurrent.ConcurrentDictionary<string, PluginConfiguration>();
        /// <summary>
        /// Target field to populate (typically "name")
        /// </summary>
        [DataMember(Name = "targetField")]
        public string TargetField { get; set; }

        /// <summary>
        /// Enables additional tracing output. Useful for troubleshooting PreImage contents.
        /// Default: false
        /// </summary>
        [DataMember(Name = "enableTracing")]
        public bool EnableTracing { get; set; }

        /// <summary>
        /// Pattern string defining the format (e.g., "createdon | ownerid - statuscode")
        /// Supports inline delimiters and field type specifications.
        /// </summary>
        /// <remarks>
        /// Pattern parsing is performed by <see cref="PatternParser"/>.
        /// If <see cref="Fields"/> is provided, it takes precedence over this property.
        /// </remarks>
        [DataMember(Name = "pattern")]
        public string Pattern { get; set; }

        /// <summary>
        /// Array of field configurations (alternative to pattern)
        /// If specified, this takes precedence over pattern
        /// </summary>
        /// <remarks>
        /// Use <see cref="FieldConfiguration"/> when you want explicit per-field settings like
        /// conditional inclusion, prefixes/suffixes, alternate fields, or truncation.
        /// </remarks>
        [DataMember(Name = "fields")]
        public List<FieldConfiguration> Fields { get; set; }

        /// <summary>
        /// Maximum length for the constructed name value
        /// If exceeded, truncates to (maxLength - 3) and appends "..."
        /// </summary>
        [DataMember(Name = "maxLength")]
        public int? MaxLength { get; set; }

        /// <summary>
        /// Parsed pattern parts (populated automatically from Pattern or Fields)
        /// </summary>
        /// <remarks>
        /// This is computed during <see cref="Parse"/>. It is not a serialized JSON field.
        /// </remarks>
        public List<PatternPart> ParsedPatternParts { get; set; }

        public PluginConfiguration()
        {
            TargetField = "name";
            EnableTracing = false;
        }

        /// <summary>
        /// Parses configuration from JSON and computes <see cref="ParsedPatternParts"/>.
        /// </summary>
        /// <param name="jsonConfig">Raw JSON configuration string.</param>
        /// <param name="service">
        /// Optional organization service used for metadata-based inference (field types, target field length).
        /// When null, parsing falls back to naming conventions.
        /// </param>
        /// <param name="entityLogicalName">Logical name of the target entity (used for metadata lookup).</param>
        /// <returns>A parsed configuration instance. Calls may return a cached instance.</returns>
        /// <exception cref="ArgumentException">Thrown when <paramref name="jsonConfig"/> is empty.</exception>
        /// <exception cref="InvalidOperationException">Thrown when configuration is invalid or cannot be parsed.</exception>
        public static PluginConfiguration Parse(string jsonConfig, Microsoft.Xrm.Sdk.IOrganizationService service, string entityLogicalName)
        {
            if (string.IsNullOrWhiteSpace(jsonConfig))
            {
                throw new ArgumentException("Configuration cannot be empty");
            }

            // Return cached configuration if already parsed
            if (_configCache.TryGetValue(jsonConfig, out var cached))
            {
                return cached;
            }

            try
            {
                using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(jsonConfig)))
                {
                    var serializer = new DataContractJsonSerializer(typeof(PluginConfiguration));
                    var config = (PluginConfiguration)serializer.ReadObject(ms);
                    
                    // Use fields array if provided, otherwise use the pattern string.
                    if (config.Fields != null && config.Fields.Count > 0)
                    {
                        // Convert the structured fields array to pattern parts.
                        config.ParsedPatternParts = FieldArrayParser.Parse(config.Fields, service, entityLogicalName);
                    }
                    else if (!string.IsNullOrWhiteSpace(config.Pattern))
                    {
                        // Parse pattern string to pattern parts.
                        config.ParsedPatternParts = PatternParser.Parse(config.Pattern, service, entityLogicalName);
                    }
                    else
                    {
                        throw new InvalidOperationException("Either 'pattern' or 'fields' must be configured");
                    }

                    // Set default maxLength from target field metadata if not specified.
                    if (!config.MaxLength.HasValue && service != null)
                    {
                        config.MaxLength = GetTargetFieldMaxLength(service, entityLogicalName, config.TargetField);
                    }

                    // Cache and return
                    _configCache[jsonConfig] = config;
                    return config;
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to parse plugin configuration: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Gets the max length of the target field from Dataverse metadata.
        /// </summary>
        private static int? GetTargetFieldMaxLength(Microsoft.Xrm.Sdk.IOrganizationService service, string entityLogicalName, string fieldName)
        {
            try
            {
                var retrieveAttributeRequest = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
                {
                    EntityLogicalName = entityLogicalName,
                    LogicalName = fieldName,
                    RetrieveAsIfPublished = false
                };

                var retrieveAttributeResponse = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)service.Execute(retrieveAttributeRequest);
                
                if (retrieveAttributeResponse.AttributeMetadata is Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata stringMetadata)
                {
                    return stringMetadata.MaxLength;
                }
            }
            catch
            {
                // Ignore errors - maxLength will remain null
            }

            return null;
        }

        /// <summary>
        /// Gets a list of all attribute logical names referenced by the parsed configuration.
        /// </summary>
        public List<string> GetAllFieldNames()
        {
            if (ParsedPatternParts != null)
            {
                return ParsedPatternParts
                    .Where(p => p.IsField)
                    .Select(p => p.FieldName)
                    .ToList();
            }
            
            return new List<string>();
        }
    }

}

    /// <summary>
    /// Represents a part of a parsed pattern (either a field or literal text)
    /// </summary>
    public class PatternPart
    {
        /// <summary>
        /// True if this is a field reference, false if it's literal text
        /// </summary>
        public bool IsField { get; set; }

        /// <summary>
        /// Field name (if IsField = true)
        /// </summary>
        public string FieldName { get; set; }

        /// <summary>
        /// Field type specification (e.g., <c>date</c>, <c>lookup</c>, <c>optionset</c>).
        /// </summary>
        public string FieldType { get; set; }

        /// <summary>
        /// Date format used when <see cref="FieldType"/> is <c>date</c> or <c>datetime</c>.
        /// </summary>
        public string DateFormat { get; set; }

        /// <summary>
        /// Maximum length for this field
        /// </summary>
        public int? MaxFieldLength { get; set; }

        /// <summary>
        /// Truncation indicator (e.g., "...")
        /// </summary>
        public string TruncationIndicator { get; set; }

        /// <summary>
        /// Default value if field is null/empty
        /// </summary>
        public string DefaultValue { get; set; }

        /// <summary>
        /// Alternate field configuration to use when the primary field is missing or empty.
        /// </summary>
        public FieldConfiguration AlternateField { get; set; }

        /// <summary>
        /// Literal text value (when <see cref="IsField"/> is <c>false</c>).
        /// </summary>
        public string LiteralText { get; set; }

        /// <summary>
        /// Timezone offset in hours to apply to date/datetime fields
        /// </summary>
        public double? TimezoneOffsetHours { get; set; }

        /// <summary>
        /// Condition for conditional field inclusion.
        /// </summary>
        public FieldCondition IncludeIf { get; set; }

        /// <summary>
        /// Prefix text to include before the field value (only if field is included)
        /// </summary>
        public string Prefix { get; set; }

        /// <summary>
        /// Suffix text to include after the field value (only if field is included)
        /// </summary>
        public string Suffix { get; set; }

        public PatternPart()
        {
            DateFormat = "yyyy-MM-dd";
        }
    }

    /// <summary>
    /// Parser for pattern strings like "createdon | ownerid - statuscode"
    /// </summary>
    public static class PatternParser
    {
        /// <summary>
        /// Parse a pattern string into a list of PatternParts
        /// Format: fieldname or fieldname:type or fieldname:type:format
        /// Examples: "createdon:date:yyyy-MM-dd | ownerid:lookup - statuscode:optionset"
        /// Literal text can be quoted: "'CASE-'ticketnumber" or use non-field characters as delimiters
        /// </summary>
        /// <remarks>
        /// The parser alternates between:
        /// <list type="bullet">
        /// <item><description>Field tokens (letters/digits/underscore)</description></item>
        /// <item><description>Literal delimiters (any other characters)</description></item>
        /// </list>
        /// Quoted sections are always treated as literals.
        /// </remarks>
        public static List<PatternPart> Parse(string pattern, Microsoft.Xrm.Sdk.IOrganizationService service = null, string entityLogicalName = null)
        {
            var parts = new List<PatternPart>();
            if (string.IsNullOrWhiteSpace(pattern))
            {
                return parts;
            }

            var currentField = new StringBuilder();
            var currentLiteral = new StringBuilder();
            bool inQuote = false;
            int colonCount = 0; // Track colons to detect when we're in a date format
            
            // Determine initial state based on first character
            bool inField = pattern.Length > 0 && !inQuote && IsFieldChar(pattern[0]);

            for (int i = 0; i < pattern.Length; i++)
            {
                char c = pattern[i];

                // Handle quoted literals
                if ((c == '\'' || c == '"') && !inQuote)
                {
                    // Start quote - finalize any pending field first
                    if (currentField.Length > 0)
                    {
                        parts.Add(ParseFieldPart(currentField.ToString(), service, entityLogicalName));
                        currentField.Clear();
                        colonCount = 0;
                    }
                    inQuote = true;
                    inField = false;
                    continue;
                }
                else if ((c == '\'' || c == '"') && inQuote)
                {
                    // End quote - add accumulated literal
                    if (currentLiteral.Length > 0)
                    {
                        parts.Add(new PatternPart 
                        { 
                            IsField = false, 
                            LiteralText = currentLiteral.ToString() 
                        });
                        currentLiteral.Clear();
                    }
                    inQuote = false;
                    inField = false;
                    continue;
                }

                // If we're in a quote, everything is literal
                if (inQuote)
                {
                    currentLiteral.Append(c);
                    continue;
                }

                // Track colons in field specs
                if (c == ':' && inField)
                {
                    colonCount++;
                    currentField.Append(c);
                    continue;
                }

                // After 2 colons, we're in a format string - allow more characters
                bool isFieldChar = colonCount >= 2 
                    ? IsFormatChar(c)  // In format string, allow more chars
                    : IsFieldChar(c);  // In field name/type, strict rules

                if (isFieldChar && inField)
                {
                    // Continue building field name
                    currentField.Append(c);
                }
                else if (!isFieldChar && inField)
                {
                    // End of field, start of literal
                    if (currentField.Length > 0)
                    {
                        parts.Add(ParseFieldPart(currentField.ToString(), service, entityLogicalName));
                        currentField.Clear();
                        colonCount = 0; // Reset colon count
                    }
                    currentLiteral.Append(c);
                    inField = false;
                }
                else if (IsFieldChar(c) && !inField)
                {
                    // End of literal, start of field
                    if (currentLiteral.Length > 0)
                    {
                        parts.Add(new PatternPart 
                        { 
                            IsField = false, 
                            LiteralText = currentLiteral.ToString() 
                        });
                        currentLiteral.Clear();
                    }
                    currentField.Append(c);
                    colonCount = 0; // Reset colon count for new field
                    inField = true;
                }
                else
                {
                    // Continue building literal
                    currentLiteral.Append(c);
                }
            }

            // Add final part
            if (currentField.Length > 0)
            {
                parts.Add(ParseFieldPart(currentField.ToString(), service, entityLogicalName));
            }
            else if (currentLiteral.Length > 0)
            {
                parts.Add(new PatternPart 
                { 
                    IsField = false, 
                    LiteralText = currentLiteral.ToString() 
                });
            }

            return parts;
        }

        /// <summary>
        /// Check if a character is valid in a field name or type
        /// </summary>
        private static bool IsFieldChar(char c)
        {
            return char.IsLetterOrDigit(c) || c == '_';
        }

        /// <summary>
        /// Check if a character is valid in a date/time format string
        /// </summary>
        private static bool IsFormatChar(char c)
        {
            // Date formats can contain: letters, digits, - : / . and quotes
            // Note: Space is NOT included - use quotes around formats with spaces
            return char.IsLetterOrDigit(c) || c == '-' || c == ':' || c == '/' || c == '.' || c == '\'' || c == '_';
        }

        /// <summary>
        /// Parse a field specification like "createdon:date:yyyy-MM-dd"
        /// Format: fieldname[:type[:format]]
        /// </summary>
        /// <remarks>
        /// If type is omitted, <see cref="InferFieldType"/> is used.
        /// </remarks>
        private static PatternPart ParseFieldPart(string fieldSpec, Microsoft.Xrm.Sdk.IOrganizationService service, string entityLogicalName)
        {
            var part = new PatternPart { IsField = true };
            var segments = fieldSpec.Split(':');

            // First segment is always the field name
            part.FieldName = segments[0].Trim();

            // Second segment is the field type (optional)
            if (segments.Length > 1)
            {
                part.FieldType = segments[1].Trim().ToLowerInvariant();
            }
            else
            {
                // Auto-detect field type using metadata if available, otherwise use naming conventions
                part.FieldType = InferFieldType(part.FieldName, service, entityLogicalName);
            }

            // Third segment is the format (for dates, optional)
            if (segments.Length > 2)
            {
                part.DateFormat = segments[2].Trim();
            }

            return part;
        }

        /// <summary>
        /// Infer field type based on metadata or naming conventions
        /// </summary>
        /// <remarks>
        /// Metadata-based inference is preferred when an org service is available. When metadata cannot be retrieved,
        /// the method falls back to a simple naming convention heuristic.
        /// </remarks>
        public static string InferFieldType(string fieldName, Microsoft.Xrm.Sdk.IOrganizationService service = null, string entityLogicalName = null)
        {
            // Try metadata-based inference first if service is available
            if (service != null && !string.IsNullOrEmpty(entityLogicalName))
            {
                try
                {
                    var retrieveAttributeRequest = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
                    {
                        EntityLogicalName = entityLogicalName,
                        LogicalName = fieldName,
                        RetrieveAsIfPublished = false
                    };

                    var retrieveAttributeResponse = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)service.Execute(retrieveAttributeRequest);
                    var attributeType = retrieveAttributeResponse.AttributeMetadata.AttributeType;

                    if (attributeType.HasValue)
                    {
                        switch (attributeType.Value)
                        {
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.DateTime:
                                return "date";
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Integer:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Decimal:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Double:
                                return "number";
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Money:
                                return "currency";
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Lookup:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Customer:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Owner:
                                return "lookup";
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Picklist:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.State:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Status:
                                return "optionset";
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.String:
                            case Microsoft.Xrm.Sdk.Metadata.AttributeTypeCode.Memo:
                                return "string";
                            default:
                                return "string";
                        }
                    }
                }
                catch
                {
                    // Fall back to naming convention if metadata retrieval fails
                }
            }

            // Fall back to naming convention-based inference
            var lower = fieldName.ToLowerInvariant();

            // Date fields
            if (lower.EndsWith("on") || lower.EndsWith("date") || lower.Contains("date"))
            {
                return "date";
            }

            // Lookup fields
            if (lower.EndsWith("id") && !lower.Equals("id"))
            {
                return "lookup";
            }

            // OptionSet fields
            if (lower.EndsWith("code") || lower.EndsWith("status") || lower.EndsWith("state"))
            {
                return "optionset";
            }

            // Default to string
            return "string";
        }
    }

    /// <summary>
    /// Field configuration for array-based pattern definition
    /// </summary>
    [DataContract]
    public class FieldConfiguration
    {
        /// <summary>
        /// Field name
        /// </summary>
        [DataMember(Name = "field")]
        public string Field { get; set; }

        /// <summary>
        /// Field type (optional - will be inferred if not specified)
        /// </summary>
        [DataMember(Name = "type")]
        public string Type { get; set; }

        /// <summary>
        /// Format for date/datetime/number/currency fields.
        /// </summary>
        [DataMember(Name = "format")]
        public string Format { get; set; }

        /// <summary>
        /// Maximum length for this field (will truncate if exceeded)
        /// </summary>
        [DataMember(Name = "maxLength")]
        public int? MaxLength { get; set; }

        /// <summary>
        /// Truncation indicator (default "...")
        /// </summary>
        [DataMember(Name = "truncationIndicator")]
        public string TruncationIndicator { get; set; }

        /// <summary>
        /// Default value if field is null or empty
        /// </summary>
        [DataMember(Name = "default")]
        public string Default { get; set; }

        /// <summary>
        /// Alternate field to use if primary field is null or empty.
        /// </summary>
        [DataMember(Name = "alternateField")]
        public FieldConfiguration AlternateField { get; set; }

        /// <summary>
        /// Prefix to add before the field value
        /// </summary>
        [DataMember(Name = "prefix")]
        public string Prefix { get; set; }

        /// <summary>
        /// Suffix to add after the field value
        /// </summary>
        [DataMember(Name = "suffix")]
        public string Suffix { get; set; }
        /// <summary>
        /// Timezone offset in hours to apply to date/datetime fields (e.g., -5 for EST, +1 for CET)
        /// Adjusts UTC time stored in Dataverse to local time for display
        /// </summary>
        [DataMember(Name = "timezoneOffsetHours")]
        public double? TimezoneOffsetHours { get; set; }

        /// <summary>
        /// Condition that must be met for this field to be included in the name
        /// If not specified or condition is met, field is included
        /// If condition is not met, field (including prefix/suffix) is excluded
        /// </summary>
        [DataMember(Name = "includeIf")]
        public FieldCondition IncludeIf { get; set; }

        public FieldConfiguration()
        {
            TruncationIndicator = "...";
        }
    }

    /// <summary>
    /// Condition for conditional field inclusion
    /// </summary>
    [DataContract]
    public class FieldCondition
    {
        /// <summary>
        /// Field name to check the condition against
        /// </summary>
        [DataMember(Name = "field", EmitDefaultValue = false)]
        public string Field { get; set; }

        /// <summary>
        /// Operator name (case-insensitive). See <see cref="ConditionEvaluator"/> for supported values.
        /// </summary>
        [DataMember(Name = "operator", EmitDefaultValue = false)]
        public string Operator { get; set; }

        /// <summary>
        /// Expected value (string form). Some operators (e.g., <c>in</c>) treat this as a comma-separated list.
        /// </summary>
        [DataMember(Name = "value", EmitDefaultValue = false)]
        public string Value { get; set; }

        /// <summary>
        /// OR composition: condition is met when any child condition is met.
        /// </summary>
        [DataMember(Name = "anyOf", EmitDefaultValue = false)]
        public List<FieldCondition> AnyOf { get; set; }

        /// <summary>
        /// AND composition: condition is met only when all child conditions are met.
        /// </summary>
        [DataMember(Name = "allOf", EmitDefaultValue = false)]
        public List<FieldCondition> AllOf { get; set; }
    }

    /// <summary>
    /// Parser for field array configuration
    /// </summary>
    public static class FieldArrayParser
    {
        /// <summary>
        /// Converts structured field configurations into pattern parts.
        /// </summary>
        /// <remarks>
        /// The structured form supports additional features that are awkward in the free-form pattern string,
        /// such as prefix/suffix and conditional inclusion.
        /// </remarks>
        public static List<PatternPart> Parse(List<FieldConfiguration> fields, Microsoft.Xrm.Sdk.IOrganizationService service = null, string entityLogicalName = null)
        {
            var parts = new List<PatternPart>();

            if (fields == null || fields.Count == 0)
            {
                return parts;
            }

            foreach (var fieldConfig in fields)
            {
                // Determine field type
                var fieldType = !string.IsNullOrEmpty(fieldConfig.Type)
                    ? fieldConfig.Type.ToLowerInvariant()
                    : PatternParser.InferFieldType(fieldConfig.Field, service, entityLogicalName);

                // Add the field part with prefix/suffix attached
                parts.Add(new PatternPart
                {
                    IsField = true,
                    FieldName = fieldConfig.Field,
                    FieldType = fieldType,
                    DateFormat = fieldConfig.Format ?? "yyyy-MM-dd",
                    MaxFieldLength = fieldConfig.MaxLength,
                    TruncationIndicator = fieldConfig.TruncationIndicator ?? "...",
                    DefaultValue = fieldConfig.Default,
                    AlternateField = fieldConfig.AlternateField,
                    TimezoneOffsetHours = fieldConfig.TimezoneOffsetHours,
                    IncludeIf = fieldConfig.IncludeIf,
                    Prefix = fieldConfig.Prefix,
                    Suffix = fieldConfig.Suffix
                });
            }

            return parts;
        }
    }

