using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace NameBuilderConfigurator
{
    /// <summary>
    /// Lightweight representation of a Dataverse plug-in type (plugintype).
    /// </summary>
    internal class PluginTypeInfo
    {
        /// <summary>Dataverse plugintype id.</summary>
        public Guid PluginTypeId { get; set; }

        /// <summary>Display name (may be null/empty in some environments).</summary>
        public string Name { get; set; }

        /// <summary>Fully-qualified CLR type name (namespace + class name).</summary>
        public string TypeName { get; set; }

        public override string ToString() => string.IsNullOrWhiteSpace(Name) ? TypeName : Name;
    }

    /// <summary>
    /// Dialog that lets the user pick which registered plug-in type should be treated as "NameBuilder".
    /// </summary>
    /// <remarks>
    /// Some environments may have multiple types under the same assembly (e.g., old versions or multiple plug-ins).
    /// This dialog provides a deterministic way to choose.
    /// </remarks>
    internal class PluginTypeSelectionDialog : Form
    {
        private readonly ListView typeListView;
        private readonly Button okButton;
        private readonly Button cancelButton;

        /// <summary>The plug-in type chosen by the user.</summary>
        public PluginTypeInfo SelectedType { get; private set; }

        /// <summary>
        /// Creates the dialog.
        /// </summary>
        /// <param name="types">Candidate plug-in types discovered in Dataverse.</param>
        public PluginTypeSelectionDialog(IEnumerable<PluginTypeInfo> types)
        {
            Text = "Select Plugin Type";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterParent;
            Size = new Size(520, 360);
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = false;

            typeListView = new ListView
            {
                Dock = DockStyle.Top,
                Height = 250,
                FullRowSelect = true,
                MultiSelect = false,
                View = View.Details
            };
            typeListView.Columns.Add("Display Name", 220);
            typeListView.Columns.Add("Type Name", 260);

            foreach (var type in types ?? Enumerable.Empty<PluginTypeInfo>())
            {
                var item = new ListViewItem(string.IsNullOrWhiteSpace(type.Name) ? "(unnamed)" : type.Name)
                {
                    Tag = type
                };
                item.SubItems.Add(type.TypeName ?? string.Empty);
                typeListView.Items.Add(item);
            }

            if (typeListView.Items.Count > 0)
            {
                typeListView.Items[0].Selected = true;
                typeListView.Select();
            }

            typeListView.SelectedIndexChanged += (s, e) =>
            {
                okButton.Enabled = typeListView.SelectedItems.Count > 0;
            };

            okButton = new Button
            {
                Text = "Next",
                DialogResult = DialogResult.OK,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Location = new Point(300, 270),
                Enabled = typeListView.SelectedItems.Count > 0
            };
            okButton.Click += (s, e) =>
            {
                if (typeListView.SelectedItems.Count == 0)
                {
                    DialogResult = DialogResult.None;
                    return;
                }

                SelectedType = (PluginTypeInfo)typeListView.SelectedItems[0].Tag;
            };

            cancelButton = new Button
            {
                Text = "Cancel",
                DialogResult = DialogResult.Cancel,
                Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
                Location = new Point(390, 270)
            };

            Controls.Add(typeListView);
            Controls.Add(okButton);
            Controls.Add(cancelButton);

            AcceptButton = okButton;
            CancelButton = cancelButton;
        }
    }
}
