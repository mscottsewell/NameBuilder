/**
 * Live-preview engine: a client-side port of the plugin runtime
 * (NameBuilder.cs, FieldValueResolver.cs, ConditionEvaluator.cs) so the
 * designer shows exactly what the server plugin will write. Any behavior
 * change here must match the C# plugin, not the other way around.
 */

import type { FieldCondition, FieldConfig, FieldType, NameBuilderConfig } from './model';
import { formatDateWithCasing, formatNumberWithScaling } from './formatting';

/** Normalized view of one attribute value from a sample record. */
export interface RecordValue {
  /** Raw OData value: string, number, boolean, or ISO date string. */
  raw: unknown;
  /** Formatted-value annotation when the Web API supplied one. */
  formatted?: string;
  /** Display name of the referenced record (lookups). */
  lookupName?: string;
  /** Logical name of the referenced table (lookups). */
  lookupLogicalName?: string;
}

/** Sample record normalized to attribute logical name → value. */
export type RecordView = Record<string, RecordValue>;

export interface AttributeInfo {
  logicalName: string;
  displayName: string;
  /** Dataverse AttributeType (e.g. 'String', 'Lookup', 'Picklist'). */
  attributeType: string;
  /** Plugin field type, or null when the attribute can't be used as a name block. */
  fieldType: FieldType | null;
  /** Option value → label, for optionset-like attributes. */
  options?: Map<number, string>;
  /** MaxLength for string attributes (drives default config maxLength). */
  maxLength?: number;
  /** Lookup target tables. */
  targets?: string[];
  isPrimaryName?: boolean;
}

export interface PreviewContext {
  attributes: Map<string, AttributeInfo>;
  /** Currency symbol of the sample record's transaction currency ('' when unknown). */
  currencySymbol: string;
}

export interface PreviewPart {
  field: string;
  /** Final text contributed to the name (with prefix/suffix). */
  text: string;
  /** False when an includeIf condition excluded the block. */
  included: boolean;
  /** Human explanation when the value is empty or substituted. */
  note?: string;
}

export interface PreviewResult {
  name: string;
  truncated: boolean;
  parts: PreviewPart[];
}

/** Maps a Dataverse attribute type to the plugin's field type vocabulary. */
export function mapAttributeType(attributeType: string): FieldType | null {
  switch (attributeType) {
    case 'String':
    case 'Memo':
      return 'string';
    case 'DateTime':
      return 'date';
    case 'Integer':
    case 'BigInt':
    case 'Decimal':
    case 'Double':
      return 'number';
    case 'Money':
      return 'currency';
    case 'Lookup':
    case 'Customer':
    case 'Owner':
      return 'lookup';
    case 'Picklist':
    case 'State':
    case 'Status':
      return 'optionset';
    default:
      return null;
  }
}

/**
 * Port of PatternParser.InferFieldType: prefer metadata, fall back to the
 * plugin's naming-convention heuristics.
 */
export function inferFieldType(fieldName: string, attributes: Map<string, AttributeInfo>): FieldType {
  const meta = attributes.get(fieldName.toLowerCase());
  if (meta?.fieldType) return meta.fieldType;

  const lower = fieldName.toLowerCase();
  if (lower.endsWith('on') || lower.endsWith('date') || lower.includes('date')) return 'date';
  if (lower.endsWith('id') && lower !== 'id') return 'lookup';
  if (lower.endsWith('code') || lower.endsWith('status') || lower.endsWith('state')) return 'optionset';
  return 'string';
}

/** Port of ConditionEvaluator.ConvertToString for Web API-shaped values. */
function conditionValueToString(rv: RecordValue | undefined, attr: AttributeInfo | undefined): string | null {
  if (!rv || rv.raw === null || rv.raw === undefined) return null;
  const raw = rv.raw;

  if (attr?.fieldType === 'lookup' || rv.lookupName !== undefined || rv.lookupLogicalName !== undefined) {
    return rv.lookupName || rv.formatted || String(raw);
  }
  if (attr?.fieldType === 'optionset') {
    return String(raw);
  }
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  if (attr?.fieldType === 'date' || attr?.attributeType === 'DateTime') {
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? String(raw) : formatDateWithCasing(d, 'yyyy-MM-dd');
  }
  return String(raw);
}

function compareNumeric(a: string | null, b: string | undefined, op: (x: number, y: number) => boolean): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  return op(x, y);
}

/** Port of ConditionEvaluator.EvaluateCondition. */
export function evaluateCondition(record: RecordView, cond: FieldCondition | undefined, ctx: PreviewContext): boolean {
  if (!cond) return true;

  if (cond.anyOf?.length) return cond.anyOf.some((c) => evaluateCondition(record, c, ctx));
  if (cond.allOf?.length) return cond.allOf.every((c) => evaluateCondition(record, c, ctx));

  if (!cond.field?.trim() || !cond.operator?.trim()) return true;

  const attr = ctx.attributes.get(cond.field.toLowerCase());
  const fieldValue = conditionValueToString(record[cond.field.toLowerCase()], attr);
  const expected = cond.value;
  const op = cond.operator.toLowerCase();
  const eq = (a: string | null, b: string | undefined) =>
    (a ?? '').toLowerCase() === (b ?? '').toLowerCase() && a !== null;

  switch (op) {
    case 'equals':
    case 'eq':
      return eq(fieldValue, expected);
    case 'notequals':
    case 'ne':
      return !eq(fieldValue, expected);
    case 'contains':
      return fieldValue !== null && fieldValue.toLowerCase().includes((expected ?? '').toLowerCase());
    case 'notcontains':
      return fieldValue === null || !fieldValue.toLowerCase().includes((expected ?? '').toLowerCase());
    case 'in': {
      if (!expected?.trim()) return false;
      return expected.split(',').map((v) => v.trim()).filter(Boolean)
        .some((v) => eq(fieldValue, v));
    }
    case 'notin': {
      if (!expected?.trim()) return true;
      return !expected.split(',').map((v) => v.trim()).filter(Boolean)
        .some((v) => eq(fieldValue, v));
    }
    case 'greaterthan':
    case 'gt':
      return compareNumeric(fieldValue, expected, (a, b) => a > b);
    case 'lessthan':
    case 'lt':
      return compareNumeric(fieldValue, expected, (a, b) => a < b);
    case 'greaterthanorequal':
    case 'gte':
      return compareNumeric(fieldValue, expected, (a, b) => a >= b);
    case 'lessthanorequal':
    case 'lte':
      return compareNumeric(fieldValue, expected, (a, b) => a <= b);
    case 'isempty':
      return fieldValue === null || !fieldValue.trim();
    case 'isnotempty':
      return fieldValue !== null && !!fieldValue.trim();
    default:
      // Unknown operators default to true, matching the plugin's defensive behavior.
      return true;
  }
}

function resolveRawValue(rv: RecordValue, type: FieldType, cfg: FieldConfig, ctx: PreviewContext, attr: AttributeInfo | undefined): string {
  const raw = rv.raw;
  if (raw === null || raw === undefined) return '';

  switch (type) {
    case 'string':
      return String(raw);

    case 'lookup':
      return rv.lookupName || rv.formatted || '';

    case 'date':
    case 'datetime': {
      let d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) return '';
      if (cfg.timezoneOffsetHours) {
        d = new Date(d.getTime() + cfg.timezoneOffsetHours * 3_600_000);
      }
      return formatDateWithCasing(d, cfg.format);
    }

    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) return String(raw);
      return formatNumberWithScaling(n, cfg.format, '#,##0.##');
    }

    case 'currency': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) return String(raw);
      const amount = formatNumberWithScaling(n, cfg.format, '#,##0.00');
      return ctx.currencySymbol ? ctx.currencySymbol + amount : amount;
    }

    case 'optionset': {
      const numeric = typeof raw === 'number' ? raw : Number(raw);
      return rv.formatted || attr?.options?.get(numeric) || String(raw);
    }

    default:
      return '';
  }
}

/** Port of FieldValueResolver.ResolvePatternFieldValue (max alternate depth 5). */
function resolveField(record: RecordView, cfg: FieldConfig, ctx: PreviewContext, depth: number): { text: string; included: boolean; note?: string } {
  if (cfg.includeIf && !evaluateCondition(record, cfg.includeIf, ctx)) {
    return { text: '', included: false, note: 'condition not met' };
  }

  const logical = cfg.field.trim().toLowerCase();
  const attr = ctx.attributes.get(logical);
  const type: FieldType = cfg.type ?? inferFieldType(cfg.field, ctx.attributes);
  const rv = record[logical];

  let value = '';
  let note: string | undefined;

  if (rv !== undefined && rv.raw !== null && rv.raw !== undefined) {
    value = resolveRawValue(rv, type, cfg, ctx, attr);
  }

  if (!value) {
    if (cfg.alternateField?.field && depth < 5) {
      const alt = resolveField(record, cfg.alternateField, ctx, depth + 1);
      if (alt.included && alt.text) {
        return { text: alt.text, included: true, note: `alternate: ${cfg.alternateField.field}` };
      }
    }
    if (cfg.default) {
      value = cfg.default;
      note = 'default value';
    }
  }

  if (!value) {
    return { text: '', included: true, note: note ?? 'empty' };
  }

  if (cfg.maxLength !== undefined && cfg.maxLength !== null && value.length > cfg.maxLength) {
    const indicator = cfg.truncationIndicator ?? '...';
    if (cfg.maxLength > indicator.length) {
      value = value.slice(0, cfg.maxLength - indicator.length) + indicator;
      note = note ? `${note}, truncated` : 'truncated';
    }
  }

  // Prefix/suffix apply only when a non-empty value was produced.
  const text = (cfg.prefix ?? '') + value + (cfg.suffix ?? '');
  return { text, included: true, note };
}

/** Builds the full name preview, mirroring NameBuilderPlugin.BuildNameValue. */
export function buildPreview(config: NameBuilderConfig, record: RecordView, ctx: PreviewContext): PreviewResult {
  const parts: PreviewPart[] = [];
  let assembled = '';

  for (const cfg of config.fields) {
    if (!cfg.field?.trim()) continue;
    const resolved = resolveField(record, cfg, ctx, 0);
    parts.push({ field: cfg.field, text: resolved.text, included: resolved.included, note: resolved.note });
    assembled += resolved.text;
  }

  let truncated = false;
  if (config.maxLength !== undefined && config.maxLength !== null && config.maxLength > 3 && assembled.length > config.maxLength) {
    assembled = assembled.slice(0, config.maxLength - 3) + '...';
    truncated = true;
  }

  return { name: assembled, truncated, parts };
}
