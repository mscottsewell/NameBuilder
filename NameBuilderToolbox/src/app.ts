/**
 * NameBuilder for Power Platform ToolBox — entry point.
 * Wires the host bridge (or demo fallback), theme, layout, and panels.
 */

import './styles.css';
import { el } from './ui/dom';
import { Store } from './state';
import { Controller } from './controller';
import { PptbDataService } from './dataverse';
import { DemoDataService } from './demo';
import { mountSidebar } from './ui/sidebar';
import { mountDesigner } from './ui/designer';
import { mountPreview } from './ui/preview';
import { openPublishDialog } from './ui/publishDialog';

async function applyTheme(): Promise<void> {
  try {
    const theme = await window.toolboxAPI?.utils.getCurrentTheme();
    if (theme) document.documentElement.dataset.theme = theme;
  } catch {
    /* fall back to prefers-color-scheme via CSS */
  }
}

function bootstrap(): void {
  const hosted = !!window.dataverseAPI && !!window.toolboxAPI;
  const service = hosted ? new PptbDataService() : new DemoDataService();
  const store = new Store(service);
  const controller = new Controller(store);

  void applyTheme();
  // Re-check the theme when the host broadcasts changes (API surface varies by host version).
  try {
    window.toolboxAPI?.events?.on?.('theme-changed', () => void applyTheme());
    window.toolboxAPI?.on?.('theme-changed', () => void applyTheme());
  } catch {
    /* theme updates are cosmetic */
  }

  const connectionLabel = el('span', { class: 'connection-label' }, '…');
  const busyIndicator = el('span', { class: 'busy-indicator' });

  const publishButton = el('button', {
    class: 'btn btn-primary',
    onclick: () => openPublishDialog(controller),
  }, 'Publish configuration');

  const header = el('header', { class: 'app-header' },
    el('div', { class: 'app-brand' },
      brandIcon(),
      el('div', {},
        el('h1', {}, 'NameBuilder'),
        el('span', { class: 'app-subtitle' }, 'Automatic record names for Dataverse')
      )
    ),
    el('div', { class: 'app-header-right' },
      busyIndicator,
      service.isDemo ? el('span', { class: 'demo-badge', title: 'Running outside Power Platform ToolBox with sample data' }, 'DEMO MODE') : null,
      connectionLabel,
      publishButton
    )
  );

  const sidebar = el('aside', { class: 'app-sidebar' });
  const designer = el('main', { class: 'app-designer' });
  const preview = el('section', { class: 'app-preview' });

  document.body.append(header, el('div', { class: 'app-body' }, sidebar, designer, preview));

  mountSidebar(sidebar, controller);
  mountDesigner(designer, controller);
  mountPreview(preview, controller);

  store.on('busy', () => {
    busyIndicator.textContent = store.state.busyMessage ?? '';
    busyIndicator.classList.toggle('active', !!store.state.busyMessage);
  });

  void controller.initialize().then(() => {
    connectionLabel.textContent = store.state.connectionName;
  });
}

function brandIcon(): HTMLElement {
  const wrapper = el('span', { class: 'app-logo', 'aria-hidden': 'true' });
  wrapper.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">' +
    '<rect x="2" y="4" width="9" height="4" rx="1.2"/><rect x="13" y="4" width="9" height="4" rx="1.2" opacity="0.55"/>' +
    '<rect x="2" y="10" width="6" height="4" rx="1.2" opacity="0.55"/><rect x="10" y="10" width="12" height="4" rx="1.2"/>' +
    '<rect x="2" y="16" width="13" height="4" rx="1.2" opacity="0.8"/>' +
    '<path d="M17.5 16.3l1.1 2.2 2.4.35-1.75 1.7.4 2.4-2.15-1.13-2.15 1.13.4-2.4-1.75-1.7 2.4-.35z" opacity="0.9"/></svg>';
  return wrapper;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
