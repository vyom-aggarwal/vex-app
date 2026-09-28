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

let fullHandler: ((key: string) => void) | null = null;

/** Called when a write fails (storage full or blocked), so the UI can say so. */
export function onStorageFull(fn: ((key: string) => void) | null): void {
  fullHandler = fn;
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    ls()?.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    fullHandler?.(key);
    return false;
  }
}

function ownKeys(): string[] {
  const s = ls();
  if (!s) return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Every ZDrive key and raw value (for "Export all data"). */
export function exportAll(): Record<string, string> {
  const s = ls();
  const out: Record<string, string> = {};
  for (const k of ownKeys()) {
    const v = s?.getItem(k);
    if (v != null) out[k.slice(STORAGE_PREFIX.length)] = v;
  }
  return out;
}

/** Replace all ZDrive data with an exported set. Returns false if nothing could be written. */
export function importAll(data: Record<string, string>): boolean {
  const s = ls();
  if (!s) return false;
  clearAll();
  let ok = true;
  for (const [k, v] of Object.entries(data)) {
    try {
      s.setItem(STORAGE_PREFIX + k, v);
    } catch {
      ok = false;
    }
  }
  return ok;
}

export function clearAll(): void {
  const s = ls();
  for (const k of ownKeys()) {
    try {
      s?.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Approximate bytes used by ZDrive keys (UTF-16). */
export function usageBytes(): number {
  const s = ls();
  let n = 0;
  for (const k of ownKeys()) n += (k.length + (s?.getItem(k)?.length ?? 0)) * 2;
  return n;
}

export function removeKey(key: string): void {
  try {
    ls()?.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}
