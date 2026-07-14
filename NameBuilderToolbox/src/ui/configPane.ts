/**
 * Combined center/right pane: one panel, three tabs — Configuration (live
 * preview + the name-pattern block designer), Properties (global config +
 * reusable field defaults), and JSON (raw configuration + import/export).
 */

import { el } from './dom';
import type { Controller } from '../controller';
import { mountDesigner } from './designer';
import { mountPropertiesTab, mountJsonTab } from './propertiesPanel';

interface TabDef {
  label: string;
  content: HTMLElement;
}

export function mountConfigPane(root: HTMLElement, controller: Controller): void {
  const tabs: TabDef[] = [
    { label: 'Configuration', content: el('div', { class: 'tab-content' }) },
    { label: 'Properties', content: el('div', { class: 'tab-content' }) },
    { label: 'JSON', content: el('div', { class: 'tab-content json-section' }) },
  ];

  const tabBar = el('div', { class: 'tab-bar' });
  const buttons: HTMLElement[] = tabs.map((tab, index) => {
    const button = el('button', {
      class: `tab${index === 0 ? ' active' : ''}`,
      onclick: () => switchTab(index),
    }, tab.label);
    tabBar.append(button);
    tab.content.style.display = index === 0 ? '' : 'none';
    return button;
  });

  function switchTab(activeIndex: number): void {
    tabs.forEach((tab, index) => {
      buttons[index].classList.toggle('active', index === activeIndex);
      tab.content.style.display = index === activeIndex ? '' : 'none';
    });
  }

  root.append(tabBar, ...tabs.map((t) => t.content));

  mountDesigner(tabs[0].content, controller);
  mountPropertiesTab(tabs[1].content, controller);
  mountJsonTab(tabs[2].content, controller);
}
