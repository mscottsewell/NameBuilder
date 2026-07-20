/**
 * First-run modal: shown only when no prior session exists for the current
 * connection (see Controller.initialize()). Prompts for a solution (optional)
 * and a table to begin working on. Picking a table — or any manual table
 * selection via the sidebar — seeds session persistence, so this appears at
 * most once per connection.
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import type { EntityInfo } from '../dataverse';
import { renderGroupedEntities } from './entityList';
import { appendSolutionOptions } from './solutionOptions';

export function openWelcomeDialog(controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  const overlay = el('div', { class: 'modal-overlay' });

  const solutionSelect = el('select', {
    class: 'select',
    onchange: () => void controller.setSolutionFilter(solutionSelect.value || null),
  });

  const search = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search tables…',
    oninput: () => renderEntities(),
  });

  const list = el('div', { class: 'list welcome-list' });

  const skip = el('button', {
    class: 'btn btn-ghost',
    onclick: () => { unsubscribe(); overlay.remove(); },
  }, "I'll browse manually");

  const dialog = el('div', { class: 'modal' },
    el('h2', {}, 'Welcome to NameBuilder'),
    el('p', { class: 'field-hint' },
      `Connected to ${state.connectionName}. Pick a solution (optional) and a table to start designing an automatic record name.`),
    solutionSelect,
    search,
    list,
    el('div', { class: 'modal-actions' }, skip)
  );

  overlay.append(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { unsubscribe(); overlay.remove(); }
  });
  document.body.append(overlay);

  function renderSolutions(): void {
    clear(solutionSelect);
    solutionSelect.append(el('option', { value: '' }, 'All solutions'));
    appendSolutionOptions(solutionSelect, state.solutions, state.preferredSolutionId, (s) => s.id);
    solutionSelect.value = state.solutionFilterId ?? '';
  }

  function renderEntities(): void {
    clear(list);
    const term = search.value.trim().toLowerCase();
    const filtered = state.entities.filter((entity) => {
      if (state.solutionEntityIds && (!entity.metadataId || !state.solutionEntityIds.has(entity.metadataId))) {
        return false;
      }
      if (!term) return true;
      return entity.displayName.toLowerCase().includes(term) || entity.logicalName.includes(term);
    });

    if (!state.entitiesLoaded) {
      list.append(el('div', { class: 'empty' }, 'Loading tables…'));
      return;
    }
    if (filtered.length === 0) {
      list.append(el('div', { class: 'empty' }, 'No tables match.'));
      return;
    }

    renderGroupedEntities(list, filtered.slice(0, 200), state.configuredEntityNames, renderEntityRow);
  }

  function renderEntityRow(entity: EntityInfo): HTMLElement {
    return el(
      'button',
      { class: 'list-item entity-row', title: entity.logicalName, onclick: () => void start(entity) },
      el('span', { class: 'list-item-primary' }, entity.displayName),
      el('span', { class: 'list-item-secondary' }, entity.logicalName)
    );
  }

  async function start(entity: EntityInfo): Promise<void> {
    unsubscribe();
    overlay.remove();
    await controller.selectEntity(entity);
  }

  const onEntities = () => {
    renderSolutions();
    renderEntities();
  };
  store.on('entities', onEntities);
  function unsubscribe(): void {
    store.off('entities', onEntities);
  }

  renderSolutions();
  renderEntities();
}
