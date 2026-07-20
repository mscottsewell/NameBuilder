/**
 * Data access layer over the Power Platform ToolBox dataverseAPI bridge.
 * All host calls funnel through here so the UI stays host-agnostic and the
 * whole tool can run against the demo service (see demo.ts) outside PPTB.
 */

import type { AttributeInfo, RecordView } from './engine';
import { mapAttributeType } from './engine';
import { fetchPublishedConfig, getConfiguredEntityLogicalNames } from './publish';
import type { PublishedStepInfo } from './publish';

export interface EntityInfo {
  logicalName: string;
  displayName: string;
  entitySetName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  metadataId?: string;
  isCustom?: boolean;
}

export interface SolutionInfo {
  id: string;
  uniqueName: string;
  friendlyName: string;
  isManaged: boolean;
}

export interface SampleRecord {
  id: string;
  label: string;
  raw: Record<string, unknown>;
}

export interface ViewInfo {
  id: string;
  name: string;
  fetchXml: string;
  /** Column logical names shown by the view (linked-entity columns excluded). */
  columns: string[];
  isPersonal: boolean;
}

export interface DataService {
  readonly isDemo: boolean;
  getConnectionName(): Promise<string>;
  listSolutions(): Promise<SolutionInfo[]>;
  /** Solution id of the user's preferred solution (preferredsolution table), or null. */
  getPreferredSolutionId(): Promise<string | null>;
  /** Entity metadataIds contained in a solution (componenttype 1 = Entity). */
  getSolutionEntityIds(solutionId: string): Promise<Set<string>>;
  listEntities(): Promise<EntityInfo[]>;
  getAttributes(entity: EntityInfo): Promise<Map<string, AttributeInfo>>;
  /** System and personal views for a table (system first). */
  listViews(entity: EntityInfo): Promise<ViewInfo[]>;
  getSampleRecords(entity: EntityInfo, search: string, columns: string[]): Promise<SampleRecord[]>;
  /** Records returned by a view's own FetchXML (filters/sorts honored). */
  getViewRecords(entity: EntityInfo, view: ViewInfo): Promise<SampleRecord[]>;
  getRecordView(entity: EntityInfo, recordId: string, attributes: Map<string, AttributeInfo>, wanted: string[]): Promise<{ view: RecordView; currencySymbol: string }>;
  /** Configuration + rank already deployed for this entity, or null if none. */
  getPublishedConfig(entity: EntityInfo): Promise<PublishedStepInfo | null>;
  /** Logical names of every table that already has a NameBuilder step registered. */
  getConfiguredEntityNames(): Promise<Set<string>>;
  copyToClipboard(text: string): Promise<void>;
  notify(type: 'info' | 'success' | 'warning' | 'error', title: string, body?: string): Promise<void>;
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LOOKUP_LOGICALNAME = '@Microsoft.Dynamics.CRM.lookuplogicalname';

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function api(): PptbDataverseAPI {
  const dv = window.dataverseAPI;
  if (!dv) throw new Error('dataverseAPI is not available — is the tool running inside Power Platform ToolBox?');
  return dv;
}

function label(value: unknown): string {
  if (typeof value === 'string') return value;
  const localized = value as { UserLocalizedLabel?: { Label?: string }; LocalizedLabels?: { Label?: string }[] } | null;
  return localized?.UserLocalizedLabel?.Label ?? localized?.LocalizedLabels?.[0]?.Label ?? '';
}

/** Builds the $select column for an attribute (lookups use _x_value). */
export function selectColumnFor(logicalName: string, attr: AttributeInfo | undefined): string {
  return attr?.fieldType === 'lookup' ? `_${logicalName}_value` : logicalName;
}

/**
 * Extracts a ViewInfo from a savedquery/userquery row. Column names come from
 * the layoutxml grid cells (what the view displays), falling back to fetchxml
 * attribute elements; linked-entity columns (dotted aliases) are excluded.
 */
function buildViewInfo(id: string, row: Record<string, unknown>, isPersonal: boolean): ViewInfo | null {
  const fetchXml = typeof row.fetchxml === 'string' ? row.fetchxml : '';
  if (!fetchXml) return null;

  const columns = new Set<string>();
  const layoutXml = typeof row.layoutxml === 'string' ? row.layoutxml : '';
  try {
    if (layoutXml) {
      const doc = new DOMParser().parseFromString(layoutXml, 'application/xml');
      doc.querySelectorAll('cell[name]').forEach((cell) => {
        const name = cell.getAttribute('name');
        if (name && !name.includes('.')) columns.add(name.toLowerCase());
      });
    }
    if (columns.size === 0) {
      const doc = new DOMParser().parseFromString(fetchXml, 'application/xml');
      doc.querySelectorAll('entity > attribute[name]').forEach((attr) => {
        const name = attr.getAttribute('name');
        if (name) columns.add(name.toLowerCase());
      });
    }
  } catch {
    /* unparseable layout — view still usable for records, with no column filter */
  }

  return {
    id,
    name: String(row.name ?? '(unnamed view)'),
    fetchXml,
    columns: [...columns],
    isPersonal,
  };
}

/**
 * Prepares a view's FetchXML for the sample-record picker: caps the result
 * set and guarantees the primary name column is present. Paging attributes
 * are removed since `top` cannot combine with them.
 */
function prepareViewFetchXml(fetchXml: string, primaryNameAttribute: string): string {
  try {
    const doc = new DOMParser().parseFromString(fetchXml, 'application/xml');
    const fetchEl = doc.querySelector('fetch');
    const entityEl = doc.querySelector('fetch > entity');
    if (!fetchEl || !entityEl) return fetchXml;

    fetchEl.removeAttribute('count');
    fetchEl.removeAttribute('page');
    fetchEl.removeAttribute('paging-cookie');
    fetchEl.setAttribute('top', '50');

    const hasAllAttributes = !!entityEl.querySelector(':scope > all-attributes');
    const hasPrimaryName = [...entityEl.querySelectorAll(':scope > attribute')].some(
      (a) => a.getAttribute('name') === primaryNameAttribute
    );
    if (!hasAllAttributes && !hasPrimaryName) {
      const attr = doc.createElement('attribute');
      attr.setAttribute('name', primaryNameAttribute);
      entityEl.insertBefore(attr, entityEl.firstChild);
    }

    return new XMLSerializer().serializeToString(doc);
  } catch {
    return fetchXml;
  }
}

export class PptbDataService implements DataService {
  readonly isDemo = false;

  private entityCache: EntityInfo[] | null = null;
  private attributeCache = new Map<string, Map<string, AttributeInfo>>();
  private referencedEntityCache = new Map<string, { primaryName: string; entitySet: string }>();
  private currencyCache = new Map<string, string>();

  async getConnectionName(): Promise<string> {
    try {
      const conn = await window.toolboxAPI?.connections.getActiveConnection();
      return (conn?.name as string) || (conn?.url as string) || (conn?.environmentUrl as string) || 'Connected';
    } catch {
      return 'Connected';
    }
  }

  async listSolutions(): Promise<SolutionInfo[]> {
    const result = await api().getSolutions(['solutionid', 'uniquename', 'friendlyname', 'ismanaged', 'isvisible']);
    return (result.value ?? [])
      .filter((s) => s.isvisible !== false)
      .map((s) => ({
        id: String(s.solutionid),
        uniqueName: String(s.uniquename ?? ''),
        friendlyName: String(s.friendlyname ?? s.uniquename ?? ''),
        isManaged: s.ismanaged === true,
      }))
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
  }

  async getPreferredSolutionId(): Promise<string | null> {
    try {
      // preferredsolution is user-owned, so the query returns the current
      // user's row; the table doesn't exist on older environments (hence catch).
      const result = await api().queryData('preferredsolutions?$select=_solutionid_value&$top=1');
      const id = result.value?.[0]?.['_solutionid_value'];
      return typeof id === 'string' && id ? id : null;
    } catch {
      return null;
    }
  }

  async getSolutionEntityIds(solutionId: string): Promise<Set<string>> {
    const result = await api().queryData(
      `solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${solutionId} and componenttype eq 1`
    );
    return new Set((result.value ?? []).map((c) => String(c.objectid).toLowerCase()));
  }

  async listEntities(): Promise<EntityInfo[]> {
    if (this.entityCache) return this.entityCache;
    const result = await api().getAllEntitiesMetadata([
      'LogicalName', 'DisplayName', 'EntitySetName', 'PrimaryIdAttribute', 'PrimaryNameAttribute',
      'MetadataId', 'IsCustomEntity', 'IsValidForAdvancedFind',
    ]);
    this.entityCache = (result.value ?? [])
      .filter((e) => e.PrimaryNameAttribute && e.EntitySetName)
      .map((e) => ({
        logicalName: String(e.LogicalName),
        displayName: label(e.DisplayName) || String(e.LogicalName),
        entitySetName: String(e.EntitySetName),
        primaryIdAttribute: String(e.PrimaryIdAttribute),
        primaryNameAttribute: String(e.PrimaryNameAttribute),
        metadataId: e.MetadataId ? String(e.MetadataId).toLowerCase() : undefined,
        isCustom: e.IsCustomEntity === true,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return this.entityCache;
  }

  async getAttributes(entity: EntityInfo): Promise<Map<string, AttributeInfo>> {
    const cached = this.attributeCache.get(entity.logicalName);
    if (cached) return cached;

    const related = await api().getEntityRelatedMetadata(entity.logicalName, 'Attributes', [
      'LogicalName', 'DisplayName', 'AttributeType', 'AttributeOf', 'IsValidForRead', 'IsPrimaryName',
    ]);
    const rows = Array.isArray(related) ? related : related.value ?? [];

    const attributes = new Map<string, AttributeInfo>();
    for (const row of rows) {
      const logicalName = String(row.LogicalName ?? '').toLowerCase();
      if (!logicalName) continue;
      // Skip virtual companions (e.g. *name for lookups) and unreadable attributes.
      if (row.AttributeOf) continue;
      if (row.IsValidForRead === false) continue;
      const attributeType = String(row.AttributeType ?? '');
      attributes.set(logicalName, {
        logicalName,
        displayName: label(row.DisplayName) || logicalName,
        attributeType,
        fieldType: mapAttributeType(attributeType),
        isPrimaryName: row.IsPrimaryName === true,
      });
    }

    // Enrich with subtype-specific metadata; each call is best-effort because
    // these use typed casts that the host may proxy differently.
    await Promise.all([
      this.enrichStringLengths(entity, attributes),
      this.enrichOptionSets(entity, attributes, 'PicklistAttributeMetadata'),
      this.enrichOptionSets(entity, attributes, 'StateAttributeMetadata'),
      this.enrichOptionSets(entity, attributes, 'StatusAttributeMetadata'),
      this.enrichLookupTargets(entity, attributes),
    ]);

    this.attributeCache.set(entity.logicalName, attributes);
    return attributes;
  }

  private async enrichStringLengths(entity: EntityInfo, attributes: Map<string, AttributeInfo>): Promise<void> {
    try {
      const result = await api().queryData(
        `EntityDefinitions(LogicalName='${entity.logicalName}')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=LogicalName,MaxLength`
      );
      for (const row of result.value ?? []) {
        const attr = attributes.get(String(row.LogicalName ?? '').toLowerCase());
        if (attr && typeof row.MaxLength === 'number') attr.maxLength = row.MaxLength;
      }
    } catch {
      /* preview quality degrades gracefully without lengths */
    }
  }

  private async enrichOptionSets(entity: EntityInfo, attributes: Map<string, AttributeInfo>, cast: string): Promise<void> {
    try {
      const result = await api().queryData(
        `EntityDefinitions(LogicalName='${entity.logicalName}')/Attributes/Microsoft.Dynamics.CRM.${cast}?$select=LogicalName&$expand=OptionSet($select=Options)`
      );
      for (const row of result.value ?? []) {
        const attr = attributes.get(String(row.LogicalName ?? '').toLowerCase());
        if (!attr) continue;
        const optionSet = row.OptionSet as { Options?: { Value?: number; Label?: unknown }[] } | undefined;
        if (!optionSet?.Options) continue;
        attr.options = new Map(
          optionSet.Options
            .filter((o) => typeof o.Value === 'number')
            .map((o) => [o.Value as number, label(o.Label) || String(o.Value)])
        );
      }
    } catch {
      /* labels fall back to numeric values in the preview */
    }
  }

  private async enrichLookupTargets(entity: EntityInfo, attributes: Map<string, AttributeInfo>): Promise<void> {
    try {
      const result = await api().queryData(
        `EntityDefinitions(LogicalName='${entity.logicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`
      );
      for (const row of result.value ?? []) {
        const attr = attributes.get(String(row.LogicalName ?? '').toLowerCase());
        if (attr && Array.isArray(row.Targets)) attr.targets = row.Targets.map(String);
      }
    } catch {
      /* lookup name resolution falls back to formatted values */
    }
  }

  async listViews(entity: EntityInfo): Promise<ViewInfo[]> {
    const views: ViewInfo[] = [];
    try {
      const system = await api().queryData(
        `savedqueries?$select=savedqueryid,name,fetchxml,layoutxml` +
          `&$filter=returnedtypecode eq '${entity.logicalName}' and querytype eq 0 and statecode eq 0&$orderby=name`
      );
      for (const row of system.value ?? []) {
        const view = buildViewInfo(String(row.savedqueryid), row, false);
        if (view) views.push(view);
      }
    } catch {
      /* views are an enhancement; the palette falls back to all columns */
    }
    try {
      const personal = await api().queryData(
        `userqueries?$select=userqueryid,name,fetchxml,layoutxml` +
          `&$filter=returnedtypecode eq '${entity.logicalName}'&$orderby=name`
      );
      for (const row of personal.value ?? []) {
        const view = buildViewInfo(String(row.userqueryid), row, true);
        if (view) views.push(view);
      }
    } catch {
      /* personal views may be unreadable; system views still work */
    }
    return views;
  }

  async getViewRecords(entity: EntityInfo, view: ViewInfo): Promise<SampleRecord[]> {
    const fetchXml = prepareViewFetchXml(view.fetchXml, entity.primaryNameAttribute);
    const result = await api().fetchXmlQuery(fetchXml);
    const rows = (result.entities ?? result.value ?? []) as Record<string, unknown>[];
    return rows
      .filter((raw) => raw[entity.primaryIdAttribute] !== undefined)
      .map((raw) => ({
        id: String(raw[entity.primaryIdAttribute]),
        label: String(raw[entity.primaryNameAttribute] ?? '(no name)'),
        raw,
      }));
  }

  async getSampleRecords(entity: EntityInfo, search: string, columns: string[]): Promise<SampleRecord[]> {
    const selects = new Set<string>([entity.primaryIdAttribute, entity.primaryNameAttribute, ...columns]);
    const filter = search.trim()
      ? `&$filter=contains(${entity.primaryNameAttribute},'${escapeODataString(search.trim())}')`
      : '';
    const result = await api().queryData(
      `${entity.entitySetName}?$select=${[...selects].join(',')}&$orderby=modifiedon desc&$top=10${filter}`
    );
    return (result.value ?? []).map((raw) => ({
      id: String(raw[entity.primaryIdAttribute]),
      label: String(raw[entity.primaryNameAttribute] ?? '(no name)'),
      raw,
    }));
  }

  async getRecordView(
    entity: EntityInfo,
    recordId: string,
    attributes: Map<string, AttributeInfo>,
    wanted: string[]
  ): Promise<{ view: RecordView; currencySymbol: string }> {
    const selects = new Set<string>();
    let hasCurrency = false;
    for (const name of wanted) {
      const attr = attributes.get(name.toLowerCase());
      if (!attr) continue;
      selects.add(selectColumnFor(attr.logicalName, attr));
      if (attr.fieldType === 'currency') hasCurrency = true;
    }
    if (hasCurrency && attributes.has('transactioncurrencyid')) {
      selects.add('_transactioncurrencyid_value');
    }
    if (selects.size === 0) selects.add(entity.primaryIdAttribute);

    const result = await api().queryData(
      `${entity.entitySetName}?$select=${[...selects].join(',')}&$filter=${entity.primaryIdAttribute} eq ${recordId}`
    );
    const raw = result.value?.[0] ?? {};

    const view: RecordView = {};
    for (const name of wanted) {
      const attr = attributes.get(name.toLowerCase());
      if (!attr) continue;
      if (attr.fieldType === 'lookup') {
        const key = `_${attr.logicalName}_value`;
        const id = raw[key];
        if (id === null || id === undefined) continue;
        view[attr.logicalName] = {
          raw: id,
          formatted: raw[key + FORMATTED] as string | undefined,
          lookupName: raw[key + FORMATTED] as string | undefined,
          lookupLogicalName: raw[key + LOOKUP_LOGICALNAME] as string | undefined,
        };
      } else {
        const value = raw[attr.logicalName];
        if (value === null || value === undefined) continue;
        view[attr.logicalName] = {
          raw: value,
          formatted: raw[attr.logicalName + FORMATTED] as string | undefined,
        };
      }
    }

    // The host may not request OData annotations; resolve missing lookup
    // display names with targeted retrieves (same as the plugin does server-side).
    await this.resolveLookupNames(view, attributes);

    let currencySymbol = '';
    const currencyId = raw['_transactioncurrencyid_value'];
    if (typeof currencyId === 'string') {
      currencySymbol = await this.getCurrencySymbol(currencyId);
    }

    return { view, currencySymbol };
  }

  private async resolveLookupNames(view: RecordView, attributes: Map<string, AttributeInfo>): Promise<void> {
    const pending = Object.entries(view).filter(([name, rv]) => {
      const attr = attributes.get(name);
      return attr?.fieldType === 'lookup' && !rv.lookupName && rv.raw;
    });

    await Promise.all(
      pending.map(async ([name, rv]) => {
        const attr = attributes.get(name);
        const target = rv.lookupLogicalName || attr?.targets?.[0];
        if (!target) return;
        try {
          const ref = await this.getReferencedEntityInfo(target);
          const result = await api().queryData(
            `${ref.entitySet}(${String(rv.raw)})?$select=${ref.primaryName}`
          );
          const record = (result as unknown as Record<string, unknown>).value
            ? (result.value as Record<string, unknown>[])[0]
            : (result as unknown as Record<string, unknown>);
          const nameValue = record?.[ref.primaryName];
          if (typeof nameValue === 'string') rv.lookupName = nameValue;
        } catch {
          /* leave unresolved; preview shows empty for this lookup */
        }
      })
    );
  }

  private async getReferencedEntityInfo(logicalName: string): Promise<{ primaryName: string; entitySet: string }> {
    const cached = this.referencedEntityCache.get(logicalName);
    if (cached) return cached;
    const meta = await api().getEntityMetadata(logicalName, true, ['PrimaryNameAttribute', 'EntitySetName']);
    const info = {
      primaryName: String((meta as Record<string, unknown>).PrimaryNameAttribute ?? 'name'),
      entitySet: String((meta as Record<string, unknown>).EntitySetName ?? logicalName + 's'),
    };
    this.referencedEntityCache.set(logicalName, info);
    return info;
  }

  private async getCurrencySymbol(currencyId: string): Promise<string> {
    const cached = this.currencyCache.get(currencyId);
    if (cached !== undefined) return cached;
    try {
      const result = await api().queryData(
        `transactioncurrencies?$select=currencysymbol&$filter=transactioncurrencyid eq ${currencyId}`
      );
      const symbol = String(result.value?.[0]?.currencysymbol ?? '');
      this.currencyCache.set(currencyId, symbol);
      return symbol;
    } catch {
      this.currencyCache.set(currencyId, '');
      return '';
    }
  }

  async getPublishedConfig(entity: EntityInfo): Promise<PublishedStepInfo | null> {
    return fetchPublishedConfig(entity.logicalName);
  }

  async getConfiguredEntityNames(): Promise<Set<string>> {
    return getConfiguredEntityLogicalNames();
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await window.toolboxAPI?.utils.copyToClipboard(text);
    } catch {
      await navigator.clipboard.writeText(text);
    }
  }

  async notify(type: 'info' | 'success' | 'warning' | 'error', title: string, body?: string): Promise<void> {
    try {
      await window.toolboxAPI?.utils.showNotification({ title, body: body ?? '', message: body ?? title, type });
    } catch {
      /* the in-app toast (ui/toast.ts) is the fallback channel */
    }
  }
}
