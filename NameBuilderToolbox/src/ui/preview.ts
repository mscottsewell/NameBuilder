/**
 * Live preview strip: rendered full-width at the top of the designer cell.
 * Shows the assembled name for the selected sample record plus a per-block
 * breakdown. The record picker lives in the sidebar; the JSON view lives in
 * the right-hand Properties/JSON panel.
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import { buildPreview } from '../engine';

export function mountLivePreview(root: HTMLElement, controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  const previewName = el('div', { class: 'preview-name' });
  const previewMeta = el('div', { class: 'preview-meta' });
  const partsList = el('div', { class: 'preview-parts preview-parts-row' });

  root.append(
    el('div', { class: 'live-preview-strip' },
      el('div', { class: 'sidebar-heading' }, 'Live preview'),
      previewName,
      previewMeta,
      partsList
    )
  );

  function renderPreview(): void {
    clear(previewName);
    clear(previewMeta);
    clear(partsList);

    if (!state.selectedEntity || state.config.fields.length === 0) {
      previewName.append(el('span', { class: 'preview-empty' }, '— add blocks to see a preview —'));
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
  }

  store.on('preview', renderPreview);
  store.on('config', renderPreview);
  store.on('entity', renderPreview);

  renderPreview();
}
