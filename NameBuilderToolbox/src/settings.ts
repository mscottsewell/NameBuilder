/**
 * Persisted tool preferences. Uses the Power Platform ToolBox per-tool
 * settings store (toolboxAPI.settings) when hosted, and falls back to
 * localStorage so preferences also survive in demo mode / dev.
 *
 * Settings API: toolboxAPI.settings.get(key) / set(key, value) — values are
 * JSON-serializable and scoped to this tool.
 */

import type { FieldDefaults, SessionState } from './model';
import { defaultFieldDefaults } from './model';

export interface Preferences {
  fieldDefaults: FieldDefaults;
  autoLoadPublished: boolean;
  /** Last solution/table/configuration worked on, keyed by connection name. */
  sessionByConnection: Record<string, SessionState>;
}

const LS_PREFIX = 'namebuilder:';
const KEY_DEFAULTS = 'fieldDefaults';
const KEY_AUTOLOAD = 'autoLoadPublished';
const KEY_SESSIONS = 'sessionByConnection';

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
  const [defaults, autoLoad, sessions] = await Promise.all([
    rawGet<Partial<FieldDefaults>>(KEY_DEFAULTS),
    rawGet<boolean>(KEY_AUTOLOAD),
    rawGet<Record<string, SessionState>>(KEY_SESSIONS),
  ]);

  return {
    fieldDefaults: { ...defaultFieldDefaults(), ...(defaults ?? {}) },
    autoLoadPublished: autoLoad ?? true,
    sessionByConnection: sessions ?? {},
  };
}

export function saveFieldDefaults(defaults: FieldDefaults): void {
  void rawSet(KEY_DEFAULTS, defaults);
}

export function saveAutoLoadPublished(value: boolean): void {
  void rawSet(KEY_AUTOLOAD, value);
}

export function saveSessionByConnection(map: Record<string, SessionState>): void {
  void rawSet(KEY_SESSIONS, map);
}
