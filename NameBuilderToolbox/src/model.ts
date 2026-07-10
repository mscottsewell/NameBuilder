/**
 * Configuration model. This mirrors the JSON schema consumed by the
 * NameBuilder Dataverse plugin (see NameBuilderPlugin/PluginConfiguration.cs) —
 * the JSON produced here is written verbatim into the plugin step's unsecure
 * configuration, so field names and optionality must stay in sync with the
 * plugin's DataContract model.
 */

export type FieldType = 'string' | 'lookup' | 'date' | 'datetime' | 'number' | 'currency' | 'optionset';

export type ConditionOperator =
  | 'equals' | 'notequals'
  | 'contains' | 'notcontains'
  | 'in' | 'notin'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'isempty' | 'isnotempty';

export interface FieldCondition {
  field?: string;
  operator?: ConditionOperator | string;
  value?: string;
  anyOf?: FieldCondition[];
  allOf?: FieldCondition[];
}

export interface FieldConfig {
  field: string;
  type?: FieldType;
  format?: string;
  maxLength?: number;
  truncationIndicator?: string;
  default?: string;
  alternateField?: FieldConfig;
  prefix?: string;
  suffix?: string;
  includeIf?: FieldCondition;
  timezoneOffsetHours?: number;
}

export interface NameBuilderConfig {
  entity?: string;
  targetField: string;
  fields: FieldConfig[];
  maxLength?: number;
  enableTracing?: boolean;
}

export const CONDITION_OPERATORS: { value: ConditionOperator; label: string; needsValue: boolean }[] = [
  { value: 'equals', label: 'equals', needsValue: true },
  { value: 'notequals', label: 'does not equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'notcontains', label: 'does not contain', needsValue: true },
  { value: 'in', label: 'is one of (comma-separated)', needsValue: true },
  { value: 'notin', label: 'is not one of (comma-separated)', needsValue: true },
  { value: 'gt', label: 'is greater than', needsValue: true },
  { value: 'gte', label: 'is greater than or equal', needsValue: true },
  { value: 'lt', label: 'is less than', needsValue: true },
  { value: 'lte', label: 'is less than or equal', needsValue: true },
  { value: 'isempty', label: 'is empty', needsValue: false },
  { value: 'isnotempty', label: 'is not empty', needsValue: false },
];

export function createEmptyConfig(): NameBuilderConfig {
  return { targetField: 'name', fields: [] };
}

/**
 * Reusable defaults applied to newly added blocks and propagated to existing
 * blocks that still use the previous default value. Persisted per tool.
 * Mirrors the XrmToolBox configurator's "Default Field Properties".
 */
export interface FieldDefaults {
  /** Separator prepended to new blocks after the first. */
  prefix: string;
  suffix: string;
  dateFormat: string;
  numberFormat: string;
  timezoneOffsetHours: number;
}

export function defaultFieldDefaults(): FieldDefaults {
  return { prefix: ' - ', suffix: '', dateFormat: 'yyyy-MM-dd', numberFormat: '', timezoneOffsetHours: 0 };
}

/**
 * The solution/table/configuration a user was last working on for a given
 * connection, so a reload can resume exactly where they left off. Persisted
 * per tool, keyed by connection name.
 */
export interface SessionState {
  solutionId: string | null;
  entityLogicalName: string | null;
  /** In-progress configuration at the time of the last save — may include unpublished edits. */
  config: NameBuilderConfig | null;
  /** Selected view (savedquery/userquery id) used for the attribute filter and record picker. */
  viewId?: string | null;
  /** Default solution (unique name) that publish registers components into. */
  publishSolution?: string | null;
  /** True once the user has explicitly chosen a Plugin Solution; until then it follows the Table filter's solution. */
  publishSolutionOverridden?: boolean;
}

/** Deep-clone a config (used for undo-safe edits and import). */
export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneCondition(cond: FieldCondition | undefined): FieldCondition | undefined {
  if (!cond) return undefined;
  const out: FieldCondition = {};
  if (cond.anyOf?.length) {
    const children = cond.anyOf.map(pruneCondition).filter((c): c is FieldCondition => !!c);
    if (children.length) out.anyOf = children;
  } else if (cond.allOf?.length) {
    const children = cond.allOf.map(pruneCondition).filter((c): c is FieldCondition => !!c);
    if (children.length) out.allOf = children;
  } else {
    if (cond.field?.trim()) out.field = cond.field.trim();
    if (cond.operator?.trim()) out.operator = cond.operator.trim();
    if (cond.value !== undefined && cond.value !== '') out.value = cond.value;
  }
  return Object.keys(out).length ? out : undefined;
}

function pruneField(field: FieldConfig): FieldConfig {
  const out: FieldConfig = { field: field.field.trim() };
  if (field.type) out.type = field.type;
  if (field.format?.trim()) out.format = field.format.trim();
  if (field.maxLength !== undefined && field.maxLength !== null && !Number.isNaN(field.maxLength)) out.maxLength = field.maxLength;
  if (field.truncationIndicator && field.truncationIndicator !== '...') out.truncationIndicator = field.truncationIndicator;
  if (field.default !== undefined && field.default !== '') out.default = field.default;
  if (field.prefix !== undefined && field.prefix !== '') out.prefix = field.prefix;
  if (field.suffix !== undefined && field.suffix !== '') out.suffix = field.suffix;
  if (field.timezoneOffsetHours !== undefined && field.timezoneOffsetHours !== null && !Number.isNaN(field.timezoneOffsetHours) && field.timezoneOffsetHours !== 0) {
    out.timezoneOffsetHours = field.timezoneOffsetHours;
  }
  const cond = pruneCondition(field.includeIf);
  if (cond) out.includeIf = cond;
  if (field.alternateField?.field?.trim()) out.alternateField = pruneField(field.alternateField);
  return out;
}

/**
 * Produces the exact JSON payload stored as the plugin step's unsecure
 * configuration: empty/default values omitted, stable property order.
 */
export function serializeConfig(config: NameBuilderConfig, pretty = true): string {
  const clean: Record<string, unknown> = {};
  if (config.entity) clean.entity = config.entity;
  clean.targetField = config.targetField || 'name';
  clean.fields = config.fields.filter((f) => f.field?.trim()).map(pruneField);
  if (config.maxLength !== undefined && config.maxLength !== null && !Number.isNaN(config.maxLength)) clean.maxLength = config.maxLength;
  if (config.enableTracing) clean.enableTracing = true;
  return JSON.stringify(clean, null, pretty ? 2 : undefined);
}

export function parseConfig(json: string): NameBuilderConfig {
  const raw = JSON.parse(json) as Partial<NameBuilderConfig>;
  if (!raw || typeof raw !== 'object') throw new Error('Configuration must be a JSON object.');
  if (!Array.isArray(raw.fields)) throw new Error("Configuration must contain a 'fields' array.");
  for (const f of raw.fields) {
    if (!f || typeof f.field !== 'string' || !f.field.trim()) {
      throw new Error("Every entry in 'fields' must have a non-empty 'field' property.");
    }
  }
  return {
    entity: typeof raw.entity === 'string' ? raw.entity : undefined,
    targetField: typeof raw.targetField === 'string' && raw.targetField.trim() ? raw.targetField.trim() : 'name',
    fields: raw.fields as FieldConfig[],
    maxLength: typeof raw.maxLength === 'number' ? raw.maxLength : undefined,
    enableTracing: raw.enableTracing === true ? true : undefined,
  };
}

function collectConditionAttributes(cond: FieldCondition | undefined, into: Set<string>): void {
  if (!cond) return;
  if (cond.field?.trim()) into.add(cond.field.trim().toLowerCase());
  cond.anyOf?.forEach((c) => collectConditionAttributes(c, into));
  cond.allOf?.forEach((c) => collectConditionAttributes(c, into));
}

function collectFieldAttributes(field: FieldConfig | undefined, into: Set<string>, depth = 0): void {
  if (!field || depth > 5) return;
  if (field.field?.trim()) into.add(field.field.trim().toLowerCase());
  collectConditionAttributes(field.includeIf, into);
  collectFieldAttributes(field.alternateField, into, depth + 1);
}

/**
 * All attribute logical names referenced by the configuration (fields,
 * alternate chains, and condition fields). Used for the plugin step's
 * filtering attributes and the Update step's PreImage attribute list —
 * mirrors PluginConfiguration.GetAllFieldNames() in the plugin.
 */
export function collectReferencedAttributes(config: NameBuilderConfig): string[] {
  const names = new Set<string>();
  config.fields.forEach((f) => collectFieldAttributes(f, names));
  return [...names].sort();
}
