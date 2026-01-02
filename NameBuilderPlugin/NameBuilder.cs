using System;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace NameBuilder
{
    /// <summary>
    /// Dataverse plugin that builds a target text field (typically <c>name</c>) from other field values.
    /// </summary>
    /// <remarks>
    /// <para>
    /// This plugin is designed for Microsoft Dataverse / Dynamics 365 and is typically registered on
    /// <c>Create</c> and <c>Update</c> messages for the target entity.
    /// </para>
    /// <para>
    /// For <c>Update</c>, Dataverse only supplies changed attributes in the <c>Target</c> entity. To build a full
    /// name we merge the <c>Target</c> with a Pre-Image (expected image alias: <c>PreImage</c>).
    /// </para>
    /// <para>
    /// Behavior is driven by JSON configuration (unsecure config) parsed by <see cref="PluginConfiguration"/>.
    /// </para>
    /// </remarks>
    public class NameBuilderPlugin : IPlugin
    {
        private readonly string _unsecureConfig;
        // Secure config is accepted to match the Dataverse plugin constructor signature.
        // This project currently relies only on unsecure config so the secure config parameter is ignored.

        /// <summary>
        /// Initializes a new instance of the <see cref="NameBuilderPlugin"/>.
        /// </summary>
        /// <param name="unsecureConfig">Unsecure configuration (JSON format)</param>
        /// <param name="secureConfig">Secure configuration (currently unused)</param>
        public NameBuilderPlugin(string unsecureConfig, string secureConfig)
        {
            _unsecureConfig = unsecureConfig;
        }

        /// <summary>
        /// Dataverse entry point invoked by the platform.
        /// </summary>
        /// <param name="serviceProvider">Service provider containing Dataverse execution services.</param>
        /// <exception cref="InvalidPluginExecutionException">Thrown when an unexpected error occurs.</exception>
        public void Execute(IServiceProvider serviceProvider)
        {
            // Obtain the tracing service
            ITracingService tracingService = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            // Minimal initial trace; heavy tracing removed for performance

            // Obtain the execution context
            IPluginExecutionContext context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));

            // Obtain the organization service factory
            IOrganizationServiceFactory serviceFactory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            IOrganizationService service = serviceFactory.CreateOrganizationService(context.UserId);

            try
            {
                // Validate context
                if (context.InputParameters.Contains("Target") && context.InputParameters["Target"] is Entity)
                {
                    Entity targetEntity = (Entity)context.InputParameters["Target"];

                    // Parse configuration. If an org service is available, parsing can use metadata (e.g. infer field types,
                    // get max length for the target field).
                    PluginConfiguration config = PluginConfiguration.Parse(_unsecureConfig, service, targetEntity.LogicalName);

                    // Create: always build the name.
                    // Update: build the name only when one of the configured fields changed.
                    if (context.MessageName.Equals("Create", StringComparison.OrdinalIgnoreCase) || 
                        ShouldTrigger(targetEntity, config, tracingService))
                    {

                        // For Update, Target only includes changed attributes. Merge it with a Pre-Image to obtain a
                        // consistent view of all configured inputs.
                        Entity fullEntity = targetEntity;
                        
                        if (context.MessageName.Equals("Update", StringComparison.OrdinalIgnoreCase))
                        {
                            fullEntity = MergeWithPreImage(targetEntity, context, config, tracingService);
                        }

                        // Build the name value using the configured pattern/fields.
                        // When tracing is disabled in config we use a no-op tracing service to avoid work.
                        string nameValue = BuildNameValue(fullEntity, config, service, config.EnableTracing ? tracingService : new NullTracingService());

                        // Assign the computed value back to the Target entity; Dataverse will persist it.
                        if (!string.IsNullOrEmpty(nameValue))
                        {
                            targetEntity[config.TargetField] = nameValue;
                        }
                    }
                }
                else
                {
                    tracingService.Trace("Target entity not found in InputParameters");
                }

                // Completed without error
            }
            catch (Exception ex)
            {
                tracingService.Trace($"NameBuilderPlugin Error: {ex.Message}");
                tracingService.Trace($"Stack Trace: {ex.StackTrace}");
                throw new InvalidPluginExecutionException($"An error occurred in NameBuilderPlugin: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Determines whether an Update event should rebuild the name based on changed attributes.
        /// </summary>
        /// <param name="targetEntity">The update Target entity containing only changed attributes.</param>
        /// <param name="config">Parsed plugin configuration.</param>
        /// <param name="tracingService">Tracing service (optional).</param>
        private bool ShouldTrigger(Entity targetEntity, PluginConfiguration config, ITracingService tracingService)
        {
            var configuredFields = config.GetAllFieldNames();
            
            foreach (var fieldName in configuredFields)
            {
                if (targetEntity.Contains(fieldName))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Merges the Update Target entity with a Pre-Image to get a complete set of inputs.
        /// </summary>
        /// <remarks>
        /// <para>
        /// Dataverse provides formatted values (labels) for some attributes (e.g. option sets). We copy formatted values
        /// from the Pre-Image first, then prefer formatted values from Target when present.
        /// </para>
        /// </remarks>
        /// <param name="targetEntity">Update target containing changed attributes.</param>
        /// <param name="context">Plugin execution context.</param>
        /// <param name="config">Parsed plugin configuration.</param>
        /// <param name="tracingService">Tracing service (optional).</param>
        /// <returns>A new entity containing merged attributes and formatted values.</returns>
        private Entity MergeWithPreImage(Entity targetEntity, IPluginExecutionContext context, 
            PluginConfiguration config, ITracingService tracingService)
        {
            Entity mergedEntity = new Entity(targetEntity.LogicalName, targetEntity.Id);

            // Start with PreImage if available
            if (context.PreEntityImages.Contains("PreImage"))
            {
                Entity preImage = context.PreEntityImages["PreImage"];
                
                foreach (var attribute in preImage.Attributes)
                {
                    mergedEntity[attribute.Key] = attribute.Value;
                }

                // Copy formatted values as well (important for option set labels).
                foreach (var formattedValue in preImage.FormattedValues)
                {
                    mergedEntity.FormattedValues[formattedValue.Key] = formattedValue.Value;
                }
            }

            // Overlay with target entity values (updated fields)
            foreach (var attribute in targetEntity.Attributes)
            {
                mergedEntity[attribute.Key] = attribute.Value;
                
                // If this attribute was updated and Target did not supply a formatted value, remove the old label from
                // the Pre-Image so downstream resolution can fall back to metadata retrieval when needed.
                if (mergedEntity.FormattedValues.Contains(attribute.Key) && 
                    !targetEntity.FormattedValues.Contains(attribute.Key))
                {
                    mergedEntity.FormattedValues.Remove(attribute.Key);
                }
            }

            // Copy formatted values from Target (these contain current labels).
            foreach (var formattedValue in targetEntity.FormattedValues)
            {
                mergedEntity.FormattedValues[formattedValue.Key] = formattedValue.Value;
            }

            return mergedEntity;
        }

        /// <summary>
        /// Builds the final name value by walking the parsed pattern and concatenating literal text and field values.
        /// </summary>
        /// <param name="entity">Entity containing attribute values used by the pattern.</param>
        /// <param name="config">Parsed plugin configuration.</param>
        /// <param name="service">Organization service used for lookups/metadata.</param>
        /// <param name="tracingService">Tracing service for diagnostics.</param>
        /// <returns>The constructed name, possibly truncated by <see cref="PluginConfiguration.MaxLength"/>.</returns>
        private string BuildNameValue(Entity entity, PluginConfiguration config, 
            IOrganizationService service, ITracingService tracingService)
        {
            var resolver = new FieldValueResolver(service, tracingService);
            var nameParts = new StringBuilder();
            
            for (int i = 0; i < config.ParsedPatternParts.Count; i++)
            {
                var part = config.ParsedPatternParts[i];
                
                if (part.IsField)
                {
                    // Field resolution includes:
                    // - formatting (dates, numbers, currency)
                    // - conditional inclusion
                    // - optional alternate fields and defaults
                    string fieldValue = resolver.ResolvePatternFieldValue(entity, part);
                    if (!string.IsNullOrEmpty(fieldValue))
                    {
                        nameParts.Append(fieldValue);
                    }
                    else if (part.IncludeIf != null)
                    {
                        // Field was excluded due to condition. Prefix/suffix are applied within the resolver only when
                        // a value is present, so no extra handling is needed here.
                    }
                }
                else
                {
                    // Literal text from pattern
                    nameParts.Append(part.LiteralText);
                }
            }

            string result = nameParts.ToString();

            // Apply maxLength truncation if configured. We reserve 3 chars for the ellipsis.
            if (config.MaxLength.HasValue && config.MaxLength.Value > 3)
            {
                if (result.Length > config.MaxLength.Value)
                {
                    int truncateAt = config.MaxLength.Value - 3;
                    result = result.Substring(0, truncateAt) + "...";
                }
            }

            return result;
        }
    }

    /// <summary>
    /// Tracing service implementation that discards all messages.
    /// </summary>
    /// <remarks>
    /// Used to avoid the overhead of creating trace strings when tracing is disabled by configuration.
    /// </remarks>
    internal class NullTracingService : ITracingService
    {
        public void Trace(string format, params object[] args) { }
        public void Trace(string message) { }
    }
}
