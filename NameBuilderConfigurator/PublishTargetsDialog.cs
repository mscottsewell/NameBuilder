using System;
using System.Drawing;
using System.Windows.Forms;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Dialog that asks which plug-in steps (Create/Update) should receive the configuration payload.
    /// </summary>
    internal class PublishTargetsDialog : Form
    {
        private readonly CheckBox insertCheckBox;
        private readonly CheckBox updateCheckBox;
        private readonly Button okButton;
        private readonly Button closeButton;
        private bool isPublishing;

        /// <summary>Raised after the publish target selection has been validated.</summary>
        public event EventHandler PublishRequested;

        /// <summary>True if the Create (Insert) step should be published/updated.</summary>
        public bool PublishInsert => insertCheckBox.Checked;

        /// <summary>True if the Update step should be published/updated.</summary>
        public bool PublishUpdate => updateCheckBox.Checked;

        /// <summary>
        /// Creates the dialog.
        /// </summary>
        /// <param name="entityDisplayName">Friendly name of the target entity.</param>
        /// <param name="insertExists">Whether a Create step already exists in Dataverse.</param>
        /// <param name="updateExists">Whether an Update step already exists in Dataverse.</param>
        public PublishTargetsDialog(string entityDisplayName, bool insertExists, bool updateExists)
        {
            Text = "Publish Configuration";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            Size = new Size(420, 260);
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;

            var instructions = new Label
            {
                Text = $"Choose which steps for \"{entityDisplayName}\" should receive the updated configuration.",
                Dock = DockStyle.Top,
                Height = 45,
                Padding = new Padding(10, 12, 10, 0),
                AutoSize = false
            };
            Controls.Add(instructions);

            insertCheckBox = new CheckBox
            {
                Text = "Insert (Create) step",
                Checked = true,
                Location = new Point(15, 60),
                AutoSize = true
            };
            Controls.Add(insertCheckBox);
            Controls.Add(new Label
            {
                Text = insertExists ? "Existing step will be updated." : "Step will be created (PreOperation, synchronous).",
                Location = new Point(35, 82),
                AutoSize = true,
                ForeColor = insertExists ? Color.ForestGreen : Color.DarkOrange
            });

            updateCheckBox = new CheckBox
            {
                Text = "Update step",
                Checked = true,
                Location = new Point(15, 120),
                AutoSize = true
            };
            Controls.Add(updateCheckBox);
            Controls.Add(new Label
            {
                Text = updateExists ? "Existing step will be updated." : "Step will be created (PreOperation, synchronous).",
                Location = new Point(35, 142),
                AutoSize = true,
                ForeColor = updateExists ? Color.ForestGreen : Color.DarkOrange
            });

            okButton = new Button
            {
                Text = "Publish",
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Location = new Point(210, 180)
            };
            okButton.Click += (s, e) =>
            {
                if (!insertCheckBox.Checked && !updateCheckBox.Checked)
                {
                    MessageBox.Show("Select at least one step to publish.", "Validation", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                PublishRequested?.Invoke(this, EventArgs.Empty);
            };

            closeButton = new Button
            {
                Text = "Cancel",
                DialogResult = DialogResult.Cancel,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Location = new Point(300, 180)
            };

            Controls.Add(okButton);
            Controls.Add(closeButton);

            AcceptButton = okButton;
            CancelButton = closeButton;
            FormClosing += (s, e) =>
            {
                if (isPublishing)
                {
                    e.Cancel = true;
                }
            };
        }

        /// <summary>Updates the dialog controls while a publish operation is running.</summary>
        public void SetPublishing(bool publishing)
        {
            isPublishing = publishing;
            insertCheckBox.Enabled = !publishing;
            updateCheckBox.Enabled = !publishing;
            okButton.Enabled = !publishing;
            closeButton.Enabled = !publishing;
        }

        /// <summary>Changes the completed dialog to offer Close as its default action.</summary>
        public void CompletePublish()
        {
            isPublishing = false;
            insertCheckBox.Enabled = false;
            updateCheckBox.Enabled = false;
            okButton.Visible = false;
            closeButton.Text = "Close";
            closeButton.Enabled = true;
            AcceptButton = closeButton;
            closeButton.Focus();
        }
    }
}
