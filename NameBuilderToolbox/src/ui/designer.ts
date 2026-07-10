/**
 * Center panel: the name-pattern designer. Blocks render as cards that can be
 * reordered, expanded, and edited. Editor inputs mutate the config silently
 * and refresh only the preview so typing stays smooth.
 */

import { clear, el, fragment } from './dom';
import type { Controller } from '../controller';
import type { FieldCondition, FieldConfig, FieldType } from '../model';
import { CONDITION_OPERATORS } from '../model';
import { mountLivePreview } from './preview';
import { NEW_FIELD_DRAG_TYPE, REORDER_DRAG_TYPE } from './dragTypes';

const FIELD_TYPES: FieldType[] = ['string', 'lookup', 'date', 'number', 'currency', 'optionset'];

const DATE_FORMAT_PRESETS = [
  'yyyy-MM-dd', 'MM/dd/yyyy', 'dd.MM.yyyy', 'yyyy.MM.dd', 'yyyyMMdd',
  'MMM d, yyyy', 'MMMM yyyy', 'yyyy MMM', "upper:yyyyMMM", 'title:MMMM', 'HH:mm',
];
const NUMBER_FORMAT_PRESETS = ['#,##0', '#,##0.00', '0', '0.0', '0.0K', '0.00M', '0B'];

export function mountDesigner(root: HTMLElement, controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  const previewHost = el('div', { class: 'designer-preview' });
  const header = el('div', { class: 'designer-header' });
  const blockList = el('div', { class: 'block-list' });

  root.append(previewHost, header, blockList);
  mountLivePreview(previewHost, controller);

  // ----- Drag & drop: add a column between blocks, or reorder existing blocks -----

  const dropIndicator = el('div', { class: 'drop-indicator' });

  function getBlockCards(): HTMLElement[] {
    return [...blockList.querySelectorAll(':scope > .block-card')] as HTMLElement[];
  }

  /** Index (0..count) where a drop at this Y position would land, ignoring the indicator itself. */
  function computeDropIndex(clientY: number): number {
    const cards = getBlockCards();
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }

  function hideDropIndicator(): void {
    if (dropIndicator.parentElement) dropIndicator.remove();
  }

  blockList.addEventListener('dragover', (e: DragEvent) => {
    const types = e.dataTransfer?.types ?? [];
    const isReorder = types.includes(REORDER_DRAG_TYPE);
    if (!isReorder && !types.includes(NEW_FIELD_DRAG_TYPE)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = isReorder ? 'move' : 'copy';
    const index = computeDropIndex(e.clientY);
    blockList.insertBefore(dropIndicator, getBlockCards()[index] ?? null);
  });

  blockList.addEventListener('drop', (e: DragEvent) => {
    const newField = e.dataTransfer?.getData(NEW_FIELD_DRAG_TYPE);
    const reorderFrom = e.dataTransfer?.getData(REORDER_DRAG_TYPE);
    const index = computeDropIndex(e.clientY);
    hideDropIndicator();
    if (!newField && !reorderFrom) return;
    e.preventDefault();
    if (newField) {
      controller.addField(newField, index);
    } else if (reorderFrom) {
      controller.moveFieldTo(parseInt(reorderFrom, 10), index);
    }
  });

  // Safety net: if a drag (from the sidebar's column list or a block's drag
  // handle) ends without a valid drop — e.g. released outside the pattern
  // list — make sure the indicator never gets stuck on screen.
  document.addEventListener('dragend', hideDropIndicator);

  function displayNameFor(logicalName: string): string {
    return state.attributes.get(logicalName.toLowerCase())?.displayName ?? logicalName;
  }

  function renderHeader(): void {
    clear(header);
    if (!state.selectedEntity) return;

    header.append(
      el('div', { class: 'designer-title' },
        el('h2', {}, 'Name pattern'),
        el('span', { class: 'target-chip', title: 'The column the plugin will populate (change it in Properties)' },
          `→ ${displayNameFor(state.config.targetField)} (${state.config.targetField})`)
      ),
      el('div', { class: 'designer-settings' },
        !state.service.isDemo
          ? el('button', {
              class: 'btn btn-ghost btn-small',
              title: 'Reload the configuration currently deployed for this table',
              onclick: () => void controller.reloadPublishedConfig(),
            }, 'Reload deployed')
          : null
      )
    );
  }

  function renderBlocks(): void {
    clear(blockList);
    if (!state.selectedEntity) {
      blockList.append(
        el('div', { class: 'placeholder' },
          el('div', { class: 'placeholder-icon' }, '⧉'),
          el('h3', {}, 'Design an automatic record name'),
          el('p', {}, 'Pick a table on the left, then click or drag columns to add them as building blocks. Configure separators, formats, and conditions — the preview updates live.')
        )
      );
      return;
    }
    if (state.config.fields.length === 0) {
      blockList.append(
        el('div', { class: 'placeholder' },
          el('p', {}, 'No blocks yet — click a column in the left panel to add the first one.')
        )
      );
      return;
    }

    state.config.fields.forEach((field, index) => {
      blockList.append(renderBlockCard(field, index));
    });
  }

  function summaryChips(field: FieldConfig): DocumentFragment {
    const chips: (HTMLElement | null)[] = [];
    if (field.prefix) chips.push(el('span', { class: 'chip' }, `“${field.prefix}”+`));
    if (field.suffix) chips.push(el('span', { class: 'chip' }, `+“${field.suffix}”`));
    if (field.format) chips.push(el('span', { class: 'chip' }, field.format));
    if (field.default) chips.push(el('span', { class: 'chip' }, `default: ${field.default}`));
    if (field.alternateField?.field) chips.push(el('span', { class: 'chip' }, `alt: ${field.alternateField.field}`));
    if (field.includeIf) chips.push(el('span', { class: 'chip chip-condition' }, 'conditional'));
    if (field.maxLength) chips.push(el('span', { class: 'chip' }, `≤${field.maxLength}`));
    if (field.timezoneOffsetHours) chips.push(el('span', { class: 'chip' }, `UTC${field.timezoneOffsetHours > 0 ? '+' : ''}${field.timezoneOffsetHours}`));
    return fragment(...chips);
  }

  /** Shared drag-handle behavior applied to both the order badge and the field name. */
  function dragHandleAttrs(card: HTMLElement, index: number): Record<string, string | EventListener> {
    return {
      draggable: 'true',
      ondragstart: ((e: DragEvent) => {
        e.dataTransfer?.setData(REORDER_DRAG_TYPE, String(index));
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setDragImage(card, 16, 16);
        }
        card.classList.add('dragging');
      }) as EventListener,
      ondragend: (() => {
        card.classList.remove('dragging');
        hideDropIndicator();
      }) as EventListener,
    };
  }

  function renderBlockCard(field: FieldConfig, index: number): HTMLElement {
    const expanded = state.expandedBlock === index;

    const card = el('div', { class: `block-card${expanded ? ' expanded' : ''}` });
    const orderBadge = el('span', {
      class: 'block-order',
      title: 'Drag to reorder',
      ...dragHandleAttrs(card, index),
    }, String(index + 1));

    const head = el(
      'div',
      { class: 'block-head', onclick: () => controller.toggleBlockEditor(index) },
      orderBadge,
      el('div', {
        class: 'block-name',
        title: 'Drag to reorder',
        ...dragHandleAttrs(card, index),
      },
        el('span', { class: 'block-display' }, displayNameFor(field.field)),
        el('span', { class: 'block-logical' }, `${field.field} · ${field.type ?? 'auto'}`)
      ),
      el('div', { class: 'block-chips' }, summaryChips(field)),
      el('div', { class: 'block-actions' },
        iconButton('↑', 'Move up', (e) => { e.stopPropagation(); controller.moveField(index, -1); }, index === 0),
        iconButton('↓', 'Move down', (e) => { e.stopPropagation(); controller.moveField(index, 1); }, index === state.config.fields.length - 1),
        iconButton(expanded ? '▾' : '✎', expanded ? 'Collapse' : 'Edit block', (e) => { e.stopPropagation(); controller.toggleBlockEditor(index); }),
        iconButton('✕', 'Remove block', (e) => { e.stopPropagation(); controller.removeField(index); })
      )
    );
    card.append(head);
    if (expanded) card.append(renderBlockEditor(field));
    return card;
  }

  function iconButton(label: string, title: string, onclick: (e: MouseEvent) => void, disabled = false): HTMLElement {
    return el('button', { class: 'icon-btn', title, onclick: onclick as EventListener, disabled }, label);
  }

  function textInput(value: string | undefined, placeholder: string, apply: (v: string) => void, listId?: string): HTMLInputElement {
    const input = el('input', {
      class: 'input',
      type: 'text',
      value: value ?? '',
      placeholder,
      list: listId,
      oninput: () => {
        apply(input.value);
        controller.configTouched();
      },
    });
    return input;
  }

  function numberInput(value: number | undefined, placeholder: string, apply: (v: number | undefined) => void, step = '1'): HTMLInputElement {
    const input = el('input', {
      class: 'input input-small',
      type: 'number',
      step,
      value: value !== undefined ? String(value) : '',
      placeholder,
      oninput: () => {
        const parsed = parseFloat(input.value);
        apply(Number.isNaN(parsed) ? undefined : parsed);
        controller.configTouched();
      },
    });
    return input;
  }

  function labeled(text: string, control: HTMLElement, hint?: string): HTMLElement {
    return el('label', { class: 'field' },
      el('span', { class: 'field-label' }, text),
      control,
      hint ? el('span', { class: 'field-hint' }, hint) : null
    );
  }

  function formatEditor(field: FieldConfig): HTMLElement | null {
    const type = field.type ?? 'string';
    if (type === 'date' || type === 'datetime') {
      return labeled('Date format', textInput(field.format, 'yyyy-MM-dd', (v) => (field.format = v || undefined), 'date-formats'),
        'Supports upper:/lower:/title: casing, e.g. upper:MMM → JAN');
    }
    if (type === 'number' || type === 'currency') {
      return labeled('Number format', textInput(field.format, type === 'currency' ? '#,##0.00' : '#,##0.##', (v) => (field.format = v || undefined), 'number-formats'),
        'End with K, M, or B to scale, e.g. 0.00M → 2.50M');
    }
    return null;
  }

  function renderBlockEditor(field: FieldConfig): HTMLElement {
    const editor = el('div', { class: 'block-editor' });

    const typeSelect = el('select', {
      class: 'select',
      onchange: () => {
        field.type = typeSelect.value as FieldType;
        controller.configTouched(true);
      },
    });
    for (const t of FIELD_TYPES) typeSelect.append(el('option', { value: t }, t));
    typeSelect.value = field.type ?? 'string';

    const row1 = el('div', { class: 'editor-grid' },
      labeled('Prefix', textInput(field.prefix, 'e.g. " | "', (v) => (field.prefix = v || undefined)), 'Added before the value (only when a value exists)'),
      labeled('Suffix', textInput(field.suffix, 'e.g. " "', (v) => (field.suffix = v || undefined)), 'Added after the value'),
      labeled('Type', typeSelect),
      formatEditor(field)
    );

    const row2 = el('div', { class: 'editor-grid' },
      labeled('Default value', textInput(field.default, 'Used when the column is empty', (v) => (field.default = v || undefined))),
      labeled('Max length', numberInput(field.maxLength, 'none', (v) => (field.maxLength = v))),
      labeled('Truncation indicator', textInput(field.truncationIndicator === '...' ? '' : field.truncationIndicator, '…default: ...', (v) => (field.truncationIndicator = v || undefined))),
      (field.type === 'date' || field.type === 'datetime')
        ? labeled('Timezone offset (hours)', numberInput(field.timezoneOffsetHours, '0 = UTC', (v) => (field.timezoneOffsetHours = v), '0.5'),
            'Dates are stored in UTC; e.g. -5 for EST, 5.5 for IST')
        : null
    );

    editor.append(row1, row2, renderAlternateSection(field, 0), renderConditionSection(field));
    // Prevent header toggle when interacting with the editor.
    editor.addEventListener('click', (e) => e.stopPropagation());
    return editor;
  }

  function attributeSelect(current: string | undefined, apply: (v: string) => void, includeEmpty = false, emptyLabel = '(select column)'): HTMLSelectElement {
    const select = el('select', {
      class: 'select',
      onchange: () => {
        apply(select.value);
        controller.configTouched(true);
      },
    });
    if (includeEmpty) select.append(el('option', { value: '' }, emptyLabel));
    const attrs = [...state.attributes.values()]
      .filter((a) => a.fieldType !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const attr of attrs) {
      select.append(el('option', { value: attr.logicalName }, `${attr.displayName} (${attr.logicalName})`));
    }
    select.value = current ?? '';
    return select;
  }

  function renderAlternateSection(field: FieldConfig, depth: number): HTMLElement {
    const section = el('div', { class: 'editor-section' });
    const title = depth === 0 ? 'Alternate column' : `Then try`;

    if (!field.alternateField?.field) {
      section.append(
        el('div', { class: 'section-head' },
          el('span', { class: 'section-title' }, title),
          el('button', {
            class: 'btn btn-ghost btn-small',
            onclick: () => {
              field.alternateField = { field: '' };
              controller.configTouched(true);
            },
          }, '+ Add fallback')
        ),
        el('div', { class: 'field-hint' }, 'Used when the primary column is empty — e.g. contact → account → default text.')
      );
      return section;
    }

    const alt = field.alternateField;
    const grid = el('div', { class: 'editor-grid' },
      labeled('Column', attributeSelect(alt.field, (v) => {
        alt.field = v;
        alt.type = state.attributes.get(v.toLowerCase())?.fieldType ?? undefined;
      }, true)),
      formatEditor(alt),
      labeled('Default value', textInput(alt.default, '', (v) => (alt.default = v || undefined)))
    );

    section.append(
      el('div', { class: 'section-head' },
        el('span', { class: 'section-title' }, title),
        el('button', {
          class: 'btn btn-ghost btn-small',
          onclick: () => {
            field.alternateField = undefined;
            controller.configTouched(true);
          },
        }, 'Remove')
      ),
      grid
    );
    if (depth < 3) section.append(renderAlternateSection(alt, depth + 1));
    return section;
  }

  function conditionRow(cond: FieldCondition, onRemove: (() => void) | null): HTMLElement {
    const operatorSelect = el('select', {
      class: 'select',
      onchange: () => {
        cond.operator = operatorSelect.value;
        controller.configTouched(true);
      },
    });
    for (const op of CONDITION_OPERATORS) {
      operatorSelect.append(el('option', { value: op.value }, op.label));
    }
    operatorSelect.value = cond.operator ?? 'equals';
    if (!cond.operator) cond.operator = 'equals';

    const needsValue = CONDITION_OPERATORS.find((o) => o.value === operatorSelect.value)?.needsValue ?? true;

    const valueControl = renderConditionValueControl(cond, needsValue);

    return el('div', { class: 'condition-row' },
      attributeSelectForCondition(cond),
      operatorSelect,
      valueControl,
      onRemove
        ? el('button', { class: 'icon-btn', title: 'Remove condition', onclick: () => { onRemove(); } }, '✕')
        : null
    );
  }

  function attributeSelectForCondition(cond: FieldCondition): HTMLSelectElement {
    // Conditions may reference any readable column, including types that
    // can't be used as blocks (e.g. booleans).
    const select = el('select', {
      class: 'select',
      onchange: () => {
        cond.field = select.value;
        controller.configTouched(true);
      },
    });
    select.append(el('option', { value: '' }, '(select column)'));
    const attrs = [...state.attributes.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const attr of attrs) {
      select.append(el('option', { value: attr.logicalName }, `${attr.displayName} (${attr.logicalName})`));
    }
    select.value = cond.field ?? '';
    return select;
  }

  function renderConditionValueControl(cond: FieldCondition, needsValue: boolean): HTMLElement {
    if (!needsValue) {
      cond.value = undefined;
      return el('span', { class: 'field-hint' }, '—');
    }
    const attr = cond.field ? state.attributes.get(cond.field.toLowerCase()) : undefined;
    // Optionset comparisons match on the numeric value; offer labels for convenience.
    if (attr?.options && attr.options.size > 0) {
      const select = el('select', {
        class: 'select',
        onchange: () => {
          cond.value = select.value;
          controller.configTouched(true);
        },
      });
      select.append(el('option', { value: '' }, '(value)'));
      for (const [value, optionLabel] of attr.options) {
        select.append(el('option', { value: String(value) }, `${optionLabel} (${value})`));
      }
      select.value = cond.value ?? '';
      return select;
    }
    return textInput(cond.value, 'value', (v) => (cond.value = v || undefined));
  }

  function renderConditionSection(field: FieldConfig): HTMLElement {
    const section = el('div', { class: 'editor-section' });
    const cond = field.includeIf;

    const modeOf = (c: FieldCondition | undefined): 'none' | 'single' | 'anyOf' | 'allOf' =>
      !c ? 'none' : c.anyOf?.length ? 'anyOf' : c.allOf?.length ? 'allOf' : 'single';

    const mode = modeOf(cond);

    const modeSelect = el('select', {
      class: 'select',
      onchange: () => {
        switch (modeSelect.value) {
          case 'none':
            field.includeIf = undefined;
            break;
          case 'single':
            field.includeIf = { field: cond?.anyOf?.[0]?.field ?? cond?.allOf?.[0]?.field ?? cond?.field, operator: 'equals' };
            break;
          case 'anyOf':
            field.includeIf = { anyOf: cond && modeOf(cond) === 'single' ? [cond] : cond?.allOf ?? [{ operator: 'equals' }] };
            break;
          case 'allOf':
            field.includeIf = { allOf: cond && modeOf(cond) === 'single' ? [cond] : cond?.anyOf ?? [{ operator: 'equals' }] };
            break;
        }
        controller.configTouched(true);
      },
    },
      el('option', { value: 'none' }, 'Always include'),
      el('option', { value: 'single' }, 'Include when…'),
      el('option', { value: 'anyOf' }, 'Include when ANY of…'),
      el('option', { value: 'allOf' }, 'Include when ALL of…')
    );
    modeSelect.value = mode;

    section.append(
      el('div', { class: 'section-head' },
        el('span', { class: 'section-title' }, 'Condition'),
        modeSelect
      )
    );

    if (mode === 'single' && cond) {
      section.append(conditionRow(cond, null));
    } else if ((mode === 'anyOf' || mode === 'allOf') && cond) {
      const list = mode === 'anyOf' ? cond.anyOf! : cond.allOf!;
      const rows = el('div', { class: 'condition-list' });
      list.forEach((sub, i) => {
        rows.append(conditionRow(sub, () => {
          list.splice(i, 1);
          if (list.length === 0) field.includeIf = undefined;
          controller.configTouched(true);
        }));
      });
      section.append(
        rows,
        el('button', {
          class: 'btn btn-ghost btn-small',
          onclick: () => {
            list.push({ operator: 'equals' });
            controller.configTouched(true);
          },
        }, '+ Add condition')
      );
    }

    return section;
  }

  // Format preset datalists (shared by all editors).
  const dateList = el('datalist', { id: 'date-formats' });
  DATE_FORMAT_PRESETS.forEach((f) => dateList.append(el('option', { value: f })));
  const numberList = el('datalist', { id: 'number-formats' });
  NUMBER_FORMAT_PRESETS.forEach((f) => numberList.append(el('option', { value: f })));
  root.append(dateList, numberList);

  store.on('config', () => {
    renderHeader();
    renderBlocks();
  });
  store.on('entity', () => {
    renderHeader();
    renderBlocks();
  });
  store.on('attributes', () => {
    renderHeader();
    renderBlocks();
  });

  renderHeader();
  renderBlocks();
}
