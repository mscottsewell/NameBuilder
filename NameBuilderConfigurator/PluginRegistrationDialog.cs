using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Dialog that prompts the user to locate NameBuilder.dll and confirms installing/updating it in Dataverse.
    /// </summary>
    /// <remarks>
    /// This dialog only chooses the local assembly path; the actual registration is performed by the caller.
    /// </remarks>
    internal sealed class PluginRegistrationDialog : Form
    {
        private readonly TextBox pathTextBox;
        private readonly Label statusLabel;
        private readonly PluginRegistrationStatusInfo statusInfo;

        /// <summary>The local path selected by the user for NameBuilder.dll.</summary>
        public string SelectedAssemblyPath { get; private set; }

        /// <summary>
        /// Creates the dialog.
        /// </summary>
        /// <param name="defaultAssemblyPath">Initial suggested path for NameBuilder.dll.</param>
        /// <param name="status">Information about the currently installed plug-in in Dataverse.</param>
        public PluginRegistrationDialog(string defaultAssemblyPath, PluginRegistrationStatusInfo status)
        {
            statusInfo = status ?? new PluginRegistrationStatusInfo();
            Text = statusInfo.IsInstalled ? "Update NameBuilder Plug-in" : "Register NameBuilder Plug-in";
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(520, 250);

            var messageLabel = new Label
            {
                Text = "Install or update the NameBuilder plug-in assembly in the connected Dataverse environment.\nOnly the plug-in assembly will be deployed. Existing registry steps remain unchanged.",
                AutoSize = false,
                Location = new Point(12, 12),
                Size = new Size(496, 50)
            };
            Controls.Add(messageLabel);

            statusLabel = new Label
                {
                    AutoSize = false,
                    Location = new Point(12, 68),
                    Size = new Size(496, 55),
                    ForeColor = statusInfo.IsInstalled ? Color.DarkGreen : Color.Firebrick
                };
            statusLabel.Text = BuildStatusMessage();
            Controls.Add(statusLabel);

            var pathLabel = new Label
            {
                Text = "Assembly file:",
                Location = new Point(12, 128),
                AutoSize = true
            };
            Controls.Add(pathLabel);

            pathTextBox = new TextBox
            {
                Location = new Point(12, 148),
                Size = new Size(420, 23),
                ReadOnly = true,
                Text = defaultAssemblyPath ?? string.Empty
            };
            Controls.Add(pathTextBox);

            var browseButton = new Button
            {
                Text = "Browse...",
                Location = new Point(440, 146),
                Size = new Size(70, 27)
            };
            browseButton.Click += (s, e) => BrowseForAssembly();
            Controls.Add(browseButton);

            var hintLabel = new Label
            {
                Text = "The packaged DLL is located under Assets\\DataversePlugin\\NameBuilder.dll.",
                Location = new Point(12, 178),
                Size = new Size(496, 20),
                ForeColor = Color.DimGray
            };
            Controls.Add(hintLabel);

            var installButton = new Button
            {
                Text = statusInfo.IsInstalled ? "Update Plug-in" : "Register Plug-in",
                Location = new Point(288, 208),
                Size = new Size(120, 30)
            };
            installButton.Click += (s, e) => TryConfirmSelection();
            Controls.Add(installButton);

            var cancelButton = new Button
            {
                Text = "Cancel",
                Location = new Point(416, 208),
                Size = new Size(94, 30)
            };
            cancelButton.Click += (s, e) => DialogResult = DialogResult.Cancel;
            Controls.Add(cancelButton);

            AcceptButton = installButton;
            CancelButton = cancelButton;
        }

        /// <summary>Shows a file picker to select NameBuilder.dll.</summary>
        private void BrowseForAssembly()
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Filter = "DLL files (*.dll)|*.dll|All files (*.*)|*.*";
                dialog.Title = "Select NameBuilder.dll";
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    pathTextBox.Text = dialog.FileName;
                }
            }
        }

        /// <summary>
        /// Validates the chosen file path and closes with OK when the selection is usable.
        /// </summary>
        private void TryConfirmSelection()
        {
            var selectedPath = pathTextBox.Text?.Trim();
            if (string.IsNullOrWhiteSpace(selectedPath) || !File.Exists(selectedPath))
            {
                MessageBox.Show(this,
                    "Select a valid NameBuilder.dll file before continuing.",
                    "Assembly Required",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            SelectedAssemblyPath = selectedPath;
            DialogResult = DialogResult.OK;
            Close();
        }

        /// <summary>Builds a human-readable status message shown at the top of the dialog.</summary>
        private string BuildStatusMessage()
        {
            if (statusInfo == null)
            {
                return string.Empty;
            }

            var lines = new List<string>();
            if (statusInfo.IsInstalled)
            {
                lines.Add($"Current NameBuilder build: {FormatHashPreview(statusInfo.InstalledHash)}");
                if (statusInfo.RegisteredTypes != null && statusInfo.RegisteredTypes.Count > 0)
                {
                    lines.Add("Registered types: " + string.Join(", ", statusInfo.RegisteredTypes));
                }
            }
            else
            {
                lines.Add("No NameBuilder plug-in was detected in the connected environment.");
            }

            if (!string.IsNullOrWhiteSpace(statusInfo.StatusMessage))
            {
                lines.Add(statusInfo.StatusMessage);
            }

            return string.Join(Environment.NewLine, lines.Where(l => !string.IsNullOrWhiteSpace(l)));
        }

        private static string FormatHashPreview(string hash)
        {
            if (string.IsNullOrWhiteSpace(hash))
            {
                return "unknown";
            }

            var normalized = hash.Trim();
            return normalized.Length <= 12 ? normalized : normalized.Substring(0, 12) + "…";
        }
    }

    internal sealed class PluginRegistrationStatusInfo
    {
        /// <summary>True when a NameBuilder assembly was found in Dataverse.</summary>
        public bool IsInstalled { get; set; }

        /// <summary>The installed assembly version (when known).</summary>
        public string InstalledVersion { get; set; }

        /// <summary>Additional status message (warnings or details) to show in the UI.</summary>
        public string StatusMessage { get; set; }

        /// <summary>Registered plug-in type display names.</summary>
        public IReadOnlyList<string> RegisteredTypes { get; set; } = Array.Empty<string>();

        /// <summary>SHA-256 hash of the installed assembly content (when available).</summary>
        public string InstalledHash { get; set; }
    }
}
