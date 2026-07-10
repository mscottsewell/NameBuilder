/**
 * Left sidebar: solution filter, table search/list, and the column palette
 * for the selected table (click a column to append it as a name block).
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import type { AttributeInfo } from '../engine';

const TYPE_BADGES: Record<string, string> = {
  string: 'Aa',
  lookup: '🔗',
  date: '📅',
  number: '#',
  currency: '$',
  optionset: '▾',
};

export function mountSidebar(root: HTMLElement, controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  const solutionSelect = el('select', {
    class: 'select',
    title: 'Filter tables by solution',
    onchange: () => void controller.setSolutionFilter(solutionSelect.value || null),
  });

  const entitySearch = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search tables…',
    oninput: () => {
      state.entitySearch = entitySearch.value;
      renderEntityList();
    },
  });

  const entityList = el('div', { class: 'list entity-list' });

  const attributeSearch = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search columns…',
    oninput: () => {
      state.attributeSearch = attributeSearch.value;
      renderAttributeList();
    },
  });

  const attributeList = el('div', { class: 'list attribute-list' });
  const attributeHeader = el('div', { class: 'sidebar-heading' }, 'Columns');

  root.append(
    el('div', { class: 'sidebar-heading' }, 'Tables'),
    solutionSelect,
    entitySearch,
    entityList,
    attributeHeader,
    el('div', { class: 'hint' }, 'Click a column to add it to the name pattern.'),
    attributeSearch,
    attributeList
  );

  function renderSolutions(): void {
    clear(solutionSelect);
    solutionSelect.append(el('option', { value: '' }, 'All solutions'));
    for (const solution of state.solutions) {
      solutionSelect.append(
        el('option', { value: solution.id }, `${solution.friendlyName}${solution.isManaged ? ' (managed)' : ''}`)
      );
    }
    solutionSelect.value = state.solutionFilterId ?? '';
  }

  function renderEntityList(): void {
    clear(entityList);
    const term = state.entitySearch.trim().toLowerCase();
    const filtered = state.entities.filter((entity) => {
      if (state.solutionEntityIds && (!entity.metadataId || !state.solutionEntityIds.has(entity.metadataId))) {
        return false;
      }
      if (!term) return true;
      return entity.displayName.toLowerCase().includes(term) || entity.logicalName.includes(term);
    });

    if (!state.entitiesLoaded) {
      entityList.append(el('div', { class: 'empty' }, 'Loading…'));
      return;
    }
    if (filtered.length === 0) {
      entityList.append(el('div', { class: 'empty' }, 'No tables match.'));
      return;
    }

    for (const entity of filtered.slice(0, 300)) {
      const selected = state.selectedEntity?.logicalName === entity.logicalName;
      entityList.append(
        el(
          'button',
          {
            class: `list-item${selected ? ' selected' : ''}`,
            onclick: () => void controller.selectEntity(entity),
            title: entity.logicalName,
          },
          el('span', { class: 'list-item-primary' }, entity.displayName),
          el('span', { class: 'list-item-secondary' }, entity.logicalName)
        )
      );
    }
    if (filtered.length > 300) {
      entityList.append(el('div', { class: 'empty' }, `…and ${filtered.length - 300} more. Refine the search.`));
    }
  }

  function renderAttributeList(): void {
    clear(attributeList);
    if (!state.selectedEntity) {
      attributeList.append(el('div', { class: 'empty' }, 'Select a table first.'));
      return;
    }

    const term = state.attributeSearch.trim().toLowerCase();
    const usable = [...state.attributes.values()]
      .filter((attr) => attr.fieldType !== null && !attr.isPrimaryName)
      .filter((attr) => !term || attr.displayName.toLowerCase().includes(term) || attr.logicalName.includes(term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    if (usable.length === 0) {
      attributeList.append(el('div', { class: 'empty' }, state.attributes.size === 0 ? 'Loading…' : 'No columns match.'));
      return;
    }

    for (const attr of usable) {
      attributeList.append(renderAttributeItem(attr));
    }
  }

  function renderAttributeItem(attr: AttributeInfo): HTMLElement {
    return el(
      'button',
      {
        class: 'list-item attribute-item',
        title: `${attr.logicalName} (${attr.attributeType}) — click to add`,
        onclick: () => controller.addField(attr.logicalName),
      },
      el('span', { class: `type-badge type-${attr.fieldType}` }, TYPE_BADGES[attr.fieldType ?? ''] ?? '?'),
      el('span', { class: 'list-item-primary' }, attr.displayName),
      el('span', { class: 'list-item-secondary' }, attr.logicalName),
      el('span', { class: 'add-icon', 'aria-hidden': 'true' }, '+')
    );
  }

  store.on('entities', () => {
    renderSolutions();
    renderEntityList();
  });
  store.on('entity', renderEntityList);
  store.on('attributes', () => {
    attributeHeader.textContent = state.selectedEntity ? `Columns — ${state.selectedEntity.displayName}` : 'Columns';
    attributeSearch.value = state.attributeSearch;
    renderAttributeList();
  });

  renderSolutions();
  renderEntityList();
  renderAttributeList();
}
