/**
 * "Field defaults" modal: edit the reusable prefix/suffix/format/timezone
 * defaults (applied to new blocks and propagated to matching existing ones),
 * toggle auto-loading of deployed configurations, and re-apply defaults to all
 * blocks. Mirrors the XrmToolBox configurator's Default Field Properties.
 */

import { el } from './dom';
import type { Controller } from '../controller';
import type { FieldDefaults } from '../model';

export function openDefaultsDialog(controller: Controller): void {
  const state = controller.store.state;
  const defaults = state.fieldDefaults;

  const overlay = el('div', { class: 'modal-overlay' });

  const commit = (patch: Partial<FieldDefaults>) => controller.updateFieldDefaults(patch);

  const prefix = textField('Default separator (prefix)', defaults.prefix, 'e.g. " - "',
    (v) => commit({ prefix: v }), 'Prepended to each new block after the first.');
  const suffix = textField('Default suffix', defaults.suffix, '',
    (v) => commit({ suffix: v }));
  const dateFormat = textField('Default date format', defaults.dateFormat, 'yyyy-MM-dd',
    (v) => commit({ dateFormat: v }), 'Applied to new date/datetime blocks.');
  const numberFormat = textField('Default number format', defaults.numberFormat, '#,##0.##',
    (v) => commit({ numberFormat: v }), 'Applied to new number/currency blocks.');

  const timezone = el('input', {
    class: 'input input-small',
    type: 'number',
    step: '0.5',
    value: String(defaults.timezoneOffsetHours),
    oninput: () => {
      const parsed = parseFloat(timezone.value);
      commit({ timezoneOffsetHours: Number.isNaN(parsed) ? 0 : parsed });
    },
  });
  const timezoneField = el('label', { class: 'field' },
    el('span', { class: 'field-label' }, 'Default timezone offset (hours)'),
    timezone,
    el('span', { class: 'field-hint' }, 'Applied to new date/datetime blocks; e.g. -5 for EST.')
  );

  const autoLoad = el('input', { type: 'checkbox' }) as HTMLInputElement;
  autoLoad.checked = state.autoLoadPublished;
  autoLoad.addEventListener('change', () => controller.setAutoLoadPublished(autoLoad.checked));

  const reapply = el('button', {
    class: 'btn btn-small',
    onclick: () => controller.reapplyDefaultsToAll(),
  }, 'Apply defaults to all existing blocks');

  const close = el('button', { class: 'btn btn-ghost', onclick: () => overlay.remove() }, 'Done');

  const dialog = el('div', { class: 'modal' },
    el('h2', {}, 'Field defaults'),
    el('p', { class: 'field-hint' }, 'Changes apply to new blocks and update existing blocks that still use the previous default.'),
    el('div', { class: 'editor-grid' }, prefix, suffix, dateFormat, numberFormat, timezoneField),
    el('div', { class: 'editor-section' },
      el('label', { class: 'inline-label' }, autoLoad, ' Auto-load the deployed configuration when I pick a table'),
      reapply
    ),
    el('div', { class: 'modal-actions' }, close)
  );

  overlay.append(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.append(overlay);
}

function textField(
  labelText: string,
  value: string,
  placeholder: string,
  apply: (v: string) => void,
  hint?: string
): HTMLElement {
  const input = el('input', {
    class: 'input',
    type: 'text',
    value,
    placeholder,
    oninput: () => apply(input.value),
  });
  return el('label', { class: 'field' },
    el('span', { class: 'field-label' }, labelText),
    input,
    hint ? el('span', { class: 'field-hint' }, hint) : null
  );
}
