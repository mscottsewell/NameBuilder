/**
 * Publish modal: shows server plugin status, lets the user choose which steps
 * to register (Create / Update) and an optional target solution, then runs
 * the publish pipeline with a progress log.
 */

import { clear, el } from './dom';
import type { Controller } from '../controller';
import { collectReferencedAttributes, serializeConfig } from '../model';
import { EMBEDDED_PLUGIN_VERSION, getServerPluginStatus, publishConfiguration } from '../publish';
import { toast } from './toast';

export function openPublishDialog(controller: Controller): void {
  const state = controller.store.state;
  const entity = state.selectedEntity;
  if (!entity) return;

  if (state.service.isDemo) {
    toast(state.service, 'warning', 'Demo mode', 'Publishing requires a Dataverse connection inside Power Platform ToolBox.');
    return;
  }
  if (state.config.fields.length === 0) {
    toast(state.service, 'warning', 'Nothing to publish', 'Add at least one block to the name pattern first.');
    return;
  }

  const overlay = el('div', { class: 'modal-overlay' });
  const statusLine = el('div', { class: 'publish-status' }, 'Checking plugin status…');

  const createCheck = checkbox('Register Create step', true);
  const updateCheck = checkbox('Register Update step (with PreImage)', true);

  const solutionSelect = el('select', { class: 'select' });
  solutionSelect.append(el('option', { value: '' }, 'Default solution (no solution)'));
  for (const solution of state.solutions.filter((s) => !s.isManaged)) {
    solutionSelect.append(el('option', { value: solution.uniqueName }, solution.friendlyName));
  }
  // Preselect the effective Plugin Solution from Global Configuration
  // (the user's explicit choice, or the Solution & Table filter as a default).
  solutionSelect.value = controller.getEffectivePublishSolution() ?? '';

  const log = el('div', { class: 'publish-log' });
  const appendLog = (message: string) => {
    log.append(el('div', { class: 'publish-log-line' }, message));
    log.scrollTop = log.scrollHeight;
  };

  const attributes = collectReferencedAttributes(state.config);

  const publishButton = el('button', {
    class: 'btn btn-primary',
    onclick: () => void runPublish(),
  }, 'Publish') as HTMLButtonElement;

  const closeButton = el('button', {
    class: 'btn btn-ghost',
    onclick: () => overlay.remove(),
  }, 'Close');

  const dialog = el('div', { class: 'modal' },
    el('h2', {}, `Publish to ${entity.displayName}`),
    statusLine,
    el('div', { class: 'publish-summary' },
      el('div', {}, el('strong', {}, 'Target column: '), `${state.config.targetField}`),
      el('div', {}, el('strong', {}, 'Trigger columns: '), attributes.join(', ') || '(none)')
    ),
    el('div', { class: 'publish-options' },
      createCheck.wrapper,
      updateCheck.wrapper,
      el('label', { class: 'field' },
        el('span', { class: 'field-label' }, 'Add to solution'),
        solutionSelect
      )
    ),
    log,
    el('div', { class: 'modal-actions' }, closeButton, publishButton)
  );

  overlay.append(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.append(overlay);

  void (async () => {
    try {
      const status = await getServerPluginStatus();
      clear(statusLine);
      if (!status.installed) {
        statusLine.append(`NameBuilder plugin is not installed — it will be installed automatically (v${EMBEDDED_PLUGIN_VERSION}).`);
      } else if (status.versionMismatch) {
        statusLine.append(`Server plugin v${status.serverVersion} differs from this tool's v${EMBEDDED_PLUGIN_VERSION} — it will be updated during publish.`);
        statusLine.classList.add('warning');
      } else {
        statusLine.append(`NameBuilder plugin v${status.serverVersion} is installed and current.`);
      }
    } catch (error) {
      clear(statusLine);
      statusLine.append(`Could not check plugin status: ${(error as Error).message}`);
      statusLine.classList.add('warning');
    }
  })();

  async function runPublish(): Promise<void> {
    if (!createCheck.input.checked && !updateCheck.input.checked) {
      toast(state.service, 'warning', 'Select at least one step', 'Choose Create, Update, or both.');
      return;
    }
    publishButton.disabled = true;
    clear(log);
    try {
      const outcome = await publishConfiguration({
        entity: entity!,
        configurationJson: serializeConfig(state.config, false),
        attributes,
        registerCreate: createCheck.input.checked,
        registerUpdate: updateCheck.input.checked,
        solutionUniqueName: solutionSelect.value || undefined,
        onProgress: appendLog,
      });
      const summary = outcome.steps
        .map((s) => `${s.message} step ${s.created ? 'created' : 'updated'}`)
        .join(', ');
      appendLog(`✔ ${summary}`);
      toast(state.service, 'success', 'Configuration published', summary);
    } catch (error) {
      appendLog(`✖ ${(error as Error).message}`);
      toast(state.service, 'error', 'Publish failed', (error as Error).message);
    } finally {
      publishButton.disabled = false;
    }
  }
}

function checkbox(label: string, checked: boolean): { wrapper: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = checked;
  const wrapper = el('label', { class: 'inline-label' }, input, ` ${label}`);
  return { wrapper, input };
}
