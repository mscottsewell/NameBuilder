/**
 * Ambient typings for the Power Platform ToolBox host APIs that this tool uses.
 * Shapes follow https://docs.powerplatformtoolbox.com/tool-development/api-reference.
 * Kept local (rather than depending on @pptb/types) so the project builds
 * hermetically; only the members actually consumed are declared.
 */

interface PptbConnection {
  id?: string;
  name?: string;
  url?: string;
  environmentUrl?: string;
  [key: string]: unknown;
}

interface PptbNotificationOptions {
  title?: string;
  body?: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  [key: string]: unknown;
}

interface PptbToolboxAPI {
  connections: {
    getActiveConnection(): Promise<PptbConnection | null>;
    getSecondaryConnection?(): Promise<PptbConnection | null>;
  };
  utils: {
    showNotification(options: PptbNotificationOptions): Promise<void>;
    copyToClipboard(text: string): Promise<void>;
    getCurrentTheme(): Promise<'light' | 'dark'>;
    openInConnectionBrowser?(url: string, connectionTarget?: 'primary' | 'secondary'): Promise<void>;
  };
  settings?: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    getAll(): Promise<Record<string, unknown>>;
    setAll(settings: Record<string, unknown>): Promise<void>;
  };
  events?: {
    on?(event: string, handler: (...args: unknown[]) => void): void;
  };
  on?(event: string, handler: (...args: unknown[]) => void): void;
  getToolContext?(): Promise<Record<string, unknown>>;
}

interface PptbFetchXmlResult {
  entities?: Record<string, unknown>[];
  value?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface PptbExecuteRequest {
  entityName?: string;
  entityId?: string;
  operationName: string;
  operationType: 'action' | 'function';
  parameters?: Record<string, unknown>;
}

interface PptbDataverseAPI {
  create(entityLogicalName: string, record: Record<string, unknown>, connectionTarget?: 'primary' | 'secondary'): Promise<{ id: string } | string>;
  retrieve(entityLogicalName: string, id: string, columns?: string[], connectionTarget?: 'primary' | 'secondary'): Promise<Record<string, unknown>>;
  update(entityLogicalName: string, id: string, record: Record<string, unknown>, connectionTarget?: 'primary' | 'secondary'): Promise<void>;
  delete(entityLogicalName: string, id: string, connectionTarget?: 'primary' | 'secondary'): Promise<void>;
  queryData(odataQuery: string, connectionTarget?: 'primary' | 'secondary'): Promise<{ value: Record<string, unknown>[] }>;
  fetchXmlQuery(fetchXml: string, connectionTarget?: 'primary' | 'secondary'): Promise<PptbFetchXmlResult>;
  execute(request: PptbExecuteRequest, connectionTarget?: 'primary' | 'secondary'): Promise<Record<string, unknown>>;
  getEntityMetadata(entityLogicalName: string, searchByLogicalName: boolean, entityProperties?: string[], connectionTarget?: 'primary' | 'secondary'): Promise<Record<string, unknown>>;
  getEntityRelatedMetadata(entityLogicalName: string, relatedPath: string, relatedProperties?: string[], connectionTarget?: 'primary' | 'secondary'): Promise<{ value?: Record<string, unknown>[] } | Record<string, unknown>[]>;
  getAllEntitiesMetadata(entityProperties?: string[], connectionTarget?: 'primary' | 'secondary'): Promise<{ value: Record<string, unknown>[] }>;
  getSolutions(selectColumns: string[], connectionTarget?: 'primary' | 'secondary'): Promise<{ value: Record<string, unknown>[] }>;
  publishCustomizations?(tableLogicalName?: string, connectionTarget?: 'primary' | 'secondary'): Promise<void>;
}

interface Window {
  toolboxAPI?: PptbToolboxAPI;
  dataverseAPI?: PptbDataverseAPI;
}
