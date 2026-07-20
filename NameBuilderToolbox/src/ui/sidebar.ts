/**
 * Left sidebar (full height): solution filter, table combobox (searchable
 * dropdown that collapses once a table is chosen), view selector (scopes the
 * column palette and the record picker), sample-record picker, and the
 * column palette for the selected table (click a column to append it as a
 * name block).
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import type { AttributeInfo } from '../engine';
import type { EntityInfo } from '../dataverse';
import { NEW_FIELD_DRAG_TYPE } from './dragTypes';
import { renderGroupedEntities } from './entityList';
import { appendSolutionOptions } from './solutionOptions';

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

  // ----- Solution filter -----
  const solutionSelect = el('select', {
    class: 'select',
    title: 'Filter tables by solution',
    onchange: () => void controller.setSolutionFilter(solutionSelect.value || null),
  });

  // ----- Table combobox: input + collapsible dropdown -----
  const entityInput = el('input', {
    class: 'input combo-input',
    type: 'text',
    placeholder: 'Select a table…',
    autocomplete: 'off',
    onfocus: () => {
      entityInput.select();
      openEntityDropdown();
    },
    oninput: () => {
      state.entitySearch = entityInput.value;
      openEntityDropdown();
      renderEntityDropdown();
    },
    onkeydown: ((e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEntityDropdown();
    }) as EventListener,
  });
  const entityDropdown = el('div', { class: 'combo-dropdown' });
  const entityCombo = el('div', { class: 'combo' }, entityInput, entityDropdown);
  let entityDropdownOpen = false;

  function openEntityDropdown(): void {
    entityDropdownOpen = true;
    entityDropdown.classList.add('open');
    renderEntityDropdown();
  }
  function closeEntityDropdown(): void {
    entityDropdownOpen = false;
    entityDropdown.classList.remove('open');
    // Restore the selected table's name if the search text was left mid-edit.
    entityInput.value = state.selectedEntity ? state.selectedEntity.displayName : '';
    state.entitySearch = '';
  }
  document.addEventListener('mousedown', (e) => {
    if (entityDropdownOpen && !entityCombo.contains(e.target as Node)) closeEntityDropdown();
  });

  function renderEntityDropdown(): void {
    clear(entityDropdown);
    if (!entityDropdownOpen) return;
    const term = state.entitySearch.trim().toLowerCase();
    const filtered = state.entities.filter((entity) => {
      if (state.solutionEntityIds && (!entity.metadataId || !state.solutionEntityIds.has(entity.metadataId))) {
        return false;
      }
      if (!term) return true;
      return entity.displayName.toLowerCase().includes(term) || entity.logicalName.includes(term);
    });

    if (!state.entitiesLoaded) {
      entityDropdown.append(el('div', { class: 'empty' }, 'Loading…'));
      return;
    }
    if (filtered.length === 0) {
      entityDropdown.append(el('div', { class: 'empty' }, 'No tables match.'));
      return;
    }
    renderGroupedEntities(entityDropdown, filtered.slice(0, 200), state.configuredEntityNames, renderEntityOption);
    if (filtered.length > 200) {
      entityDropdown.append(el('div', { class: 'empty' }, `…and ${filtered.length - 200} more. Keep typing.`));
    }
  }

  function renderEntityOption(entity: EntityInfo): HTMLElement {
    const selected = state.selectedEntity?.logicalName === entity.logicalName;
    return el(
      'button',
      {
        class: `list-item entity-row${selected ? ' selected' : ''}`,
        title: entity.logicalName,
        // mousedown fires before the input's blur/outside-click handling.
        onmousedown: ((e: Event) => {
          e.preventDefault();
          closeEntityDropdown();
          entityInput.value = entity.displayName;
          void controller.selectEntity(entity);
        }) as EventListener,
      },
      el('span', { class: 'list-item-primary' }, entity.displayName),
      el('span', { class: 'list-item-secondary' }, entity.logicalName)
    );
  }

  // ----- View selector -----
  const viewSelect = el('select', {
    class: 'select',
    title: 'View: scopes the columns list and the preview records',
    onchange: () => void controller.selectView(viewSelect.value || null),
  });

  // ----- Sample-record picker -----
  const recordSelect = el('select', {
    class: 'select',
    title: 'Record used by the live preview',
    onchange: () => void controller.selectSampleRecord(recordSelect.value),
  });

  // ----- Column palette -----
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
  const attributeHint = el('div', { class: 'hint' }, 'Click a column to add it, or drag it into the name pattern.');

  const viewSection = el('div', { class: 'sidebar-section' },
    el('div', { class: 'sidebar-heading' }, 'View & Sample Record'),
    viewSelect,
    recordSelect
  );
  viewSection.style.display = 'none';

  root.append(
    el('div', { class: 'sidebar-section' },
      el('div', { class: 'sidebar-heading' }, 'Solution & Table'),
      solutionSelect,
      entityCombo
    ),
    viewSection,
    attributeHeader,
    attributeHint,
    attributeSearch,
    attributeList
  );

  function renderSolutions(): void {
    clear(solutionSelect);
    solutionSelect.append(el('option', { value: '' }, 'All solutions'));
    appendSolutionOptions(solutionSelect, state.solutions, state.preferredSolutionId, (s) => s.id);
    solutionSelect.value = state.solutionFilterId ?? '';
  }

  function renderViews(): void {
    viewSection.style.display = state.selectedEntity ? '' : 'none';
    clear(viewSelect);
    viewSelect.append(el('option', { value: '' }, 'All columns / recent records'));
    const system = state.views.filter((v) => !v.isPersonal);
    const personal = state.views.filter((v) => v.isPersonal);
    if (personal.length) {
      const group = el('optgroup', { label: 'Personal views' });
      personal.forEach((v) => group.append(el('option', { value: v.id }, v.name)));
      viewSelect.append(group);
    }
    if (system.length) {
      const group = el('optgroup', { label: 'System views' });
      system.forEach((v) => group.append(el('option', { value: v.id }, v.name)));
      viewSelect.append(group);
    }
    viewSelect.value = state.selectedViewId ?? '';
  }

  function renderRecords(): void {
    clear(recordSelect);
    if (state.sampleRecords.length === 0) {
      recordSelect.append(el('option', { value: '' }, state.selectedEntity ? 'No records found' : '—'));
      recordSelect.disabled = true;
      return;
    }
    recordSelect.disabled = false;
    for (const record of state.sampleRecords) {
      recordSelect.append(el('option', { value: record.id }, record.label));
    }
    if (state.selectedRecordId) recordSelect.value = state.selectedRecordId;
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
      .filter((attr) => !state.viewColumns || state.viewColumns.has(attr.logicalName))
      .filter((attr) => !term || attr.displayName.toLowerCase().includes(term) || attr.logicalName.includes(term))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    if (usable.length === 0) {
      attributeList.append(el('div', { class: 'empty' },
        state.attributes.size === 0
          ? 'Loading…'
          : state.viewColumns
            ? 'No usable columns in this view — pick another view or "All columns".'
            : 'No columns match.'));
      return;
    }

    for (const attr of usable) {
      attributeList.append(renderAttributeItem(attr));
    }
  }

  function renderAttributeItem(attr: AttributeInfo): HTMLElement {
    const item = el(
      'button',
      {
        class: 'list-item attribute-item',
        title: `${attr.logicalName} (${attr.attributeType}) — click to add, or drag into the pattern`,
        draggable: 'true',
        onclick: () => controller.addField(attr.logicalName),
        ondragstart: ((e: DragEvent) => {
          e.dataTransfer?.setData(NEW_FIELD_DRAG_TYPE, attr.logicalName);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
          item.classList.add('dragging');
        }) as EventListener,
        ondragend: (() => item.classList.remove('dragging')) as EventListener,
      },
      el('span', { class: `type-badge type-${attr.fieldType}` }, TYPE_BADGES[attr.fieldType ?? ''] ?? '?'),
      el('span', { class: 'list-item-primary' }, attr.displayName),
      el('span', { class: 'list-item-secondary' }, attr.logicalName),
      el('span', { class: 'add-icon', 'aria-hidden': 'true' }, '+')
    );
    return item;
  }

  store.on('entities', () => {
    renderSolutions();
    if (entityDropdownOpen) renderEntityDropdown();
  });
  store.on('entity', () => {
    entityInput.value = state.selectedEntity?.displayName ?? '';
    renderViews();
    renderRecords();
  });
  store.on('views', renderViews);
  store.on('records', renderRecords);
  store.on('attributes', () => {
    attributeSearch.value = state.attributeSearch;
    renderAttributeList();
  });

  renderSolutions();
  renderViews();
  renderRecords();
  renderAttributeList();
}
