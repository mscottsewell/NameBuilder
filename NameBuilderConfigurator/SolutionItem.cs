using System;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Represents a Dataverse solution option used by the configurator UI.
    /// </summary>
    /// <remarks>
    /// This is a lightweight view model for list controls and does not attempt to model every solution attribute.
    /// </remarks>
    public class SolutionItem
    {
        /// <summary>
        /// Unique identifier of the solution record.
        /// </summary>
        public Guid SolutionId { get; set; }

        /// <summary>
        /// Human-friendly display name shown in UI.
        /// </summary>
        public string FriendlyName { get; set; }

        /// <summary>
        /// Unique solution name (internal identifier).
        /// </summary>
        public string UniqueName { get; set; }

        /// <summary>
        /// Indicates whether the solution is managed.
        /// </summary>
        public bool IsManaged { get; set; }

        /// <summary>
        /// Returns the label used in list UI: friendly name when available, otherwise unique name.
        /// </summary>
        public override string ToString() => string.IsNullOrWhiteSpace(FriendlyName) ? UniqueName : FriendlyName;
    }
}
