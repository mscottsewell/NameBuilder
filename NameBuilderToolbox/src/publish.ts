/**
 * Publishes a NameBuilder configuration to Dataverse:
 *   1. ensures the NameBuilder plugin assembly + plugin type exist (uploading
 *      the embedded, signed DLL when missing or outdated),
 *   2. creates or updates the synchronous pre-operation steps on Create/Update,
 *   3. maintains the Update step's PreImage attribute list, and
 *   4. optionally adds the components to a solution.
 *
 * This is a direct port of the XrmToolBox configurator's publish pipeline
 * (PluginAssemblyInstaller.cs + NameBuilderConfiguratorControl.ExecutePublish),
 * re-expressed as Dataverse Web API calls through the PPTB dataverseAPI bridge.
 */

import type { EntityInfo } from './dataverse';
import {
  PLUGIN_ASSEMBLY_BASE64,
  PLUGIN_ASSEMBLY_NAME,
  PLUGIN_ASSEMBLY_VERSION,
  PLUGIN_PUBLIC_KEY_TOKEN,
  PLUGIN_TYPE_NAME,
} from './generated/plugin-assembly';

export interface ServerPluginStatus {
  installed: boolean;
  assemblyId?: string;
  serverVersion?: string;
  /** True when the server DLL version differs from the embedded build. */
  versionMismatch: boolean;
  pluginTypeId?: string;
}

export interface PublishRequest {
  entity: EntityInfo;
  /** Compact JSON written to the step's unsecure configuration. */
  configurationJson: string;
  /** All attribute logical names referenced by the configuration. */
  attributes: string[];
  registerCreate: boolean;
  registerUpdate: boolean;
  solutionUniqueName?: string;
  /** Plugin step rank ("Execution Order" in the Plugin Registration Tool). */
  executionOrder: number;
  onProgress?: (message: string) => void;
}

/** A deployed step's unsecure configuration plus its rank ("Execution Order"). */
export interface PublishedStepInfo {
  configurationJson: string;
  rank: number;
}

export interface PublishOutcome {
  steps: { message: string; stepId: string; created: boolean }[];
  assemblyUploaded: boolean;
}

const STEP_COMPONENT_TYPE = 92;
const ASSEMBLY_COMPONENT_TYPE = 91;

function api(): PptbDataverseAPI {
  const dv = window.dataverseAPI;
  if (!dv) throw new Error('Publishing requires the Power Platform ToolBox Dataverse connection.');
  return dv;
}

function createdId(result: { id: string } | string): string {
  return typeof result === 'string' ? result : result.id;
}

export async function getServerPluginStatus(): Promise<ServerPluginStatus> {
  const assemblies = await api().queryData(
    `pluginassemblies?$select=pluginassemblyid,name,version&$filter=name eq '${PLUGIN_ASSEMBLY_NAME}'`
  );
  const assembly = assemblies.value?.[0];
  if (!assembly) {
    return { installed: false, versionMismatch: false };
  }

  const assemblyId = String(assembly.pluginassemblyid);
  const serverVersion = String(assembly.version ?? '');

  const types = await api().queryData(
    `plugintypes?$select=plugintypeid,typename&$filter=_pluginassemblyid_value eq ${assemblyId} and typename eq '${PLUGIN_TYPE_NAME}'`
  );

  return {
    installed: true,
    assemblyId,
    serverVersion,
    versionMismatch: serverVersion !== PLUGIN_ASSEMBLY_VERSION,
    pluginTypeId: types.value?.[0] ? String(types.value[0].plugintypeid) : undefined,
  };
}

/**
 * Logical names of every table that already has a NameBuilder step
 * registered (Create and/or Update), used to group the table picker into
 * "Configured" / "Unconfigured" sections. Returns an empty set when the
 * plugin isn't installed yet — nothing can be configured before that.
 */
export async function getConfiguredEntityLogicalNames(): Promise<Set<string>> {
  const status = await getServerPluginStatus();
  if (!status.installed || !status.pluginTypeId) return new Set();

  try {
    const result = await api().queryData(
      `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid` +
        `&$filter=_eventhandler_value eq ${status.pluginTypeId}` +
        `&$expand=sdkmessagefilterid($select=primaryobjecttypecode)`
    );
    const names = new Set<string>();
    for (const row of (result.value ?? []) as Record<string, unknown>[]) {
      const filter = row.sdkmessagefilterid as Record<string, unknown> | undefined;
      const name = filter?.primaryobjecttypecode;
      if (typeof name === 'string' && name) names.add(name.toLowerCase());
    }
    return names;
  } catch {
    // Non-fatal — the table picker just falls back to a single flat list.
    return new Set();
  }
}

/** Uploads the embedded plugin DLL (create or update) and ensures the plugin type. */
export async function installOrUpdateAssembly(
  status: ServerPluginStatus,
  onProgress?: (message: string) => void
): Promise<{ assemblyId: string; pluginTypeId: string; uploaded: boolean }> {
  const dv = api();
  let assemblyId = status.assemblyId;
  let uploaded = false;

  if (!assemblyId) {
    onProgress?.(`Uploading ${PLUGIN_ASSEMBLY_NAME} plugin assembly v${PLUGIN_ASSEMBLY_VERSION}…`);
    const result = await dv.create('pluginassembly', {
      name: PLUGIN_ASSEMBLY_NAME,
      culture: 'neutral',
      version: PLUGIN_ASSEMBLY_VERSION,
      introducedversion: PLUGIN_ASSEMBLY_VERSION,
      publickeytoken: PLUGIN_PUBLIC_KEY_TOKEN,
      isolationmode: 2, // sandbox
      sourcetype: 0, // database
      content: PLUGIN_ASSEMBLY_BASE64,
      description: 'NameBuilder plug-in assembly (installed via NameBuilder for Power Platform ToolBox)',
    });
    assemblyId = createdId(result);
    uploaded = true;
  } else if (status.versionMismatch) {
    onProgress?.(`Updating ${PLUGIN_ASSEMBLY_NAME} plugin assembly ${status.serverVersion} → ${PLUGIN_ASSEMBLY_VERSION}…`);
    await dv.update('pluginassembly', assemblyId, {
      content: PLUGIN_ASSEMBLY_BASE64,
      version: PLUGIN_ASSEMBLY_VERSION,
      introducedversion: PLUGIN_ASSEMBLY_VERSION,
      culture: 'neutral',
      publickeytoken: PLUGIN_PUBLIC_KEY_TOKEN,
    });
    uploaded = true;
  }

  let pluginTypeId = status.pluginTypeId;
  if (!pluginTypeId) {
    const existing = await dv.queryData(
      `plugintypes?$select=plugintypeid&$filter=_pluginassemblyid_value eq ${assemblyId} and typename eq '${PLUGIN_TYPE_NAME}'`
    );
    pluginTypeId = existing.value?.[0] ? String(existing.value[0].plugintypeid) : undefined;
  }
  if (!pluginTypeId) {
    onProgress?.('Registering plugin type…');
    const result = await dv.create('plugintype', {
      typename: PLUGIN_TYPE_NAME,
      friendlyname: 'NameBuilderPlugin',
      name: 'NameBuilderPlugin',
      description: 'Builds the record name from configured fields.',
      'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`,
    });
    pluginTypeId = createdId(result);
  }

  return { assemblyId, pluginTypeId, uploaded };
}

/**
 * Retrieves the configuration JSON and rank ("Execution Order") already
 * deployed for an entity, so the designer can round-trip an existing setup.
 * Prefers the Update step and falls back to the Create step. Returns null
 * when the plugin isn't installed or no step exists for the entity.
 */
export async function fetchPublishedConfig(entityLogicalName: string): Promise<PublishedStepInfo | null> {
  const status = await getServerPluginStatus();
  if (!status.installed || !status.pluginTypeId) return null;
  const pluginTypeId = status.pluginTypeId;

  for (const messageName of ['Update', 'Create'] as const) {
    try {
      const messageId = await getSdkMessageId(messageName);
      const filterId = await getSdkMessageFilterId(messageId, entityLogicalName);
      const steps = await api().queryData(
        `sdkmessageprocessingsteps?$select=configuration,rank` +
          `&$filter=_eventhandler_value eq ${pluginTypeId} and _sdkmessageid_value eq ${messageId} and _sdkmessagefilterid_value eq ${filterId}`
      );
      const step = steps.value?.[0];
      const configuration = step?.configuration;
      if (typeof configuration === 'string' && configuration.trim()) {
        const rank = typeof step?.rank === 'number' ? step.rank : 1;
        return { configurationJson: configuration, rank };
      }
    } catch {
      // Entity may not support this message (no filter) — try the next one.
    }
  }
  return null;
}

const messageIdCache = new Map<string, string>();
const filterIdCache = new Map<string, string>();

async function getSdkMessageId(messageName: string): Promise<string> {
  const cached = messageIdCache.get(messageName);
  if (cached) return cached;
  const result = await api().queryData(
    `sdkmessages?$select=sdkmessageid&$filter=name eq '${messageName}'`
  );
  const id = result.value?.[0] ? String(result.value[0].sdkmessageid) : undefined;
  if (!id) throw new Error(`Dataverse message '${messageName}' was not found.`);
  messageIdCache.set(messageName, id);
  return id;
}

async function getSdkMessageFilterId(messageId: string, entityLogicalName: string): Promise<string> {
  const key = `${messageId}:${entityLogicalName}`;
  const cached = filterIdCache.get(key);
  if (cached) return cached;
  const result = await api().queryData(
    `sdkmessagefilters?$select=sdkmessagefilterid&$filter=_sdkmessageid_value eq ${messageId} and primaryobjecttypecode eq '${entityLogicalName}'`
  );
  const id = result.value?.[0] ? String(result.value[0].sdkmessagefilterid) : undefined;
  if (!id) {
    throw new Error(`The '${entityLogicalName}' table does not support the ${messageId} message (no SDK message filter found).`);
  }
  filterIdCache.set(key, id);
  return id;
}

function buildAttributeCsv(attributes: string[]): string {
  return [...new Set(attributes.map((a) => a.trim().toLowerCase()).filter(Boolean))].sort().join(',');
}

async function ensureStep(
  pluginTypeId: string,
  entity: EntityInfo,
  messageName: 'Create' | 'Update',
  configurationJson: string,
  attributeCsv: string,
  rank: number,
  onProgress?: (message: string) => void
): Promise<{ stepId: string; created: boolean }> {
  const dv = api();
  const messageId = await getSdkMessageId(messageName);
  const filterId = await getSdkMessageFilterId(messageId, entity.logicalName);

  const existing = await dv.queryData(
    `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name` +
      `&$filter=_eventhandler_value eq ${pluginTypeId} and _sdkmessageid_value eq ${messageId} and _sdkmessagefilterid_value eq ${filterId}`
  );

  if (existing.value?.length) {
    const stepId = String(existing.value[0].sdkmessageprocessingstepid);
    onProgress?.(`Updating existing ${messageName} step…`);
    await dv.update('sdkmessageprocessingstep', stepId, {
      configuration: configurationJson,
      filteringattributes: attributeCsv || null,
      rank,
    });
    return { stepId, created: false };
  }

  onProgress?.(`Creating ${messageName} step…`);
  const stepName = `NameBuilder - ${entity.displayName} (${entity.logicalName}) - ${messageName}`;
  const result = await dv.create('sdkmessageprocessingstep', {
    name: stepName,
    configuration: configurationJson,
    filteringattributes: attributeCsv || null,
    mode: 0, // synchronous
    stage: 20, // pre-operation
    supporteddeployment: 0, // server only
    rank,
    'sdkmessageid@odata.bind': `/sdkmessages(${messageId})`,
    'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filterId})`,
    'eventhandler_plugintype@odata.bind': `/plugintypes(${pluginTypeId})`,
  });
  return { stepId: createdId(result), created: true };
}

/**
 * Ensures the Update step has a PreImage (alias 'PreImage' on Target) whose
 * attribute list contains every attribute the configuration references.
 * Existing image attributes are merged, never removed.
 */
function createPreImageRecord(
  stepId: string,
  alias: string,
  messageProperty: string,
  attributesCsv: string
): Promise<{ id: string } | string> {
  return api().create('sdkmessageprocessingstepimage', {
    name: alias,
    entityalias: alias,
    messagepropertyname: messageProperty,
    imagetype: 0,
    attributes: attributesCsv,
    'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${stepId})`,
  });
}

async function ensurePreImage(stepId: string, attributes: string[], onProgress?: (message: string) => void): Promise<void> {
  if (attributes.length === 0) return;
  const dv = api();

  const existing = await dv.queryData(
    `sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,attributes,entityalias,messagepropertyname` +
      `&$filter=_sdkmessageprocessingstepid_value eq ${stepId} and imagetype eq 0`
  );

  const required = [...new Set(attributes.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  const image = existing.value?.[0];

  if (!image) {
    onProgress?.('Creating PreImage for the Update step…');
    await createPreImageRecord(stepId, 'PreImage', 'Target', required.sort().join(','));
    return;
  }

  const union = new Set(required);
  for (const token of String(image.attributes ?? '').split(',')) {
    if (token.trim()) union.add(token.trim().toLowerCase());
  }
  const mergedAttributes = [...union].sort().join(',');
  const alias = String(image.entityalias || 'PreImage');
  const messageProperty = String(image.messagepropertyname || 'Target');
  const imageId = String(image.sdkmessageprocessingstepimageid);

  onProgress?.('Updating PreImage attribute list…');
  const update: Record<string, unknown> = { attributes: mergedAttributes };
  if (!image.entityalias) update.entityalias = alias;
  if (!image.messagepropertyname) update.messagepropertyname = messageProperty;

  try {
    await dv.update('sdkmessageprocessingstepimage', imageId, update);
  } catch (error) {
    // Dataverse has a long-standing platform quirk: updating an existing
    // step image's attribute list can throw a generic
    // "0x80040216: An unexpected error occurred" fault (a server-side bug,
    // not a data/permissions problem — the XrmToolBox configurator hit the
    // same thing and works around it the same way). The reliable fix is to
    // delete the image and recreate it with the merged attribute list
    // instead of updating it in place.
    onProgress?.('PreImage update was rejected by the server — recreating it instead…');
    try {
      await dv.delete('sdkmessageprocessingstepimage', imageId);
      await createPreImageRecord(stepId, alias, messageProperty, mergedAttributes);
    } catch (recreateError) {
      throw new Error(
        `Updating the PreImage failed (${(error as Error).message}), and recreating it also failed: ${(recreateError as Error).message}`
      );
    }
  }
}

async function addToSolution(
  componentId: string,
  componentType: number,
  solutionUniqueName: string,
  onProgress?: (message: string) => void
): Promise<void> {
  try {
    await api().execute({
      operationName: 'AddSolutionComponent',
      operationType: 'action',
      parameters: {
        ComponentId: componentId,
        ComponentType: componentType,
        SolutionUniqueName: solutionUniqueName,
        AddRequiredComponents: false,
      },
    });
  } catch (error) {
    // Non-fatal: the steps are registered even if solution membership fails.
    onProgress?.(`Warning: could not add component to solution '${solutionUniqueName}': ${(error as Error).message}`);
  }
}

export async function publishConfiguration(request: PublishRequest): Promise<PublishOutcome> {
  const { entity, onProgress } = request;

  onProgress?.('Checking NameBuilder plugin on the server…');
  const status = await getServerPluginStatus();
  const { assemblyId, pluginTypeId, uploaded } = await installOrUpdateAssembly(status, onProgress);

  const attributeCsv = buildAttributeCsv(request.attributes);
  const outcome: PublishOutcome = { steps: [], assemblyUploaded: uploaded };

  if (request.registerCreate) {
    const step = await ensureStep(pluginTypeId, entity, 'Create', request.configurationJson, attributeCsv, request.executionOrder, onProgress);
    outcome.steps.push({ message: 'Create', ...step });
  }

  if (request.registerUpdate) {
    const step = await ensureStep(pluginTypeId, entity, 'Update', request.configurationJson, attributeCsv, request.executionOrder, onProgress);
    await ensurePreImage(step.stepId, request.attributes, onProgress);
    outcome.steps.push({ message: 'Update', ...step });
  }

  if (request.solutionUniqueName) {
    onProgress?.(`Adding components to solution '${request.solutionUniqueName}'…`);
    if (uploaded || !status.installed) {
      await addToSolution(assemblyId, ASSEMBLY_COMPONENT_TYPE, request.solutionUniqueName, onProgress);
    }
    for (const step of outcome.steps) {
      await addToSolution(step.stepId, STEP_COMPONENT_TYPE, request.solutionUniqueName, onProgress);
    }
  }

  onProgress?.('Publish complete.');
  return outcome;
}

export const EMBEDDED_PLUGIN_VERSION = PLUGIN_ASSEMBLY_VERSION;
