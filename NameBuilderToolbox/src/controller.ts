/**
 * Orchestration between the data service, the configuration model, and the
 * UI panels. All state mutations that need cross-panel coordination live here.
 */

import type { EntityInfo } from './dataverse';
import type { FieldConfig, FieldDefaults, NameBuilderConfig, SessionState } from './model';
import { cloneConfig, collectReferencedAttributes, createEmptyConfig, parseConfig } from './model';
import { inferFieldType } from './engine';
import { Store, debounce } from './state';
import { toast } from './ui/toast';
import { loadPreferences, saveAutoLoadPublished, saveFieldDefaults, saveSessionByConnection } from './settings';

export class Controller {
  constructor(readonly store: Store) {}

  private get state() {
    return this.store.state;
  }

  /**
   * Loads preferences and resumes the connection's last session (solution +
   * table + in-progress configuration) when one exists. Returns true when no
   * prior session was found for this connection — the caller should prompt
   * the user to pick a solution/table to begin (see ui/welcomeDialog.ts).
   */
  async initialize(): Promise<boolean> {
    const prefs = await loadPreferences();
    this.state.fieldDefaults = prefs.fieldDefaults;
    this.state.autoLoadPublished = prefs.autoLoadPublished;
    this.state.sessionByConnection = prefs.sessionByConnection;

    this.state.connectionName = await this.state.service.getConnectionName();
    this.store.emit('busy');
    void this.loadConfiguredEntities();
    await this.loadEntities();
    await this.loadSolutions();

    const session = this.state.sessionByConnection[this.state.connectionName];
    if (session) {
      await this.restoreSession(session);
      return false;
    }
    return true;
  }

  /** Resumes the solution filter, table, view, and configuration from a saved session. */
  private async restoreSession(session: SessionState): Promise<void> {
    this.state.publishSolutionUniqueName = session.publishSolution ?? null;
    this.state.publishSolutionOverridden = session.publishSolutionOverridden ?? false;
    if (session.solutionId && this.state.solutions.some((s) => s.id === session.solutionId)) {
      await this.setSolutionFilter(session.solutionId, false);
    }
    if (session.entityLogicalName) {
      const entity = this.state.entities.find((e) => e.logicalName === session.entityLogicalName);
      if (entity) {
        await this.selectEntity(entity, {
          restoreConfig: session.config ?? undefined,
          restoreViewId: session.viewId ?? undefined,
          restoreExecutionOrder: session.executionOrder,
        });
      }
    }
  }

  /** Persists the current solution/table/view/configuration for the active connection. */
  private persistSession(): void {
    const connection = this.state.connectionName;
    if (!connection) return;
    this.state.sessionByConnection[connection] = {
      solutionId: this.state.solutionFilterId,
      entityLogicalName: this.state.selectedEntity?.logicalName ?? null,
      config: this.state.selectedEntity ? cloneConfig(this.state.config) : null,
      viewId: this.state.selectedViewId,
      publishSolution: this.state.publishSolutionUniqueName,
      publishSolutionOverridden: this.state.publishSolutionOverridden,
      executionOrder: this.state.executionOrder,
    };
    saveSessionByConnection(this.state.sessionByConnection);
  }

  /** Debounced session save for high-frequency edits (typing in block editors). */
  private readonly persistSessionDebounced = debounce(() => this.persistSession(), 600);

  /** Loads which tables already have a deployed NameBuilder step, for the Configured/Unconfigured grouping. */
  async loadConfiguredEntities(): Promise<void> {
    try {
      this.state.configuredEntityNames = await this.state.service.getConfiguredEntityNames();
      this.store.emit('entities');
    } catch {
      // Non-fatal — table pickers just render as a single flat list.
    }
  }

  async loadEntities(): Promise<void> {
    this.store.setBusy('Loading tables…');
    try {
      this.state.entities = await this.state.service.listEntities();
      this.state.entitiesLoaded = true;
      this.store.emit('entities');
    } catch (error) {
      toast(this.state.service, 'error', 'Failed to load tables', (error as Error).message);
    } finally {
      this.store.setBusy(null);
    }
  }

  async loadSolutions(): Promise<void> {
    try {
      this.state.solutions = await this.state.service.listSolutions();
      this.state.preferredSolutionId = await this.state.service.getPreferredSolutionId();
      this.store.emit('entities');
    } catch {
      /* solution filter stays hidden if solutions can't be listed */
    }
  }

  async setSolutionFilter(solutionId: string | null, persist = true): Promise<void> {
    this.state.solutionFilterId = solutionId;
    if (!solutionId) {
      this.state.solutionEntityIds = null;
      this.store.emit('entities');
      if (persist) this.persistSession();
      return;
    }
    this.store.setBusy('Loading solution tables…');
    try {
      this.state.solutionEntityIds = await this.state.service.getSolutionEntityIds(solutionId);
      this.store.emit('entities');
    } catch (error) {
      toast(this.state.service, 'error', 'Failed to load solution components', (error as Error).message);
      this.state.solutionFilterId = null;
      this.state.solutionEntityIds = null;
    } finally {
      this.store.setBusy(null);
      if (persist) this.persistSession();
    }
  }

  /**
   * Selects a table and loads its columns and views. When `restoreConfig` is
   * supplied (resuming a saved session) it is used verbatim and
   * auto-load-published / inferred-maxLength are skipped, since it may
   * contain unpublished edits.
   */
  async selectEntity(entity: EntityInfo, options?: { restoreConfig?: NameBuilderConfig; restoreViewId?: string; restoreExecutionOrder?: number }): Promise<void> {
    if (this.state.selectedEntity?.logicalName === entity.logicalName && !options?.restoreConfig) return;
    this.state.selectedEntity = entity;
    this.state.attributes = new Map();
    this.state.attributeSearch = '';
    this.state.views = [];
    this.state.selectedViewId = null;
    this.state.viewColumns = null;
    if (options?.restoreConfig) {
      this.state.config = cloneConfig(options.restoreConfig);
      this.state.config.entity = entity.logicalName;
      if (!this.state.config.targetField) this.state.config.targetField = entity.primaryNameAttribute;
      this.state.executionOrder = options.restoreExecutionOrder ?? 1;
    } else {
      this.state.config = createEmptyConfig();
      this.state.config.entity = entity.logicalName;
      this.state.config.targetField = entity.primaryNameAttribute;
      // Defaults to 1; overwritten below by tryLoadPublishedConfig if a step already exists.
      this.state.executionOrder = 1;
    }
    this.state.expandedBlock = null;
    this.state.sampleRecords = [];
    this.state.selectedRecordId = null;
    this.state.recordView = {};
    this.state.currencySymbol = '';
    this.store.emit('entity', 'attributes', 'views', 'config', 'records', 'preview');

    this.store.setBusy(`Loading ${entity.displayName} columns…`);
    try {
      this.state.attributes = await this.state.service.getAttributes(entity);
      if (!options?.restoreConfig) {
        // Default overall max length from the target column's metadata,
        // matching the plugin's behavior of inferring it server-side.
        const target = this.state.attributes.get(entity.primaryNameAttribute.toLowerCase());
        if (target?.maxLength) this.state.config.maxLength = target.maxLength;
        if (this.state.autoLoadPublished) {
          await this.tryLoadPublishedConfig(entity, false);
        }
      }
      this.store.emit('attributes', 'config');

      try {
        this.state.views = await this.state.service.listViews(entity);
      } catch {
        this.state.views = [];
      }
      this.store.emit('views');
      if (options?.restoreViewId && this.state.views.some((v) => v.id === options.restoreViewId)) {
        await this.selectView(options.restoreViewId, false);
      } else {
        await this.loadSampleRecords();
      }
    } catch (error) {
      toast(this.state.service, 'error', 'Failed to load columns', (error as Error).message);
    } finally {
      this.store.setBusy(null);
      this.persistSession();
    }
  }

  /**
   * Applies a view: its columns scope the attribute palette, and its FetchXML
   * drives the sample-record picker. Passing null clears both back to
   * all-columns / recent records.
   */
  async selectView(viewId: string | null, persist = true): Promise<void> {
    const view = viewId ? this.state.views.find((v) => v.id === viewId) ?? null : null;
    this.state.selectedViewId = view?.id ?? null;
    this.state.viewColumns = view && view.columns.length > 0 ? new Set(view.columns) : null;
    this.state.selectedRecordId = null;
    this.state.recordSearch = '';
    this.store.emit('views', 'attributes');
    await this.loadSampleRecords();
    if (persist) this.persistSession();
  }

  /** Explicitly sets the Plugin Solution (Global Configuration), overriding the Table filter default. */
  setPublishSolution(uniqueName: string | null): void {
    this.state.publishSolutionUniqueName = uniqueName;
    this.state.publishSolutionOverridden = true;
    this.persistSession();
  }

  /**
   * The solution publish will register components into: the user's explicit
   * choice once they've made one, otherwise the Table filter's solution
   * (matching "default to the same selected solution, but allow it to be
   * changed"). Returns null for "(Default solution)" / no filter.
   */
  getEffectivePublishSolution(): string | null {
    if (this.state.publishSolutionOverridden) return this.state.publishSolutionUniqueName;
    if (this.state.solutionFilterId) {
      const solution = this.state.solutions.find((s) => s.id === this.state.solutionFilterId);
      if (solution && !solution.isManaged) return solution.uniqueName;
    }
    return null;
  }

  /** Sets the plugin step rank ("Execution Order") used when publishing (Global Configuration). */
  setExecutionOrder(value: number): void {
    this.state.executionOrder = Number.isFinite(value) && value >= 1 ? Math.trunc(value) : 1;
    this.persistSessionDebounced();
  }

  /** Changes the target column the plugin writes to (Global Configuration). */
  setTargetField(logicalName: string): void {
    this.state.config.targetField = logicalName.trim() || (this.state.selectedEntity?.primaryNameAttribute ?? 'name');
    this.configTouched();
  }

  /**
   * Loads the entity's deployed configuration into the designer. When
   * `announce` is false (auto-load on select), silence is kept if nothing is
   * deployed; when true (manual reload), the user is always told the result.
   */
  private async tryLoadPublishedConfig(entity: EntityInfo, announce: boolean): Promise<void> {
    let info: { configurationJson: string; rank: number } | null = null;
    try {
      info = await this.state.service.getPublishedConfig(entity);
    } catch (error) {
      if (announce) toast(this.state.service, 'error', 'Could not read deployed configuration', (error as Error).message);
      return;
    }

    if (!info) {
      if (announce) toast(this.state.service, 'info', 'No deployed configuration', `No NameBuilder step is registered for ${entity.displayName}.`);
      return;
    }

    try {
      const parsed = parseConfig(info.configurationJson);
      parsed.entity = entity.logicalName;
      if (!parsed.targetField) parsed.targetField = entity.primaryNameAttribute;
      this.state.config = parsed;
      this.state.executionOrder = info.rank;
      this.state.expandedBlock = null;
      this.store.emit('config');
      toast(this.state.service, 'success', 'Loaded deployed configuration', `${parsed.fields.length} block(s) from Dataverse.`);
    } catch (error) {
      if (announce) toast(this.state.service, 'error', 'Deployed configuration is invalid JSON', (error as Error).message);
    }
  }

  async reloadPublishedConfig(): Promise<void> {
    const entity = this.state.selectedEntity;
    if (!entity) return;
    this.store.setBusy('Loading deployed configuration…');
    try {
      await this.tryLoadPublishedConfig(entity, true);
      await this.refreshRecordViewNow();
    } finally {
      this.store.setBusy(null);
      this.persistSession();
    }
  }

  async loadSampleRecords(): Promise<void> {
    const entity = this.state.selectedEntity;
    if (!entity) return;
    try {
      const view = this.state.selectedViewId
        ? this.state.views.find((v) => v.id === this.state.selectedViewId) ?? null
        : null;
      if (view) {
        // View records are pre-fetched by the view's FetchXML; search filters client-side.
        let records = await this.state.service.getViewRecords(entity, view);
        const term = this.state.recordSearch.trim().toLowerCase();
        if (term) records = records.filter((r) => r.label.toLowerCase().includes(term));
        this.state.sampleRecords = records;
      } else {
        this.state.sampleRecords = await this.state.service.getSampleRecords(entity, this.state.recordSearch, []);
      }
      if (!this.state.selectedRecordId && this.state.sampleRecords.length > 0) {
        this.state.selectedRecordId = this.state.sampleRecords[0].id;
      }
      this.store.emit('records');
      await this.refreshRecordViewNow();
    } catch (error) {
      toast(this.state.service, 'error', 'Failed to load sample records', (error as Error).message);
    }
  }

  readonly searchSampleRecords = debounce(() => void this.loadSampleRecords(), 350);

  async selectSampleRecord(recordId: string): Promise<void> {
    this.state.selectedRecordId = recordId;
    this.store.emit('records');
    await this.refreshRecordViewNow();
  }

  /** Re-fetches the sample record with every attribute the config references. */
  async refreshRecordViewNow(): Promise<void> {
    const { selectedEntity, selectedRecordId, attributes } = this.state;
    if (!selectedEntity || !selectedRecordId) {
      this.state.recordView = {};
      this.store.emit('preview');
      return;
    }
    const wanted = collectReferencedAttributes(this.state.config);
    try {
      const { view, currencySymbol } = await this.state.service.getRecordView(
        selectedEntity, selectedRecordId, attributes, wanted
      );
      this.state.recordView = view;
      this.state.currencySymbol = currencySymbol;
    } catch (error) {
      toast(this.state.service, 'warning', 'Preview data unavailable', (error as Error).message);
      this.state.recordView = {};
    }
    this.store.emit('preview');
  }

  readonly refreshRecordView = debounce(() => void this.refreshRecordViewNow(), 400);

  /**
   * Adds a column as a new block. `atIndex` inserts at a specific position
   * (used when dropping a dragged column between existing blocks);
   * omitting it appends at the end (plain click-to-add).
   */
  addField(logicalName: string, atIndex?: number): void {
    const attr = this.state.attributes.get(logicalName.toLowerCase());
    const defaults = this.state.fieldDefaults;
    const fields = this.state.config.fields;
    const insertIndex = atIndex === undefined ? fields.length : Math.max(0, Math.min(atIndex, fields.length));
    const isFirst = insertIndex === 0;
    const field: FieldConfig = { field: logicalName };
    field.type = attr?.fieldType ?? inferFieldType(logicalName, this.state.attributes);

    // Apply reusable defaults (mirrors the XrmToolBox "Default Field Properties").
    if (!isFirst && defaults.prefix) field.prefix = defaults.prefix;
    if (defaults.suffix) field.suffix = defaults.suffix;
    if (field.type === 'date' || field.type === 'datetime') {
      field.format = defaults.dateFormat || 'yyyy-MM-dd';
      if (defaults.timezoneOffsetHours) field.timezoneOffsetHours = defaults.timezoneOffsetHours;
    } else if ((field.type === 'number' || field.type === 'currency') && defaults.numberFormat) {
      field.format = defaults.numberFormat;
    }

    fields.splice(insertIndex, 0, field);
    this.state.expandedBlock = insertIndex;
    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
  }

  /**
   * Moves an existing block to an arbitrary position (drag-reorder within
   * the pattern list). `toIndex` is the block's desired final index.
   */
  moveFieldTo(fromIndex: number, toIndex: number): void {
    const fields = this.state.config.fields;
    if (fromIndex < 0 || fromIndex >= fields.length) return;
    const target = Math.max(0, Math.min(toIndex, fields.length - 1));
    if (fromIndex === target) return;

    const [moved] = fields.splice(fromIndex, 1);
    fields.splice(target, 0, moved);

    if (this.state.expandedBlock !== null) {
      if (this.state.expandedBlock === fromIndex) {
        this.state.expandedBlock = target;
      } else {
        let idx = this.state.expandedBlock;
        if (idx > fromIndex) idx--;
        if (idx >= target) idx++;
        this.state.expandedBlock = idx;
      }
    }

    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
  }

  /**
   * Updates the reusable field defaults, persists them, and propagates each
   * change to existing top-level blocks that still use the previous default —
   * matching the XrmToolBox configurator's propagation behavior.
   */
  updateFieldDefaults(patch: Partial<FieldDefaults>): void {
    const current = this.state.fieldDefaults;
    const next: FieldDefaults = { ...current, ...patch };

    this.state.config.fields.forEach((field, index) => {
      // Prefix on the first block is intentionally never set (no leading separator).
      if (patch.prefix !== undefined && index > 0 && (field.prefix ?? '') === current.prefix) {
        field.prefix = next.prefix || undefined;
      }
      if (patch.suffix !== undefined && (field.suffix ?? '') === current.suffix) {
        field.suffix = next.suffix || undefined;
      }
      if (patch.dateFormat !== undefined && (field.type === 'date' || field.type === 'datetime') && (field.format ?? '') === current.dateFormat) {
        field.format = next.dateFormat || undefined;
      }
      if (patch.numberFormat !== undefined && (field.type === 'number' || field.type === 'currency') && (field.format ?? '') === current.numberFormat) {
        field.format = next.numberFormat || undefined;
      }
      if (patch.timezoneOffsetHours !== undefined && (field.type === 'date' || field.type === 'datetime') && (field.timezoneOffsetHours ?? 0) === current.timezoneOffsetHours) {
        field.timezoneOffsetHours = next.timezoneOffsetHours || undefined;
      }
    });

    this.state.fieldDefaults = next;
    saveFieldDefaults(next);
    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
  }

  /** Forcibly applies the current defaults to every existing block. */
  reapplyDefaultsToAll(): void {
    const defaults = this.state.fieldDefaults;
    this.state.config.fields.forEach((field, index) => {
      field.prefix = index > 0 && defaults.prefix ? defaults.prefix : undefined;
      field.suffix = defaults.suffix || undefined;
      if (field.type === 'date' || field.type === 'datetime') {
        field.format = defaults.dateFormat || undefined;
        field.timezoneOffsetHours = defaults.timezoneOffsetHours || undefined;
      } else if (field.type === 'number' || field.type === 'currency') {
        field.format = defaults.numberFormat || undefined;
      }
    });
    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
    toast(this.state.service, 'success', 'Defaults applied to all blocks');
  }

  setAutoLoadPublished(value: boolean): void {
    this.state.autoLoadPublished = value;
    saveAutoLoadPublished(value);
  }

  removeField(index: number): void {
    this.state.config.fields.splice(index, 1);
    if (this.state.expandedBlock === index) this.state.expandedBlock = null;
    else if (this.state.expandedBlock !== null && this.state.expandedBlock > index) this.state.expandedBlock--;
    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
  }

  moveField(index: number, delta: -1 | 1): void {
    const target = index + delta;
    const fields = this.state.config.fields;
    if (target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    if (this.state.expandedBlock === index) this.state.expandedBlock = target;
    else if (this.state.expandedBlock === target) this.state.expandedBlock = index;
    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
  }

  toggleBlockEditor(index: number): void {
    this.state.expandedBlock = this.state.expandedBlock === index ? null : index;
    this.store.emit('config');
  }

  /** Called after silent field mutations from editor inputs. */
  configTouched(structural = false): void {
    if (structural) this.store.emit('config');
    this.refreshRecordView();
    this.store.emit('preview');
    this.persistSessionDebounced();
  }

  importConfig(json: string): void {
    const parsed = parseConfig(json);
    const entityName = parsed.entity;
    if (entityName && this.state.selectedEntity && entityName !== this.state.selectedEntity.logicalName) {
      toast(
        this.state.service, 'warning', 'Configuration is for a different table',
        `The imported JSON targets '${entityName}' but '${this.state.selectedEntity.logicalName}' is selected.`
      );
    }
    parsed.entity = this.state.selectedEntity?.logicalName ?? parsed.entity;
    if (this.state.selectedEntity && (!parsed.targetField || parsed.targetField === 'name')) {
      parsed.targetField = parsed.targetField || this.state.selectedEntity.primaryNameAttribute;
    }
    this.state.config = parsed;
    this.state.expandedBlock = null;
    this.store.emit('config');
    this.refreshRecordView();
    this.persistSessionDebounced();
    toast(this.state.service, 'success', 'Configuration imported');
  }
}
