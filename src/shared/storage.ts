/** localStorage wrapped in try/catch; every key is namespaced under "zdrive:". */
export const STORAGE_PREFIX = 'zdrive:';

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(STORAGE_PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    ls()?.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    ls()?.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}
