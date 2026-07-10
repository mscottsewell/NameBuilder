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
import { mountPropertiesPanel } from './ui/propertiesPanel';
import { openPublishDialog } from './ui/publishDialog';
import { openWelcomeDialog } from './ui/welcomeDialog';
import { mountBusyOverlay } from './ui/busyOverlay';

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
  const properties = el('section', { class: 'app-properties' });

  document.body.append(header, el('div', { class: 'app-body' }, sidebar, designer, properties));

  mountSidebar(sidebar, controller);
  mountDesigner(designer, controller);
  mountPropertiesPanel(properties, controller);
  mountBusyOverlay(controller);

  store.on('busy', () => {
    busyIndicator.textContent = store.state.busyMessage ?? '';
    busyIndicator.classList.toggle('active', !!store.state.busyMessage);
  });

  void controller.initialize().then((needsWelcome) => {
    connectionLabel.textContent = store.state.connectionName;
    // No prior session for this connection — prompt for a solution/table to
    // start with, rather than resuming (there's nothing to resume).
    if (needsWelcome) openWelcomeDialog(controller);
  });
}

function brandIcon(): HTMLElement {
  // Loaded from the same file as the PPTB manifest icon (icons/namebuilder.svg)
  // rather than a duplicated inline copy, so the header logo and the tool
  // library's icon can never drift out of sync.
  return el('img', { class: 'app-logo', src: 'icons/namebuilder.svg', alt: '', width: '26', height: '26' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
