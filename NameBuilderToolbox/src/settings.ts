/**
 * Persisted tool preferences. Uses the Power Platform ToolBox per-tool
 * settings store (toolboxAPI.settings) when hosted, and falls back to
 * localStorage so preferences also survive in demo mode / dev.
 *
 * Settings API: toolboxAPI.settings.get(key) / set(key, value) — values are
 * JSON-serializable and scoped to this tool.
 */

import type { FieldDefaults } from './model';
import { defaultFieldDefaults } from './model';

export interface Preferences {
  fieldDefaults: FieldDefaults;
  autoLoadPublished: boolean;
  /** Last solution filter chosen, keyed by connection name. */
  solutionByConnection: Record<string, string>;
}

const LS_PREFIX = 'namebuilder:';
const KEY_DEFAULTS = 'fieldDefaults';
const KEY_AUTOLOAD = 'autoLoadPublished';
const KEY_SOLUTIONS = 'solutionByConnection';

function store(): NonNullable<PptbToolboxAPI['settings']> | null {
  return window.toolboxAPI?.settings ?? null;
}

async function rawGet<T>(key: string): Promise<T | undefined> {
  const s = store();
  if (s) {
    try {
      const value = await s.get(key);
      return (value ?? undefined) as T | undefined;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

async function rawSet(key: string, value: unknown): Promise<void> {
  const s = store();
  if (s) {
    try {
      await s.set(key, value);
      return;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* preferences are best-effort */
  }
}

export async function loadPreferences(): Promise<Preferences> {
  const [defaults, autoLoad, solutions] = await Promise.all([
    rawGet<Partial<FieldDefaults>>(KEY_DEFAULTS),
    rawGet<boolean>(KEY_AUTOLOAD),
    rawGet<Record<string, string>>(KEY_SOLUTIONS),
  ]);

  return {
    fieldDefaults: { ...defaultFieldDefaults(), ...(defaults ?? {}) },
    autoLoadPublished: autoLoad ?? true,
    solutionByConnection: solutions ?? {},
  };
}

export function saveFieldDefaults(defaults: FieldDefaults): void {
  void rawSet(KEY_DEFAULTS, defaults);
}

export function saveAutoLoadPublished(value: boolean): void {
  void rawSet(KEY_AUTOLOAD, value);
}

export function saveSolutionByConnection(map: Record<string, string>): void {
  void rawSet(KEY_SOLUTIONS, map);
}
