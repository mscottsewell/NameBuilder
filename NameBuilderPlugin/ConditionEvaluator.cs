using System;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace NameBuilder
{
    /// <summary>
    /// Evaluates boolean conditions used to include or exclude fields in the output.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Conditions are typically supplied via JSON configuration as part of <see cref="FieldCondition"/>.
    /// </para>
    /// <para>
    /// The evaluator is intentionally defensive: unknown operators or missing condition metadata default to
    /// "true" (include) to avoid accidentally suppressing output due to configuration mistakes.
    /// </para>
    /// </remarks>
    public static class ConditionEvaluator
    {
        /// <summary>
        /// Evaluates whether a condition is met for a given entity.
        /// </summary>
        /// <param name="entity">Entity containing the field to check</param>
        /// <param name="condition">Condition to evaluate</param>
        /// <param name="tracingService">Tracing service for diagnostics</param>
        /// <returns>True if condition is met, false otherwise</returns>
        /// <remarks>
        /// <para>
        /// Supported operator values (case-insensitive):
        /// <list type="bullet">
        /// <item><description><c>equals</c>/<c>eq</c>, <c>notequals</c>/<c>ne</c></description></item>
        /// <item><description><c>contains</c>, <c>notcontains</c></description></item>
        /// <item><description><c>in</c>, <c>notin</c> (comma-separated list)</description></item>
        /// <item><description><c>greaterthan</c>/<c>gt</c>, <c>lessthan</c>/<c>lt</c>, <c>greaterthanorequal</c>/<c>gte</c>, <c>lessthanorequal</c>/<c>lte</c></description></item>
        /// <item><description><c>isempty</c>, <c>isnotempty</c></description></item>
        /// </list>
        /// </para>
        /// <para>
        /// Missing attributes on <paramref name="entity"/> are treated as <c>null</c> and evaluated accordingly.
        /// </para>
        /// </remarks>
        public static bool EvaluateCondition(Entity entity, FieldCondition condition, ITracingService tracingService)
        {
            if (condition == null)
            {
                return true; // No condition means always include
            }

            // Compound OR (anyOf)
            if (condition.AnyOf != null && condition.AnyOf.Count > 0)
            {
                foreach (var sub in condition.AnyOf)
                {
                    if (EvaluateCondition(entity, sub, tracingService))
                    {
                        return true;
                    }
                }
                return false;
            }

            // Compound AND (allOf)
            if (condition.AllOf != null && condition.AllOf.Count > 0)
            {
                foreach (var sub in condition.AllOf)
                {
                    if (!EvaluateCondition(entity, sub, tracingService))
                    {
                        return false;
                    }
                }
                return true;
            }

            if (string.IsNullOrWhiteSpace(condition.Field))
            {
                tracingService?.Trace("ConditionEvaluator: condition.Field is null or empty for single condition, defaulting to true");
                return true;
            }

            if (string.IsNullOrWhiteSpace(condition.Operator))
            {
                tracingService?.Trace("ConditionEvaluator: condition.Operator is null or empty for single condition, defaulting to true");
                return true;
            }

            // Get the field value from the entity
            if (!entity.Contains(condition.Field))
            {
                // Field not present - treat as null/empty for condition evaluation
                return EvaluateOperator(condition.Operator, null, condition.Value, tracingService);
            }

            var fieldValue = entity[condition.Field];
            return EvaluateOperator(condition.Operator, fieldValue, condition.Value, tracingService);
        }

        /// <summary>
        /// Applies a single operator to the provided value.
        /// </summary>
        /// <param name="operatorName">Operator name (case-insensitive).</param>
        /// <param name="fieldValue">The raw attribute value from Dataverse.</param>
        /// <param name="expectedValue">Expected value from configuration (string form).</param>
        /// <param name="tracingService">Tracing service (optional).</param>
        /// <returns>True if the operator matches, otherwise false.</returns>
        private static bool EvaluateOperator(string operatorName, object fieldValue, string expectedValue, ITracingService tracingService)
        {
            string fieldValueStr = ConvertToString(fieldValue);
            string op = operatorName.ToLowerInvariant();

            switch (op)
            {
                case "equals":
                case "eq":
                    return string.Equals(fieldValueStr, expectedValue, StringComparison.OrdinalIgnoreCase);

                case "notequals":
                case "ne":
                    return !string.Equals(fieldValueStr, expectedValue, StringComparison.OrdinalIgnoreCase);

                case "contains":
                    return fieldValueStr != null && fieldValueStr.IndexOf(expectedValue ?? string.Empty, StringComparison.OrdinalIgnoreCase) >= 0;

                case "notcontains":
                    return fieldValueStr == null || fieldValueStr.IndexOf(expectedValue ?? string.Empty, StringComparison.OrdinalIgnoreCase) < 0;

                case "in":
                    if (string.IsNullOrWhiteSpace(expectedValue))
                        return false;
                    var inValues = expectedValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                                               .Select(v => v.Trim())
                                               .ToArray();
                    return inValues.Any(v => string.Equals(fieldValueStr, v, StringComparison.OrdinalIgnoreCase));

                case "notin":
                    if (string.IsNullOrWhiteSpace(expectedValue))
                        return true;
                    var notInValues = expectedValue.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                                                   .Select(v => v.Trim())
                                                   .ToArray();
                    return !notInValues.Any(v => string.Equals(fieldValueStr, v, StringComparison.OrdinalIgnoreCase));

                case "greaterthan":
                case "gt":
                    return CompareNumeric(fieldValueStr, expectedValue, (a, b) => a > b);

                case "lessthan":
                case "lt":
                    return CompareNumeric(fieldValueStr, expectedValue, (a, b) => a < b);

                case "greaterthanorequal":
                case "gte":
                    return CompareNumeric(fieldValueStr, expectedValue, (a, b) => a >= b);

                case "lessthanorequal":
                case "lte":
                    return CompareNumeric(fieldValueStr, expectedValue, (a, b) => a <= b);

                case "isempty":
                    return string.IsNullOrWhiteSpace(fieldValueStr);

                case "isnotempty":
                    return !string.IsNullOrWhiteSpace(fieldValueStr);

                default:
                    tracingService?.Trace($"ConditionEvaluator: Unknown operator '{operatorName}', defaulting to true");
                    return true;
            }
        }

        /// <summary>
        /// Converts common Dataverse attribute types into a comparable string representation.
        /// </summary>
        /// <remarks>
        /// This keeps the condition engine simple: most comparisons are performed as case-insensitive string operations.
        /// Numeric operators parse as <see cref="decimal"/> when possible.
        /// </remarks>
        private static string ConvertToString(object fieldValue)
        {
            if (fieldValue == null)
                return null;

            // Handle OptionSetValue
            if (fieldValue is OptionSetValue optionSet)
            {
                return optionSet.Value.ToString();
            }

            // Handle EntityReference (use Name if available, otherwise Id)
            if (fieldValue is EntityReference entityRef)
            {
                return !string.IsNullOrEmpty(entityRef.Name) ? entityRef.Name : entityRef.Id.ToString();
            }

            // Handle Money
            if (fieldValue is Money money)
            {
                return money.Value.ToString();
            }

            // Handle DateTime
            if (fieldValue is DateTime dateTime)
            {
                return dateTime.ToString("yyyy-MM-dd");
            }

            // Handle bool
            if (fieldValue is bool boolValue)
            {
                return boolValue.ToString().ToLowerInvariant();
            }

            // Default to ToString
            return fieldValue.ToString();
        }

        /// <summary>
        /// Attempts to parse two strings as decimals and apply a numeric comparison.
        /// </summary>
        /// <remarks>
        /// Uses <see cref="decimal.TryParse(string, out decimal)"/> with current culture rules. Configuration values
        /// should therefore be provided using the same culture/formatting expectations as the runtime.
        /// </remarks>
        private static bool CompareNumeric(string fieldValueStr, string expectedValue, Func<decimal, decimal, bool> comparison)
        {
            if (string.IsNullOrWhiteSpace(fieldValueStr) || string.IsNullOrWhiteSpace(expectedValue))
                return false;

            if (decimal.TryParse(fieldValueStr, out decimal fieldNum) && decimal.TryParse(expectedValue, out decimal expectedNum))
            {
                return comparison(fieldNum, expectedNum);
            }

            return false;
        }
    }
}
