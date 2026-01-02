using System;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Displays a pre-publish status summary comparing the installed Dataverse plug-in vs the packaged local plug-in.
    /// </summary>
    /// <remarks>
    /// This dialog is shown before publishing configuration so users can choose to proceed, cancel, or install/update
    /// the plug-in first.
    /// </remarks>
    internal sealed class PluginPublishPrecheckDialog : Form
    {
        private readonly TextBox detailsTextBox;
        private readonly Button continueButton;
        private readonly Button updateButton;
        private readonly Button cancelButton;

        public PluginPublishPrecheckDialog(PluginPublishPrecheckInfo info)
        {
            if (info == null) throw new ArgumentNullException(nameof(info));

            Text = "NameBuilder Plug-in Status";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MinimizeBox = false;
            MaximizeBox = false;
            ShowInTaskbar = false;
            ClientSize = new Size(540, 285);

            var titleLabel = new Label
            {
                AutoSize = false,
                Text = "Before publishing configuration, verify the NameBuilder plug-in status:",
                Font = new Font(Font, FontStyle.Bold),
                Location = new Point(12, 12),
                Size = new Size(ClientSize.Width - 24, 22)
            };

            detailsTextBox = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                WordWrap = false,
                Font = new Font(FontFamily.GenericMonospace, 9f),
                Location = new Point(12, 40),
                Size = new Size(ClientSize.Width - 24, ClientSize.Height - 86),
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
                Text = FormatInfo(info)
            };

            continueButton = new Button
            {
                Text = "Continue without updating",
                DialogResult = DialogResult.OK,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Size = new Size(170, 28)
            };

            updateButton = new Button
            {
                Text = string.IsNullOrWhiteSpace(info.UpdateActionText) ? "Update plug-in first" : info.UpdateActionText,
                DialogResult = DialogResult.Retry,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Size = new Size(160, 28),
                Visible = info.CanOfferUpdate
            };

            cancelButton = new Button
            {
                Text = "Cancel publish",
                DialogResult = DialogResult.Cancel,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Size = new Size(110, 28)
            };

            Controls.Add(titleLabel);
            Controls.Add(detailsTextBox);
            Controls.Add(updateButton);
            Controls.Add(continueButton);
            Controls.Add(cancelButton);

            LayoutButtons();

            if (!info.IsInstalled)
            {
                continueButton.Enabled = false;
            }

            AcceptButton = continueButton.Enabled
                ? (IButtonControl)continueButton
                : (updateButton.Visible ? updateButton : cancelButton);
            CancelButton = cancelButton;
        }

        private void LayoutButtons()
        {
            const int padding = 12;
            const int gap = 8;
            var y = ClientSize.Height - padding - 28;

            // Right-align buttons: Cancel, Continue, (optional) Update.
            cancelButton.Location = new Point(ClientSize.Width - padding - cancelButton.Width, y);
            continueButton.Location = new Point(cancelButton.Left - gap - continueButton.Width, y);

            if (updateButton.Visible)
            {
                updateButton.Location = new Point(continueButton.Left - gap - updateButton.Width, y);
            }
            else
            {
                // Keep spacing consistent even when update is hidden.
                updateButton.Location = new Point(continueButton.Left - gap - updateButton.Width, y);
            }
        }

        private static string FormatInfo(PluginPublishPrecheckInfo info)
        {
            var sb = new StringBuilder();

            sb.AppendLine($"Environment: {info.EnvironmentName ?? ""}");
            sb.AppendLine();

            sb.AppendLine("Installed plug-in (Dataverse):");
            sb.AppendLine($"  Present:        {(info.IsInstalled ? "Yes" : "No")}");
            sb.AppendLine($"  Assembly name:  {info.InstalledAssemblyName ?? ""}");
            sb.AppendLine($"  DLL Assembly:   {info.InstalledAssemblyVersion ?? ""}");
            sb.AppendLine($"  DLL File:       {info.InstalledFileVersion ?? ""}");
            sb.AppendLine();

            sb.AppendLine("Packaged plug-in (local):");
            sb.AppendLine($"  Assembly ver:   {info.LocalAssemblyVersion ?? ""}");
            sb.AppendLine($"  File ver:       {info.LocalFileVersion ?? ""}");

            return sb.ToString();
        }
    }

    internal sealed class PluginPublishPrecheckInfo
    {
        /// <summary>Friendly environment name shown in the header.</summary>
        public string EnvironmentName { get; set; }

        /// <summary>True when the NameBuilder assembly exists in Dataverse.</summary>
        public bool IsInstalled { get; set; }
        /// <summary>Assembly name registered in Dataverse (typically "NameBuilder").</summary>
        public string InstalledAssemblyName { get; set; }
        /// <summary>Installed assembly version (from the uploaded DLL) when available.</summary>
        public string InstalledAssemblyVersion { get; set; }
        /// <summary>Installed file version (from the uploaded DLL) when available.</summary>
        public string InstalledFileVersion { get; set; }
        /// <summary>Raw Dataverse "version" value from pluginassembly (when available).</summary>
        public string InstalledVersion { get; set; }
        /// <summary>Dataverse modified-on timestamp for the assembly record (when available).</summary>
        public DateTime? InstalledModifiedOn { get; set; }

        /// <summary>Local path to NameBuilder.dll used for comparison and optional update.</summary>
        public string LocalAssemblyPath { get; set; }
        /// <summary>Local assembly version read from the file.</summary>
        public string LocalAssemblyVersion { get; set; }
        /// <summary>Local file version read from the file.</summary>
        public string LocalFileVersion { get; set; }

        /// <summary>High-level comparison summary (e.g., "Installed matches local").</summary>
        public string ComparisonSummary { get; set; }
        /// <summary>Optional warning or note to display to the user.</summary>
        public string WarningOrNote { get; set; }
        /// <summary>Optional error message when comparison could not be computed.</summary>
        public string ErrorMessage { get; set; }

        /// <summary>True when the UI should offer an update action.</summary>
        public bool CanOfferUpdate { get; set; }
        /// <summary>Optional override text for the update button.</summary>
        public string UpdateActionText { get; set; }
    }
}
