using System;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace NameBuilder
{
    /// <summary>
    /// Evaluates field conditions for conditional field inclusion
    /// </summary>
    public static class ConditionEvaluator
    {
        /// <summary>
        /// Evaluate whether a condition is met
        /// </summary>
        /// <param name="entity">Entity containing the field to check</param>
        /// <param name="condition">Condition to evaluate</param>
        /// <param name="tracingService">Tracing service for diagnostics</param>
        /// <returns>True if condition is met, false otherwise</returns>
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
