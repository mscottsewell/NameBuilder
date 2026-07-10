/**
 * Right panel: live preview against a sample record, block-by-block
 * breakdown, and the JSON configuration (view / copy / import / export).
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import { buildPreview } from '../engine';
import { serializeConfig } from '../model';
import { toast } from './toast';

export function mountPreview(root: HTMLElement, controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  const recordSearch = el('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Search recent records…',
    oninput: () => {
      state.recordSearch = recordSearch.value;
      controller.searchSampleRecords();
    },
  });

  const recordSelect = el('select', {
    class: 'select',
    onchange: () => void controller.selectSampleRecord(recordSelect.value),
  });

  const previewName = el('div', { class: 'preview-name' });
  const previewMeta = el('div', { class: 'preview-meta' });
  const partsList = el('div', { class: 'preview-parts' });

  const jsonArea = el('textarea', {
    class: 'json-area',
    spellcheck: 'false',
    rows: '14',
  }) as HTMLTextAreaElement;
  let jsonDirty = false;
  jsonArea.addEventListener('input', () => {
    jsonDirty = true;
    applyButton.disabled = false;
  });

  const applyButton = el('button', {
    class: 'btn btn-small',
    disabled: true,
    onclick: () => {
      try {
        controller.importConfig(jsonArea.value);
        jsonDirty = false;
        applyButton.disabled = true;
      } catch (error) {
        toast(state.service, 'error', 'Invalid configuration JSON', (error as Error).message);
      }
    },
  }, 'Apply JSON');

  const copyButton = el('button', {
    class: 'btn btn-ghost btn-small',
    onclick: () => {
      void state.service.copyToClipboard(jsonArea.value).then(() =>
        toast(state.service, 'success', 'Configuration copied to clipboard'));
    },
  }, 'Copy');

  const exportButton = el('button', {
    class: 'btn btn-ghost btn-small',
    onclick: () => {
      const blob = new Blob([jsonArea.value], { type: 'application/json' });
      const link = el('a', {
        href: URL.createObjectURL(blob),
        download: `namebuilder-${state.selectedEntity?.logicalName ?? 'config'}.json`,
      });
      link.click();
      URL.revokeObjectURL(link.href);
    },
  }, 'Export');

  const importInput = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden-input' }) as HTMLInputElement;
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        controller.importConfig(text);
        jsonDirty = false;
      } catch (error) {
        toast(state.service, 'error', 'Could not import file', (error as Error).message);
      }
    });
    importInput.value = '';
  });

  const importButton = el('button', {
    class: 'btn btn-ghost btn-small',
    onclick: () => importInput.click(),
  }, 'Import…');

  root.append(
    el('div', { class: 'panel-section' },
      el('div', { class: 'sidebar-heading' }, 'Live preview'),
      recordSearch,
      recordSelect,
      previewName,
      previewMeta,
      partsList
    ),
    el('div', { class: 'panel-section json-section' },
      el('div', { class: 'section-head' },
        el('span', { class: 'sidebar-heading' }, 'Configuration JSON'),
        el('div', { class: 'btn-row' }, applyButton, copyButton, importButton, exportButton)
      ),
      jsonArea,
      importInput
    )
  );

  function renderRecords(): void {
    clear(recordSelect);
    if (state.sampleRecords.length === 0) {
      recordSelect.append(el('option', { value: '' }, state.selectedEntity ? 'No records found' : 'Select a table first'));
      recordSelect.disabled = true;
      return;
    }
    recordSelect.disabled = false;
    for (const record of state.sampleRecords) {
      recordSelect.append(el('option', { value: record.id }, record.label));
    }
    if (state.selectedRecordId) recordSelect.value = state.selectedRecordId;
  }

  function renderPreview(): void {
    clear(previewName);
    clear(previewMeta);
    clear(partsList);

    if (!state.selectedEntity || state.config.fields.length === 0) {
      previewName.append(el('span', { class: 'preview-empty' }, '— add blocks to see a preview —'));
      renderJson();
      return;
    }

    const result = buildPreview(state.config, state.recordView, {
      attributes: state.attributes,
      currencySymbol: state.currencySymbol,
    });

    previewName.textContent = result.name || '(empty)';
    previewMeta.textContent =
      `${result.name.length} characters` +
      (state.config.maxLength ? ` of ${state.config.maxLength} max` : '') +
      (result.truncated ? ' — truncated' : '');

    for (const part of result.parts) {
      partsList.append(
        el('div', { class: `preview-part${part.included ? '' : ' excluded'}` },
          el('span', { class: 'preview-part-field' }, part.field),
          el('span', { class: 'preview-part-value' }, part.included ? (part.text || '∅') : 'excluded'),
          part.note ? el('span', { class: 'preview-part-note' }, part.note) : null
        )
      );
    }

    renderJson();
  }

  function renderJson(): void {
    // Don't clobber in-progress manual edits.
    if (jsonDirty) return;
    jsonArea.value = serializeConfig(state.config);
  }

  store.on('records', renderRecords);
  store.on('preview', renderPreview);
  store.on('config', () => {
    jsonDirty = false;
    applyButton.disabled = true;
    renderPreview();
  });
  store.on('entity', () => {
    jsonDirty = false;
    renderRecords();
    renderPreview();
  });

  renderRecords();
  renderPreview();
}
