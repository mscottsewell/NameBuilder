/**
 * Demo data service used when the tool runs outside Power Platform ToolBox
 * (plain browser / dev server). Lets the designer be exercised end-to-end
 * with realistic sample data; publishing is disabled in this mode.
 */

import type { AttributeInfo, RecordView } from './engine';
import type { DataService, EntityInfo, SampleRecord, SolutionInfo, ViewInfo } from './dataverse';
import { mapAttributeType } from './engine';
import { selectColumnFor } from './dataverse';

interface DemoAttr {
  name: string;
  display: string;
  type: string;
  options?: [number, string][];
  maxLength?: number;
  targets?: string[];
  primary?: boolean;
}

const DEMO_ENTITIES: { entity: EntityInfo; attrs: DemoAttr[]; records: Record<string, unknown>[] }[] = [
  {
    entity: {
      logicalName: 'incident', displayName: 'Case', entitySetName: 'incidents',
      primaryIdAttribute: 'incidentid', primaryNameAttribute: 'title',
    },
    attrs: [
      { name: 'title', display: 'Case Title', type: 'String', maxLength: 200, primary: true },
      { name: 'ticketnumber', display: 'Case Number', type: 'String', maxLength: 100 },
      { name: 'customerid', display: 'Customer', type: 'Customer', targets: ['account', 'contact'] },
      { name: 'createdon', display: 'Created On', type: 'DateTime' },
      { name: 'prioritycode', display: 'Priority', type: 'Picklist', options: [[1, 'High'], [2, 'Normal'], [3, 'Low']] },
      { name: 'statuscode', display: 'Status Reason', type: 'Status', options: [[1, 'In Progress'], [5, 'Resolved']] },
      { name: 'ownerid', display: 'Owner', type: 'Owner', targets: ['systemuser'] },
      { name: 'description', display: 'Description', type: 'Memo', maxLength: 2000 },
    ],
    records: [
      {
        incidentid: '11111111-1111-1111-1111-111111111111',
        title: 'Contoso Ltd | 2026.01.02 CAS-01213 | High',
        ticketnumber: 'CAS-01213',
        customerid: { name: 'Contoso Ltd' },
        createdon: '2026-01-02T15:04:00Z',
        prioritycode: 1,
        statuscode: 1,
        ownerid: { name: 'Durden, Tyler' },
        description: 'Customer reported an outage affecting the storefront checkout flow.',
      },
      {
        incidentid: '22222222-2222-2222-2222-222222222222',
        title: 'Fabrikam Inc | 2026.03.15 CAS-01388 | Low',
        ticketnumber: 'CAS-01388',
        customerid: { name: 'Fabrikam Inc' },
        createdon: '2026-03-15T09:30:00Z',
        prioritycode: 3,
        statuscode: 5,
        ownerid: { name: 'Smith, John' },
        description: 'Question about invoice line formatting.',
      },
    ],
  },
  {
    entity: {
      logicalName: 'opportunity', displayName: 'Opportunity', entitySetName: 'opportunities',
      primaryIdAttribute: 'opportunityid', primaryNameAttribute: 'name',
    },
    attrs: [
      { name: 'name', display: 'Topic', type: 'String', maxLength: 300, primary: true },
      { name: 'customerid', display: 'Potential Customer', type: 'Customer', targets: ['account', 'contact'] },
      { name: 'estimatedvalue', display: 'Est. Revenue', type: 'Money' },
      { name: 'closeprobability', display: 'Probability', type: 'Integer' },
      { name: 'estimatedclosedate', display: 'Est. Close Date', type: 'DateTime' },
      { name: 'ownerid', display: 'Owner', type: 'Owner', targets: ['systemuser'] },
      { name: 'statuscode', display: 'Status Reason', type: 'Status', options: [[1, 'In Progress'], [3, 'Won']] },
    ],
    records: [
      {
        opportunityid: '33333333-3333-3333-3333-333333333333',
        name: 'Contoso Ltd - $2.50M - 75% - Durden, Tyler',
        customerid: { name: 'Contoso Ltd' },
        estimatedvalue: 2_500_000,
        closeprobability: 75,
        estimatedclosedate: '2026-09-30T00:00:00Z',
        ownerid: { name: 'Durden, Tyler' },
        statuscode: 1,
        transactioncurrencysymbol: '$',
      },
      {
        opportunityid: '44444444-4444-4444-4444-444444444444',
        name: 'Northwind - $80.0K - 30% - Smith, John',
        customerid: { name: 'Northwind Traders' },
        estimatedvalue: 80_000,
        closeprobability: 30,
        estimatedclosedate: '2026-11-15T00:00:00Z',
        ownerid: { name: 'Smith, John' },
        statuscode: 1,
        transactioncurrencysymbol: '$',
      },
    ],
  },
];

export class DemoDataService implements DataService {
  readonly isDemo = true;

  async getConnectionName(): Promise<string> {
    return 'Demo environment (not connected)';
  }

  async listSolutions(): Promise<SolutionInfo[]> {
    return [
      { id: 'demo-solution', uniqueName: 'demosolution', friendlyName: 'Demo Solution', isManaged: false },
    ];
  }

  async getSolutionEntityIds(): Promise<Set<string>> {
    return new Set(DEMO_ENTITIES.map((d) => d.entity.logicalName));
  }

  async listEntities(): Promise<EntityInfo[]> {
    return DEMO_ENTITIES.map((d) => ({ ...d.entity, metadataId: d.entity.logicalName }));
  }

  async getAttributes(entity: EntityInfo): Promise<Map<string, AttributeInfo>> {
    const demo = DEMO_ENTITIES.find((d) => d.entity.logicalName === entity.logicalName);
    const map = new Map<string, AttributeInfo>();
    for (const a of demo?.attrs ?? []) {
      map.set(a.name, {
        logicalName: a.name,
        displayName: a.display,
        attributeType: a.type,
        fieldType: mapAttributeType(a.type),
        options: a.options ? new Map(a.options) : undefined,
        maxLength: a.maxLength,
        targets: a.targets,
        isPrimaryName: a.primary,
      });
    }
    return map;
  }

  async listViews(entity: EntityInfo): Promise<ViewInfo[]> {
    if (entity.logicalName === 'incident') {
      return [
        { id: 'demo-view-1', name: 'Active Cases', fetchXml: '<fetch/>', columns: ['title', 'ticketnumber', 'customerid', 'prioritycode'], isPersonal: false },
        { id: 'demo-view-2', name: 'My Cases (personal)', fetchXml: '<fetch/>', columns: ['title', 'createdon', 'ownerid'], isPersonal: true },
      ];
    }
    return [
      { id: 'demo-view-3', name: 'Open Opportunities', fetchXml: '<fetch/>', columns: ['name', 'customerid', 'estimatedvalue', 'closeprobability'], isPersonal: false },
    ];
  }

  async getViewRecords(entity: EntityInfo, view: ViewInfo): Promise<SampleRecord[]> {
    // Demo views don't filter rows — they exercise the column filter + picker UI.
    void view;
    return this.getSampleRecords(entity, '');
  }

  async getSampleRecords(entity: EntityInfo, search: string): Promise<SampleRecord[]> {
    const demo = DEMO_ENTITIES.find((d) => d.entity.logicalName === entity.logicalName);
    const lower = search.trim().toLowerCase();
    return (demo?.records ?? [])
      .filter((r) => !lower || String(r[entity.primaryNameAttribute] ?? '').toLowerCase().includes(lower))
      .map((r) => ({
        id: String(r[entity.primaryIdAttribute]),
        label: String(r[entity.primaryNameAttribute] ?? '(no name)'),
        raw: r,
      }));
  }

  async getRecordView(
    entity: EntityInfo,
    recordId: string,
    attributes: Map<string, AttributeInfo>,
    wanted: string[]
  ): Promise<{ view: RecordView; currencySymbol: string }> {
    const demo = DEMO_ENTITIES.find((d) => d.entity.logicalName === entity.logicalName);
    const raw = demo?.records.find((r) => String(r[entity.primaryIdAttribute]) === recordId) ?? {};
    const view: RecordView = {};
    for (const name of wanted) {
      const attr = attributes.get(name.toLowerCase());
      if (!attr) continue;
      const value = raw[attr.logicalName];
      if (value === null || value === undefined) continue;
      if (attr.fieldType === 'lookup') {
        const lookup = value as { name?: string };
        view[attr.logicalName] = { raw: recordId, lookupName: lookup.name };
      } else if (attr.fieldType === 'optionset') {
        const numeric = Number(value);
        view[attr.logicalName] = { raw: numeric, formatted: attr.options?.get(numeric) };
      } else {
        view[attr.logicalName] = { raw: value };
      }
    }
    // selectColumnFor is exercised here only to keep parity with the live service shape.
    void selectColumnFor;
    return { view, currencySymbol: String(raw['transactioncurrencysymbol'] ?? '') };
  }

  async getPublishedConfig(): Promise<string | null> {
    // No server in demo mode; the designer always starts from a blank pattern.
    return null;
  }

  async getConfiguredEntityNames(): Promise<Set<string>> {
    // Demonstrates the Configured/Unconfigured grouping without a server.
    return new Set(['incident']);
  }

  async copyToClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }

  async notify(): Promise<void> {
    /* the in-app toast handles demo-mode notifications */
  }
}
