/** Lightweight in-app toast notifications (also mirrors to the PPTB host). */

import { el } from './dom';
import type { DataService } from '../dataverse';

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = el('div', { class: 'toast-container' });
    document.body.append(container);
  }
  return container;
}

export function toast(service: DataService, type: 'info' | 'success' | 'warning' | 'error', title: string, body?: string): void {
  void service.notify(type, title, body);

  const node = el(
    'div',
    { class: `toast toast-${type}` },
    el('div', { class: 'toast-title' }, title),
    body ? el('div', { class: 'toast-body' }, body) : null
  );
  ensureContainer().append(node);
  window.setTimeout(() => {
    node.classList.add('toast-out');
    window.setTimeout(() => node.remove(), 300);
  }, type === 'error' ? 8000 : 4000);
}
