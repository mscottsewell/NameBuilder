using System;
using System.Linq;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace NameBuilder
{
    /// <summary>
    /// Plugin to dynamically build the name field based on configured field values
    /// Fires on Create and Update of specified fields
    /// </summary>
    public class NameBuilderPlugin : IPlugin
    {
        private readonly string _unsecureConfig;
        // Secure config currently unused; removed to reduce memory footprint

        /// <summary>
        /// Constructor for the plugin
        /// </summary>
        /// <param name="unsecureConfig">Unsecure configuration (JSON format)</param>
        /// <param name="secureConfig">Secure configuration (not used currently)</param>
        public NameBuilderPlugin(string unsecureConfig, string secureConfig)
        {
            _unsecureConfig = unsecureConfig;
        }

        /// <summary>
        /// Main plugin execution method
        /// </summary>
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

                    // Parse configuration with service for metadata-based inference
                    PluginConfiguration config = PluginConfiguration.Parse(_unsecureConfig, service, targetEntity.LogicalName);

                    // Check if any of the configured fields are being modified
                    // Or if this is a Create operation
                    if (context.MessageName.Equals("Create", StringComparison.OrdinalIgnoreCase) || 
                        ShouldTrigger(targetEntity, config, tracingService))
                    {

                        // For Update, we need to get the full entity with all configured fields
                        Entity fullEntity = targetEntity;
                        
                        if (context.MessageName.Equals("Update", StringComparison.OrdinalIgnoreCase))
                        {
                            fullEntity = MergeWithPreImage(targetEntity, context, config, tracingService);
                        }

                        // Build the name value
                        string nameValue = BuildNameValue(fullEntity, config, service, config.EnableTracing ? tracingService : new NullTracingService());

                        // Set the target field (typically "name")
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
        /// Determine if the plugin should trigger based on which fields are being updated
        /// </summary>
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
        /// Merge target entity with PreImage to get all field values
        /// </summary>
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

                // Copy formatted values as well (important for optionsets)
                foreach (var formattedValue in preImage.FormattedValues)
                {
                    mergedEntity.FormattedValues[formattedValue.Key] = formattedValue.Value;
                }
            }

            // Overlay with target entity values (updated fields)
            foreach (var attribute in targetEntity.Attributes)
            {
                mergedEntity[attribute.Key] = attribute.Value;
                
                // If this attribute was updated, remove old formatted value from PreImage
                // so we fetch the current label for optionsets
                if (mergedEntity.FormattedValues.Contains(attribute.Key) && 
                    !targetEntity.FormattedValues.Contains(attribute.Key))
                {
                    mergedEntity.FormattedValues.Remove(attribute.Key);
                }
            }

            // Copy formatted values from target (these contain current optionset labels)
            foreach (var formattedValue in targetEntity.FormattedValues)
            {
                mergedEntity.FormattedValues[formattedValue.Key] = formattedValue.Value;
            }

            return mergedEntity;
        }

        /// <summary>
        /// Build the name value by concatenating field values based on the pattern
        /// </summary>
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
                    string fieldValue = resolver.ResolvePatternFieldValue(entity, part);
                    if (!string.IsNullOrEmpty(fieldValue))
                    {
                        nameParts.Append(fieldValue);
                    }
                    else if (part.IncludeIf != null)
                    {
                        // Field was excluded due to condition - skip adjacent prefix/suffix
                        // Mark that we skipped a conditional field so prefix/suffix can be handled
                        // This is already handled by FieldArrayParser structure
                    }
                }
                else
                {
                    // Literal text from pattern
                    nameParts.Append(part.LiteralText);
                }
            }

            string result = nameParts.ToString();

            // Apply maxLength truncation if configured
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
    /// Tracing service that swallows traces when tracing is disabled
    /// </summary>
    internal class NullTracingService : ITracingService
    {
        public void Trace(string format, params object[] args) { }
        public void Trace(string message) { }
    }
}
