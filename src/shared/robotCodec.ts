import type { RobotSpec } from './types';

/** Robot export strings: "ZDRIVE1:" + base64(JSON). The prefix carries the format version. */
export const ROBOT_PREFIX = 'ZDRIVE1:';

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportRobot(spec: RobotSpec): string {
  return ROBOT_PREFIX + toBase64(JSON.stringify(spec));
}

export type ImportResult = { ok: true; spec: RobotSpec } | { ok: false; error: string };

export function importRobot(text: string): ImportResult {
  const s = text.trim();
  if (!s.startsWith(ROBOT_PREFIX)) return { ok: false, error: 'Not a ZDrive robot string (expected "ZDRIVE1:").' };
  try {
    const spec = JSON.parse(fromBase64(s.slice(ROBOT_PREFIX.length))) as RobotSpec;
    if (spec?.v !== 1 || !spec.chassis || !spec.drive || (spec.game !== 'override' && spec.game !== 'pinnacle'))
      return { ok: false, error: 'Robot data is incomplete.' };
    return { ok: true, spec };
  } catch {
    return { ok: false, error: 'Robot string is corrupted.' };
  }
}
