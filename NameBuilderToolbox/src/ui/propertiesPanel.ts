/**
 * Properties and JSON tab content — two of the three tabs in the combined
 * Configuration/Properties/JSON pane (see ui/configPane.ts).
 *
 * Properties = Global Configuration (plugin solution, target field, max
 * length, tracing) + Default Field Properties (reusable prefix/suffix/
 * timezone/number/date defaults with propagation) — mirroring the XrmToolBox
 * configurator's property pane. JSON = the generated configuration with
 * Apply / Copy / Import / Export.
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import type { FieldDefaults } from '../model';
import { serializeConfig } from '../model';
import { toast } from './toast';

export function mountPropertiesTab(root: HTMLElement, controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  function labeled(text: string, control: HTMLElement, hint?: string): HTMLElement {
    return el('label', { class: 'field' },
      el('span', { class: 'field-label' }, text),
      control,
      hint ? el('span', { class: 'field-hint' }, hint) : null
    );
  }

  function timezoneOptions(select: HTMLSelectElement, current: number): void {
    for (let offset = -12; offset <= 14; offset += 0.5) {
      const label = offset === 0 ? 'UTC (±0)' : `UTC (${offset > 0 ? '+' : ''}${offset})`;
      select.append(el('option', { value: String(offset) }, label));
    }
    select.value = String(current);
  }

  function isKnownColumn(logicalName: string): boolean {
    if (state.attributes.size === 0) return true; // metadata still loading — don't warn yet
    return state.attributes.has(logicalName.trim().toLowerCase());
  }

  function defaultsText(value: string, placeholder: string, apply: (v: string) => void): HTMLInputElement {
    const input = el('input', {
      class: 'input',
      type: 'text',
      value,
      placeholder,
      spellcheck: 'false',
      oninput: () => apply(input.value),
    });
    return input;
  }

  function renderProperties(): void {
    clear(root);
    if (!state.selectedEntity) {
      root.append(el('div', { class: 'empty' }, 'Select a table to edit its configuration.'));
      return;
    }

    // ----- Global Configuration -----
    const solutionSelect = el('select', {
      class: 'select',
      onchange: () => {
        controller.setPublishSolution(solutionSelect.value || null);
        // Re-render: the "following the Table filter" hint must flip off now
        // that the choice is explicit, and setPublishSolution emits no topic.
        renderProperties();
      },
    });
    solutionSelect.append(el('option', { value: '' }, '(Default solution)'));
    for (const solution of state.solutions.filter((s) => !s.isManaged)) {
      solutionSelect.append(el('option', { value: solution.uniqueName }, solution.friendlyName));
    }
    solutionSelect.value = controller.getEffectivePublishSolution() ?? '';

    const targetField = el('input', {
      class: 'input',
      type: 'text',
      value: state.config.targetField,
      spellcheck: 'false',
      oninput: () => {
        controller.setTargetField(targetField.value);
        targetField.classList.toggle('input-warning', !isKnownColumn(targetField.value));
      },
    });
    targetField.classList.toggle('input-warning', !isKnownColumn(state.config.targetField));

    const maxLength = el('input', {
      class: 'input input-small',
      type: 'number',
      min: '0',
      value: state.config.maxLength !== undefined ? String(state.config.maxLength) : '0',
      oninput: () => {
        const parsed = parseInt(maxLength.value, 10);
        state.config.maxLength = Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
        controller.configTouched();
      },
    });

    const tracing = el('input', {
      type: 'checkbox',
      onchange: () => {
        state.config.enableTracing = tracing.checked ? true : undefined;
        controller.configTouched();
      },
    }) as HTMLInputElement;
    tracing.checked = state.config.enableTracing === true;

    const autoLoad = el('input', { type: 'checkbox' }) as HTMLInputElement;
    autoLoad.checked = state.autoLoadPublished;
    autoLoad.addEventListener('change', () => controller.setAutoLoadPublished(autoLoad.checked));

    const executionOrder = el('input', {
      class: 'input input-small',
      type: 'number',
      min: '1',
      step: '1',
      value: String(state.executionOrder),
      oninput: () => {
        const parsed = parseInt(executionOrder.value, 10);
        controller.setExecutionOrder(Number.isNaN(parsed) ? 1 : parsed);
      },
    });

    // ----- Default Field Properties -----
    const defaults = state.fieldDefaults;
    const commit = (patch: Partial<FieldDefaults>) => controller.updateFieldDefaults(patch);

    const defaultPrefix = defaultsText(defaults.prefix, 'e.g. " - "', (v) => commit({ prefix: v }));
    const defaultSuffix = defaultsText(defaults.suffix, '', (v) => commit({ suffix: v }));
    const defaultNumber = defaultsText(defaults.numberFormat, 'e.g. #,##0.00 or 0.0K', (v) => commit({ numberFormat: v }));
    const defaultDate = defaultsText(defaults.dateFormat, 'e.g. yyyy-MM-dd or dd/MM/yyyy', (v) => commit({ dateFormat: v }));

    const defaultTimezone = el('select', {
      class: 'select',
      onchange: () => commit({ timezoneOffsetHours: parseFloat(defaultTimezone.value) || 0 }),
    });
    timezoneOptions(defaultTimezone, defaults.timezoneOffsetHours);

    const solutionHint = state.publishSolutionOverridden
      ? 'Publish registers the plugin steps into this solution.'
      : 'Publish registers the plugin steps into this solution. Following the Solution & Table filter — change here to override.';

    root.append(
      el('h3', { class: 'panel-title' }, 'Global Configuration'),
      labeled('Plugin Solution', solutionSelect, solutionHint),
      labeled('Target Field Name', targetField,
        isKnownColumn(state.config.targetField) ? undefined : 'Not found on this table — check the logical name.'),
      el('div', { class: 'field-row' },
        labeled('Global Max Length', maxLength, '(0 = no limit)'),
        labeled('Execution Order', executionOrder, 'Plugin step rank — lower runs first'),
        el('label', { class: 'inline-label tracing-check' }, tracing, ' Enable Tracing')
      ),
      el('label', { class: 'inline-label' }, autoLoad, ' Auto-load deployed configuration on table select'),

      el('h3', { class: 'panel-title section-gap' }, 'Default Field Properties'),
      el('p', { class: 'field-hint' }, 'These defaults will be applied to new fields and can update existing fields using defaults.'),
      labeled('Default Prefix', defaultPrefix),
      labeled('Default Suffix', defaultSuffix),
      labeled('Default Timezone', defaultTimezone),
      labeled('Default Number', defaultNumber),
      labeled('Default Date', defaultDate),
      el('button', {
        class: 'btn btn-small',
        onclick: () => controller.reapplyDefaultsToAll(),
      }, 'Apply defaults to all fields')
    );
  }

  store.on('entity', renderProperties);
  store.on('entities', renderProperties);
  store.on('attributes', renderProperties);
  store.on('config', () => {
    // Skip the rebuild while the user is typing in this panel — its inputs
    // are the *source* of those config changes, and a re-render would steal
    // focus on every keystroke. External config swaps (import, entity change,
    // reload deployed) never have focus here, so they re-render normally.
    if (!root.contains(document.activeElement)) renderProperties();
  });

  renderProperties();
}

export function mountJsonTab(root: HTMLElement, controller: Controller): void {
  const { store } = controller;
  const state = store.state;

  const jsonArea = el('textarea', {
    class: 'json-area',
    spellcheck: 'false',
    rows: '18',
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
    el('div', { class: 'btn-row' }, applyButton, copyButton, importButton, exportButton),
    jsonArea,
    importInput
  );

  function renderJson(): void {
    if (jsonDirty) return; // don't clobber in-progress manual edits
    jsonArea.value = serializeConfig(state.config);
  }

  store.on('entity', () => {
    jsonDirty = false;
    applyButton.disabled = true;
    renderJson();
  });
  store.on('config', () => {
    jsonDirty = false;
    applyButton.disabled = true;
    renderJson();
  });
  store.on('preview', renderJson);

  renderJson();
}
