/**
 * Application state with a small topic-based pub/sub. Panels subscribe to the
 * topics they render from; text inputs mutate state silently and emit only
 * 'preview' so typing never rebuilds the control that has focus.
 */

import type { AttributeInfo, RecordView } from './engine';
import type { DataService, EntityInfo, SampleRecord, SolutionInfo, ViewInfo } from './dataverse';
import type { FieldDefaults, NameBuilderConfig, SessionState } from './model';
import { createEmptyConfig, defaultFieldDefaults } from './model';

export type Topic = 'entities' | 'entity' | 'attributes' | 'views' | 'config' | 'records' | 'preview' | 'busy';

export interface AppState {
  service: DataService;
  connectionName: string;

  solutions: SolutionInfo[];
  solutionFilterId: string | null;
  solutionEntityIds: Set<string> | null;
  entitySearch: string;
  entities: EntityInfo[];
  entitiesLoaded: boolean;

  selectedEntity: EntityInfo | null;
  attributes: Map<string, AttributeInfo>;
  attributeSearch: string;

  /** Views for the selected table; the chosen view scopes the column palette and record picker. */
  views: ViewInfo[];
  selectedViewId: string | null;
  /** Lowercased column names of the selected view, or null (no view = all columns). */
  viewColumns: Set<string> | null;

  /** Default solution (unique name) that publish registers components into (persisted per connection). */
  publishSolutionUniqueName: string | null;
  /** True once the user has explicitly chosen a Plugin Solution; until then it follows the Table filter's solution. */
  publishSolutionOverridden: boolean;

  config: NameBuilderConfig;
  /** Index of the block whose editor is expanded, or null. */
  expandedBlock: number | null;

  /** Reusable defaults for new blocks (persisted). */
  fieldDefaults: FieldDefaults;
  /** Auto-load a deployed configuration when an entity is selected (persisted). */
  autoLoadPublished: boolean;
  /** Last solution/table/configuration per connection (persisted). */
  sessionByConnection: Record<string, SessionState>;

  sampleRecords: SampleRecord[];
  recordSearch: string;
  selectedRecordId: string | null;
  recordView: RecordView;
  currencySymbol: string;

  busyMessage: string | null;
}

type Listener = () => void;

export class Store {
  readonly state: AppState;
  private listeners = new Map<Topic, Set<Listener>>();

  constructor(service: DataService) {
    this.state = {
      service,
      connectionName: '',
      solutions: [],
      solutionFilterId: null,
      solutionEntityIds: null,
      entitySearch: '',
      entities: [],
      entitiesLoaded: false,
      selectedEntity: null,
      attributes: new Map(),
      attributeSearch: '',
      views: [],
      selectedViewId: null,
      viewColumns: null,
      publishSolutionUniqueName: null,
      publishSolutionOverridden: false,
      config: createEmptyConfig(),
      expandedBlock: null,
      fieldDefaults: defaultFieldDefaults(),
      autoLoadPublished: true,
      sessionByConnection: {},
      sampleRecords: [],
      recordSearch: '',
      selectedRecordId: null,
      recordView: {},
      currencySymbol: '',
      busyMessage: null,
    };
  }

  on(topic: Topic, listener: Listener): void {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic)!.add(listener);
  }

  /** Removes a listener previously registered with {@link on}. */
  off(topic: Topic, listener: Listener): void {
    this.listeners.get(topic)?.delete(listener);
  }

  emit(...topics: Topic[]): void {
    for (const topic of topics) {
      this.listeners.get(topic)?.forEach((fn) => fn());
    }
  }

  setBusy(message: string | null): void {
    this.state.busyMessage = message;
    this.emit('busy');
  }
}

/** Debounce helper for input-driven refreshes. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let handle: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(handle);
    handle = window.setTimeout(() => fn(...args), ms);
  };
}
