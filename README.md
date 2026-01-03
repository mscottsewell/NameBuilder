<img width="1248" alt="image" src="https://github.com/user-attachments/assets/1079e0d3-cdfc-48c2-9e02-16addf35649a" />

---

# NameBuilder for Dataverse

**Automatically build consistent, meaningful record names** from other fields on your Dataverse records—no code required.

>In Dataverse / PowerApps / Dynamics 365 CRM, the primary name field is what users see in lookups, timelines, views, and search results. 
Typically the information for the name is already entered on the form, so it's a waste of the user's time to enter/maintain it in two places.
If that name is inconsistent or incomplete, users waste time opening records just to confirm what they're looking at. 
NameBuilder solves this by **automatically assembling names** from the fields that matter most.

<img width="1000" alt="image" src="https://github.com/user-attachments/assets/ce3dfec3-f4a2-4e7b-9281-8d3df2254ec2" />

## Why NameBuilder?

- **Standardize naming** across tables so users recognize records at a glance
- **Reduce manual data entry** by computing names automatically on Create/Update
- **Improve search and usability** by including the most important context (customer, dates, status, identifiers)
- **Keep names accurate over time** as key fields change

**Common patterns:**
- Cases: `Contoso Ltd | 2026.01.02 CAS-12345 | High `
- Opportunities: `Contoso Ltd - $2.50M - 75% - Durden, Tyler`
- Projects: ` 2026JAN ~ John Smith | Web Development`

## Getting Started (The Easy Way)

>**The easiest way to use NameBuilder is through the XrmToolBox**:

### Step 1: Install NameBuilder Configurator

1. Open **XrmToolBox** (Available https://www.xrmtoolbox.com/ )
2. Go to **Configuration ➜ Tool Library**
3. Search for **NameBuilder Configurator**
4. Click **Install** and restart XrmToolBox if prompted

### Step 2: Connect and Design Your Pattern

1. Connect to your Dataverse environment using the XrmToolBox connection wizard
2. Open **NameBuilder Configurator** from the tools list
3. Click **Load Metadata** to see your entities
4. Select the entity you want to configure (e.g., Case, Opportunity, Contact)
5. (Optional) Choose a view and sample record to see live previews

### Step 3: Build Your Name Pattern

The visual designer makes it easy:

1. **Double-click attributes** from the Available Attributes list to add them as blocks
2. **Configure each block**:
   - Add prefix/suffix (e.g., `" - "`, `" | "`)
   - Format dates (e.g., `yyyy-MM-dd`, `MM/dd/yyyy`)
   - Format numbers and currency (e.g., `$2.50M`, `1,234`)
   - Set defaults if a field is blank
   - Add conditions to show/hide fields based on other values
3. **Watch the live preview** update as you build
4. **click the up/down arrows on blocks** to reorder them

### Step 4: Publish

1. Click **Publish Configuration**
2. Choose **Create**, **Update**, or **both**
3. The configurator automatically installs the plugin if needed and sets up everything for you
4. **Note**: The tool ensures only one Create step and one Update step exist per entity, automatically updating existing steps rather than creating duplicates

### Step 5: Test

- **Create** a new record—the name field populates automatically
- **Update** a configured field—the name refreshes instantly

## Using the Visual Designer

The NameBuilder Configurator gives you a complete visual environment:

- **Entity browser** – Filter by solution, select entities, pick views and sample records
- **Up and down arrows** – Reorder fields with visual handles
- **Property panels** – Configure prefix/suffix, formats, truncation, defaults, and conditions
- **Live preview** – See your assembled name update in real-time
- **Condition builder** – Create simple or complex rules (anyOf/allOf logic)
- **Import/Export** – Save configurations as JSON files for backup or sharing

For detailed UI guidance, see the [XrmToolBox Configurator UI Guide](NameBuilderConfigurator/Docs/USAGE.md).


### Key Configuration Features

- **Date formatting**: `yyyy-MM-dd`, `MM/dd/yyyy`, custom formats
- **Number/Currency formatting**: `$2.50M`, `1,234`, K/M/B scaling
- **Default values**: Fallback text when fields are empty
- **Alternate fields**: Chain multiple fields (`primarycontact` → `customer` → `"Unknown"`)
- **Conditional logic**: Show/hide fields based on status, priority, or any field value
- **Truncation**: Set max length with custom indicators

#### Important: **Timezone** Settings for Date/DateTime Fields

>When formatting date or datetime fields in name patterns, **the date string is captured as text based on UTC time** and does not automatically adjust to individual user timezones the way datetime UI controls do in Dataverse.
The Timezone setting allows the user to set an automatic conversion to a designated timezone by adding or subtracting a set number of hours from the UTC datetime.

**Why this matters:**

- Dataverse stores all datetime values in **UTC** (Coordinated Universal Time)
- If your local timezone is ahead or behind UTC, the **date portion may differ** for part of each day
- Example: A record created at 11:00 PM Pacific Time (UTC-8) is stored as 7:00 AM UTC the next day
 and a date-only name pattern using `yyyy-MM-dd` would show tomorrow's date, not today's

**Best practices:**

- **Use the configurator's timezone selector** (available in date formatting options) to specify which timezone should be used when formatting dates for the name field
- The timezone offset accepts fractional hours for regions with half-hour offsets:
  - India Standard Time: `5.5` (UTC+5:30)
  - Newfoundland Time: `-3.5` (UTC-3:30)
  - Australian Central: `9.5` (UTC+9:30)
- Choose a timezone that matches your organization's primary location or the context where the records will be viewed
- Document your timezone choice so users understand what dates represent in record names
- Remember: once captured in the name, the date string remains static—it won't adjust if a user in a different timezone views the record. Choosing the standardized timezone should be considered in context of who all will be viewing it.

**When to use UTC vs. local time:**

- Use **your organization's timezone** if your users generally are within a few timezones of each other and you want to standardize to a common timezone. (Most organizations will use this.)
- Use **UTC** if records are global or timezone-independent (e.g., system events, audit logs)
- Be consistent across similar entities to avoid user confusion

### **See detailed configuration examples:**
- [Pattern Examples](NameBuilderPlugin/Docs/PATTERN_EXAMPLES.md) – Simple pattern syntax
- [Fields Array Examples](NameBuilderPlugin/Docs/EXAMPLES.md) – Advanced configurations
- [Conditional Fields](NameBuilderPlugin/Docs/CONDITIONAL_FIELDS.md) – Show/hide based on conditions
- [Numeric & Currency Formatting](NameBuilderPlugin/Docs/NUMERIC_CURRENCY_DOCS.md) – K/M/B scaling
- [JSON Schema Reference](NameBuilderPlugin/Docs/SCHEMA.md) – Complete schema documentation

## Performance & Optimizations

NameBuilder includes several built-in optimizations to ensure fast, efficient execution:

### Metadata Caching

The plugin caches frequently-accessed metadata to minimize database queries:

- **Option set labels**: Cached by entity, attribute, and value
- **Primary name attributes**: Cached per entity type
- **Field types**: Cached per entity and field combination
- **Currency symbols**: Cached per currency GUID

This dramatically improves performance when processing bulk operations or records with similar field types.

### Tracing Optimization

When tracing is disabled in the plugin configuration (`enableTracing: false`), the plugin uses a null tracing service that eliminates the overhead of formatting trace strings. For production environments, disabling tracing can improve performance, especially during bulk operations.

### Configurator Caching

The XrmToolBox configurator caches:

- Sample records by entity and record ID
- SDK messages and message filters for plugin registration
- Currency symbols for preview rendering

These optimizations speed up the configurator UI and reduce server round-trips when switching between entities or refreshing previews.

## Common Questions

**"It says the NameBuilder plugin isn't installed."**

Click **Publish Configuration**. If the server plugin is missing, the configurator will prompt you to install it as part of the publish flow.

**"Why doesn't Update change the name?"**

Most commonly:
- The Update step filtering attributes don't include the field you changed
- A needed Pre-Image attribute is missing
- Your `includeIf` condition logic excluded a block

Re-publish from the configurator to sync the step settings automatically.

**"Can I manually edit the JSON?"**

Yes! You can import/export JSON configurations. The visual designer and manual JSON editing are fully interchangeable. See the [configuration examples](NameBuilderPlugin/Docs/EXAMPLES.md) for reference.

**"The configurator warns about a version mismatch."**

The configurator detects when the local plugin DLL version doesn't match the version installed on the server. This helps prevent configuration errors from version incompatibilities. Update either the local tool or the server plugin to resolve the mismatch.

## For Administrators

If you need to review installed components, uninstall the plugin, or understand how it integrates with your Dataverse environment at a deeper level, see the **[Administrator Guide](ADMINISTRATOR.md)**.

Topics covered:
- Reviewing plugin steps via Plugin Registration Tool
- Understanding Create/Update steps and Pre-Images
- Uninstalling components safely
- Solution layering and ALM considerations
- Troubleshooting plugin execution

## For Developers

Want to build from source, extend the code, or understand the architecture?

- **Plugin architecture and development**: [NameBuilderPlugin/README.md](NameBuilderPlugin/README.md)
- **Building from source**: [Docs/BUILDING.md](Docs/BUILDING.md)
- **Manual plugin deployment**: [NameBuilderPlugin/QUICKSTART.md](NameBuilderPlugin/QUICKSTART.md)

## Repository Structure

This is a monorepo containing:

- **[NameBuilderConfigurator](NameBuilderConfigurator/)** – XrmToolBox plugin (visual designer + publisher)
- **[NameBuilderPlugin](NameBuilderPlugin/)** – Dataverse server plugin (runtime engine)
- **[Docs](Docs/)** – Build scripts and developer documentation

## License

See [LICENSE](LICENSE).
