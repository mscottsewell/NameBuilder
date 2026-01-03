using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Minimal view of a Dataverse SDK message processing step used by the configurator.
    /// </summary>
    /// <remarks>
    /// This is populated from the sdkmessageprocessingstep table and is used to display candidate steps and extract
    /// the unsecure configuration JSON.
    /// </remarks>
    internal class PluginStepInfo
    {
        /// <summary>Dataverse sdkmessageprocessingstep id.</summary>
        public Guid StepId { get; set; }
        /// <summary>Step name shown in the Plug-in Registration tool.</summary>
        public string Name { get; set; }
        /// <summary>Optional description configured on the step.</summary>
        public string Description { get; set; }
        /// <summary>Unsecure configuration JSON (where NameBuilder configuration is stored).</summary>
        public string UnsecureConfiguration { get; set; }
        /// <summary>Primary entity logical name for the step.</summary>
        public string PrimaryEntity { get; set; }
        /// <summary>Secondary entity logical name for the step (when applicable).</summary>
        public string SecondaryEntity { get; set; }
        /// <summary>SDK message name (Create/Update/etc).</summary>
        public string MessageName { get; set; }
        /// <summary>Dataverse sdkmessage id.</summary>
        public Guid? MessageId { get; set; }
        /// <summary>Dataverse sdkmessagefilter id.</summary>
        public Guid? MessageFilterId { get; set; }
        /// <summary>Filtering attributes on the step (comma-separated list), when set.</summary>
        public string FilteringAttributes { get; set; }
        /// <summary>Execution stage (e.g., 20 = PreOperation) when known.</summary>
        public int? Stage { get; set; }
        /// <summary>Execution mode (e.g., 0 = synchronous) when known.</summary>
        public int? Mode { get; set; }
    }

    /// <summary>
    /// Dialog that lets the user select a plug-in step from Dataverse.
    /// </summary>
    internal class StepSelectionDialog : Form
    {
        private readonly ListView stepListView;
        private readonly Button okButton;
        private readonly Button cancelButton;
        private readonly TextBox descriptionPreview;

        /// <summary>The step chosen by the user.</summary>
        public PluginStepInfo SelectedStep { get; private set; }

        /// <summary>
        /// Creates the dialog.
        /// </summary>
        /// <param name="steps">Candidate steps to show.</param>
        public StepSelectionDialog(IEnumerable<PluginStepInfo> steps)
        {
            Text = "Select Plugin Step";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            Size = new Size(520, 360);
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;

            stepListView = new ListView
            {
                Dock = DockStyle.Fill,
                FullRowSelect = true,
                MultiSelect = false,
                View = View.Details
            };
            stepListView.Columns.Add("Step Name", 480);
            stepListView.ColumnWidthChanging += (s, e) =>
            {
                e.Cancel = true;
                e.NewWidth = stepListView.Columns[0].Width;
            };
            stepListView.Resize += (s, e) => stepListView.Columns[0].Width = stepListView.ClientSize.Width - 4;

            foreach (var step in steps ?? Enumerable.Empty<PluginStepInfo>())
            {
                var item = new ListViewItem(step.Name ?? "(Unnamed Step)")
                {
                    Tag = step
                };
                stepListView.Items.Add(item);
            }

            if (stepListView.Items.Count > 0)
            {
                stepListView.Items[0].Selected = true;
                stepListView.Select();
            }

            stepListView.SelectedIndexChanged += (s, e) =>
            {
                var hasSelection = stepListView.SelectedItems.Count > 0;
                okButton.Enabled = hasSelection;
                if (hasSelection)
                {
                    var step = (PluginStepInfo)stepListView.SelectedItems[0].Tag;
                    descriptionPreview.Text = step.Description ?? string.Empty;
                }
                else
                {
                    descriptionPreview.Clear();
                }
            };

            descriptionPreview = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Font = new Font("Segoe UI", 9F),
                BackColor = Color.White
            };

            okButton = new Button
            {
                Text = "Load",
                DialogResult = DialogResult.OK,
                Enabled = stepListView.SelectedItems.Count > 0
            };
            okButton.Click += (s, e) =>
            {
                if (stepListView.SelectedItems.Count == 0)
                {
                    DialogResult = DialogResult.None;
                    return;
                }

                SelectedStep = (PluginStepInfo)stepListView.SelectedItems[0].Tag;
            };

            cancelButton = new Button
            {
                Text = "Cancel",
                DialogResult = DialogResult.Cancel,
            };

            var descriptionPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 110,
                Padding = new Padding(0, 4, 0, 0)
            };
            descriptionPanel.Controls.Add(descriptionPreview);
            descriptionPanel.Controls.Add(new Label
            {
                Text = "Description:",
                Dock = DockStyle.Top,
                Height = 20,
                Padding = new Padding(4, 4, 0, 0)
            });

            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 52,
                Padding = new Padding(0, 10, 10, 10)
            };
            buttonPanel.Controls.Add(cancelButton);
            buttonPanel.Controls.Add(okButton);

            Controls.Add(stepListView);
            Controls.Add(descriptionPanel);
            Controls.Add(buttonPanel);

            AcceptButton = okButton;
            CancelButton = cancelButton;
        }
    }
}
