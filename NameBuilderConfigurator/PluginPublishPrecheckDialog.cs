using System;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace NameBuilderConfigurator
{
    internal sealed class PluginPublishPrecheckDialog : Form
    {
        private readonly TextBox detailsTextBox;
        private readonly Button continueButton;
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
            ClientSize = new Size(760, 420);

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
                Size = new Size(ClientSize.Width - 24, ClientSize.Height - 96),
                Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
                Text = FormatInfo(info)
            };

            continueButton = new Button
            {
                Text = "Continue",
                DialogResult = DialogResult.OK,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Size = new Size(100, 28),
                Location = new Point(ClientSize.Width - 224, ClientSize.Height - 44)
            };

            cancelButton = new Button
            {
                Text = "Cancel",
                DialogResult = DialogResult.Cancel,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Size = new Size(100, 28),
                Location = new Point(ClientSize.Width - 112, ClientSize.Height - 44)
            };

            Controls.Add(titleLabel);
            Controls.Add(detailsTextBox);
            Controls.Add(continueButton);
            Controls.Add(cancelButton);

            AcceptButton = continueButton;
            CancelButton = cancelButton;
        }

        private static string FormatInfo(PluginPublishPrecheckInfo info)
        {
            var sb = new StringBuilder();

            sb.AppendLine($"Environment: {info.EnvironmentName ?? "(unknown)"}");
            sb.AppendLine();

            sb.AppendLine("Installed plug-in (Dataverse):");
            sb.AppendLine($"  Present:        {(info.IsInstalled ? "Yes" : "No")}");
            sb.AppendLine($"  Assembly name:  {info.InstalledAssemblyName ?? "(unknown)"}");
            sb.AppendLine($"  Version field:  {info.InstalledVersion ?? "(unknown)"}");
            sb.AppendLine($"  DLL Assembly:   {info.InstalledAssemblyVersion ?? "(unknown)"}");
            sb.AppendLine($"  DLL File:       {info.InstalledFileVersion ?? "(unknown)"}");
            sb.AppendLine($"  Modified on:    {(info.InstalledModifiedOn.HasValue ? info.InstalledModifiedOn.Value.ToString("u") : "(unknown)")}");
            sb.AppendLine();

            sb.AppendLine("Packaged plug-in (local):");
            sb.AppendLine($"  Path:           {info.LocalAssemblyPath ?? "(not found)"}");
            sb.AppendLine($"  Assembly ver:   {info.LocalAssemblyVersion ?? "(unknown)"}");
            sb.AppendLine($"  File ver:       {info.LocalFileVersion ?? "(unknown)"}");
            sb.AppendLine();

            sb.AppendLine("Comparison:");
            sb.AppendLine($"  Result:         {info.ComparisonSummary ?? "(unknown)"}");

            if (!string.IsNullOrWhiteSpace(info.WarningOrNote))
            {
                sb.AppendLine();
                sb.AppendLine("Note:");
                sb.AppendLine($"  {info.WarningOrNote}");
            }

            if (!string.IsNullOrWhiteSpace(info.ErrorMessage))
            {
                sb.AppendLine();
                sb.AppendLine("Error:");
                sb.AppendLine($"  {info.ErrorMessage}");
            }

            return sb.ToString();
        }
    }

    internal sealed class PluginPublishPrecheckInfo
    {
        public string EnvironmentName { get; set; }

        public bool IsInstalled { get; set; }
        public string InstalledAssemblyName { get; set; }
        public string InstalledAssemblyVersion { get; set; }
        public string InstalledFileVersion { get; set; }
        public string InstalledVersion { get; set; }
        public DateTime? InstalledModifiedOn { get; set; }

        public string LocalAssemblyPath { get; set; }
        public string LocalAssemblyVersion { get; set; }
        public string LocalFileVersion { get; set; }

        public string ComparisonSummary { get; set; }
        public string WarningOrNote { get; set; }
        public string ErrorMessage { get; set; }
    }
}
