import { presetsFor } from '../games/presets';
import { loadJson, saveJson } from '../shared/storage';
import type { GameId, RobotSpec } from '../shared/types';

/** Saved robots per game (zdrive:robots:<game>), the selected robot and preview thumbnails. */

export const robotsKey = (g: GameId): string => `robots:${g}`;

export function listRobots(g: GameId): RobotSpec[] {
  return loadJson<RobotSpec[]>(robotsKey(g), []).filter((r) => r && r.v === 1);
}

export function saveRobots(g: GameId, list: RobotSpec[]): void {
  saveJson(robotsKey(g), list);
}

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

export const newId = (): string => `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export function selectedRobot(g: GameId): RobotSpec {
  const id = loadJson<string>(`selected:${g}`, '');
  return listRobots(g).find((r) => r.id === id) ?? presetsFor(g).find((r) => r.id === id) ?? presetsFor(g)[0];
}

export function selectRobot(g: GameId, id: string): void {
  saveJson(`selected:${g}`, id);
}

export const loadThumbs = (g: GameId): Record<string, string> => loadJson<Record<string, string>>(`thumbs:${g}`, {});

export function saveThumb(g: GameId, id: string, url: string): void {
  const t = loadThumbs(g);
  t[id] = url;
  saveJson(`thumbs:${g}`, t);
}
