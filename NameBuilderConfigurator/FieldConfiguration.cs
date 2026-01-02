using System.Collections.Generic;
using Newtonsoft.Json;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Field configuration model that matches the NameBuilder plugin JSON schema.
    /// </summary>
    /// <remarks>
    /// This project (the XrmToolBox configurator) uses these types to generate JSON that is passed into the Dataverse
    /// plugin as its unsecure configuration.
    /// </remarks>
    public class FieldConfiguration
    {
        /// <summary>
        /// Logical name of the Dataverse attribute to read.
        /// </summary>
        [JsonProperty("field")]
        public string Field { get; set; }
        
        /// <summary>
        /// Optional explicit type override (e.g., <c>string</c>, <c>lookup</c>, <c>date</c>, <c>optionset</c>).
        /// When omitted, the plugin may infer type from metadata or naming conventions.
        /// </summary>
        [JsonProperty("type", NullValueHandling = NullValueHandling.Ignore)]
        public string Type { get; set; }
        
        /// <summary>
        /// Optional format string for dates, numbers, and currency.
        /// Examples: <c>yyyy-MM-dd</c>, <c>#,##0.00</c>, <c>0.0K</c>.
        /// </summary>
        [JsonProperty("format", NullValueHandling = NullValueHandling.Ignore)]
        public string Format { get; set; }
        
        /// <summary>
        /// Optional per-field maximum length. When exceeded, the value is truncated and a truncation indicator is appended.
        /// </summary>
        [JsonProperty("maxLength", NullValueHandling = NullValueHandling.Ignore)]
        public int? MaxLength { get; set; }
        
        /// <summary>
        /// Optional indicator appended when truncation occurs (default is typically <c>...</c>).
        /// </summary>
        [JsonProperty("truncationIndicator", NullValueHandling = NullValueHandling.Ignore)]
        public string TruncationIndicator { get; set; }
        
        /// <summary>
        /// Optional default value when the field is missing or empty.
        /// </summary>
        [JsonProperty("default", NullValueHandling = NullValueHandling.Ignore)]
        public string Default { get; set; }
        
        /// <summary>
        /// Optional alternate field to use when <see cref="Field"/> is missing or empty.
        /// </summary>
        [JsonProperty("alternateField", NullValueHandling = NullValueHandling.Ignore)]
        public FieldConfiguration AlternateField { get; set; }
        
        /// <summary>
        /// Optional prefix to prepend to the resolved value (only when a non-empty value is produced).
        /// </summary>
        [JsonProperty("prefix", NullValueHandling = NullValueHandling.Ignore)]
        public string Prefix { get; set; }
        
        /// <summary>
        /// Optional suffix to append to the resolved value (only when a non-empty value is produced).
        /// </summary>
        [JsonProperty("suffix", NullValueHandling = NullValueHandling.Ignore)]
        public string Suffix { get; set; }
        
        /// <summary>
        /// Optional condition that must evaluate to true for this field to be included.
        /// </summary>
        [JsonProperty("includeIf", NullValueHandling = NullValueHandling.Ignore)]
        public FieldCondition IncludeIf { get; set; }
        
        /// <summary>
        /// Optional timezone offset in hours applied to date/datetime values before formatting.
        /// </summary>
        /// <remarks>
        /// The plugin accepts fractional hours as well; the configurator currently models this as an integer.
        /// </remarks>
        [JsonProperty("timezoneOffsetHours", NullValueHandling = NullValueHandling.Ignore)]
        public int? TimezoneOffsetHours { get; set; }
    }
    
    /// <summary>
    /// Conditional field inclusion configuration.
    /// </summary>
    /// <remarks>
    /// Conditions may be composed using <see cref="AnyOf"/> (OR) and <see cref="AllOf"/> (AND).
    /// Operator semantics are implemented in the plugin runtime.
    /// </remarks>
    public class FieldCondition
    {
        /// <summary>
        /// Attribute logical name used for evaluation.
        /// </summary>
        [JsonProperty("field", NullValueHandling = NullValueHandling.Ignore)]
        public string Field { get; set; }
        
        /// <summary>
        /// Operator name (e.g., <c>equals</c>, <c>contains</c>, <c>in</c>, <c>gt</c>).
        /// </summary>
        [JsonProperty("operator", NullValueHandling = NullValueHandling.Ignore)]
        public string Operator { get; set; }
        
        /// <summary>
        /// Expected value (string form). Some operators treat this as a comma-separated list.
        /// </summary>
        [JsonProperty("value", NullValueHandling = NullValueHandling.Ignore)]
        public string Value { get; set; }
        
        /// <summary>
        /// OR composition: condition is met when any child condition is met.
        /// </summary>
        [JsonProperty("anyOf", NullValueHandling = NullValueHandling.Ignore)]
        public List<FieldCondition> AnyOf { get; set; }
        
        /// <summary>
        /// AND composition: condition is met only when all child conditions are met.
        /// </summary>
        [JsonProperty("allOf", NullValueHandling = NullValueHandling.Ignore)]
        public List<FieldCondition> AllOf { get; set; }
    }
    
    /// <summary>
    /// Root configuration object produced by the configurator and consumed by the plugin.
    /// </summary>
    public class PluginConfiguration
    {
        /// <summary>
        /// Optional target entity logical name. This may be used by the configurator for validation or templates.
        /// </summary>
        [JsonProperty("entity", NullValueHandling = NullValueHandling.Ignore, Order = 1)]
        public string Entity { get; set; }
        
        /// <summary>
        /// Target attribute to populate (defaults to <c>name</c>).
        /// </summary>
        [JsonProperty("targetField", NullValueHandling = NullValueHandling.Ignore, Order = 2)]
        public string TargetField { get; set; } = "name";
        
        /// <summary>
        /// Ordered list of configured fields that will be concatenated to build the target value.
        /// </summary>
        [JsonProperty("fields", Order = 3)]
        public List<FieldConfiguration> Fields { get; set; } = new List<FieldConfiguration>();
        
        /// <summary>
        /// Optional maximum length of the constructed output. If omitted, the plugin may infer it from metadata.
        /// </summary>
        [JsonProperty("maxLength", NullValueHandling = NullValueHandling.Ignore, Order = 4)]
        public int? MaxLength { get; set; }
        
        /// <summary>
        /// Optional flag enabling extra tracing in the plugin. Useful for debugging configuration and images.
        /// </summary>
        [JsonProperty("enableTracing", NullValueHandling = NullValueHandling.Ignore, Order = 5)]
        public bool? EnableTracing { get; set; }
    }
}
