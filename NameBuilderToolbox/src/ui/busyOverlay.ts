/**
 * Full-page busy overlay: dims and blocks interaction with the whole app
 * while a blocking operation is in flight (loading a table's metadata,
 * switching solutions, reloading a deployed configuration, ...). Driven by
 * the store's 'busy' topic / state.busyMessage, so any controller method
 * that calls store.setBusy(...) automatically surfaces here.
 */

import { el } from './dom';
import type { Controller } from '../controller';

export function mountBusyOverlay(controller: Controller): void {
  const { store } = controller;

  const text = el('div', { class: 'busy-text' });
  const overlay = el('div', { class: 'busy-overlay' },
    el('div', { class: 'busy-card' },
      el('div', { class: 'busy-spinner', 'aria-hidden': 'true' }),
      text
    )
  );
  document.body.append(overlay);

  function render(): void {
    const message = store.state.busyMessage;
    overlay.classList.toggle('visible', !!message);
    text.textContent = message ?? '';
  }

  store.on('busy', render);
  render();
}
