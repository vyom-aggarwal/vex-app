import { presetsFor } from '../games/presets';
import { loadJson, saveJson } from '../shared/storage';
import type { GameId, RobotSpec } from '../shared/types';

/**
 * Robot storage per game:
 * - "My Robot" (zdrive:draft:<game>) is the working robot: every builder change is saved to it and it's
 *   what you drive in matches.
 * - Saved robots (zdrive:robots:<game>) are named copies you can load back into My Robot.
 */

export const robotsKey = (g: GameId): string => `robots:${g}`;
const draftKey = (g: GameId): string => `draft:${g}`;

export const newId = (): string => `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

function valid(r: unknown, g: GameId): r is RobotSpec {
  const s = r as RobotSpec;
  return !!s && s.v === 1 && s.game === g && !!s.chassis && !!s.drive && !!s.intake && !!s.lift && !!s.effector && !!s.tool && !!s.pneumatics;
}

export function listRobots(g: GameId): RobotSpec[] {
  return loadJson<unknown[]>(robotsKey(g), []).filter((r): r is RobotSpec => valid(r, g));
}

export function saveRobots(g: GameId, list: RobotSpec[]): void {
  saveJson(robotsKey(g), list);
}

/** Save a named copy (replacing one with the same id). */
export function upsertRobot(spec: RobotSpec): RobotSpec[] {
  const list = listRobots(spec.game);
  const i = list.findIndex((r) => r.id === spec.id);
  if (i >= 0) list[i] = spec;
  else list.push(spec);
  saveRobots(spec.game, list);
  return list;
}

export function deleteRobot(g: GameId, id: string): RobotSpec[] {
  const list = listRobots(g).filter((r) => r.id !== id);
  saveRobots(g, list);
  const t = loadThumbs(g);
  delete t[id];
  saveJson(`thumbs:${g}`, t);
  return list;
}

/** The working robot ("My Robot"). Falls back to the first preset. */
export function loadDraft(g: GameId): RobotSpec {
  const d = loadJson<unknown>(draftKey(g), null);
  if (valid(d, g)) return d;
  const p = presetsFor(g)[0];
  return { ...structuredClone(p), id: 'draft', name: 'My Robot' };
}

export function saveDraft(spec: RobotSpec): void {
  saveJson(draftKey(spec.game), spec);
}

/** Kept for existing callers: the robot you drive is My Robot. */
export const selectedRobot = loadDraft;

export const loadThumbs = (g: GameId): Record<string, string> => loadJson<Record<string, string>>(`thumbs:${g}`, {});

export function saveThumb(g: GameId, id: string, url: string): void {
  const t = loadThumbs(g);
  t[id] = url;
  if (!saveJson(`thumbs:${g}`, t)) {
    // Storage full: drop the oldest thumbnails, keep this one.
    const keys = Object.keys(t).filter((k) => k !== id);
    for (const k of keys.slice(0, Math.ceil(keys.length / 2))) delete t[k];
    saveJson(`thumbs:${g}`, t);
  }
}
