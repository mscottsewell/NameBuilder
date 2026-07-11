/**
 * Shared table-list grouping for the sidebar's table combobox and the
 * welcome dialog: tables that already have a deployed NameBuilder
 * configuration are listed first under a "Configured" heading, then the
 * rest under "Unconfigured". Item rendering is left to the caller so each
 * surface can wire up its own selection/interaction behavior.
 */

import { el } from './dom';
import type { EntityInfo } from '../dataverse';

export function renderGroupedEntities(
  container: HTMLElement,
  entities: EntityInfo[],
  configuredNames: Set<string>,
  renderItem: (entity: EntityInfo) => HTMLElement
): void {
  const configured = entities.filter((e) => configuredNames.has(e.logicalName.toLowerCase()));
  const unconfigured = entities.filter((e) => !configuredNames.has(e.logicalName.toLowerCase()));

  if (configured.length > 0) {
    container.append(el('div', { class: 'entity-group-heading' }, 'Configured'));
    configured.forEach((entity) => container.append(renderItem(entity)));
  }
  if (unconfigured.length > 0) {
    container.append(el('div', { class: 'entity-group-heading' }, 'Unconfigured'));
    unconfigured.forEach((entity) => container.append(renderItem(entity)));
  }
}
