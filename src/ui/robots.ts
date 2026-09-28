import { presetsFor } from '../games/presets';
import { loadJson, saveJson } from '../shared/storage';
import type { EffectorType, GameId, LiftType, RobotSpec } from '../shared/types';

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
  if (valid(d, g)) {
    // One-time upgrade: an untouched starter drivetrain goes back to all-omni (symmetric, turns in place cleanly).
    const dr = d.drive;
    const starter = dr.type === 'tank' && dr.wheelsPerSide === 2 && dr.wheelDia === 4 && dr.cartridge === 200 && dr.ratio === 1 && dr.omni[0] === true;
    const flag = `draftV3:${g}`;
    if (!loadJson<boolean>(flag, false)) {
      saveJson(flag, true); // run once, so a later deliberate choice is kept
      if (starter && d.lift.type === 'arm' && d.effector.type === 'claw') {
        d.drive.omni = [true, true, true, true];
        saveDraft(d);
      }
    }
    return d;
  }
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

export const driveName = (s: RobotSpec): string =>
  s.drive.type === 'tank' ? `Tank ${s.drive.wheelsPerSide * 2}-wheel` : s.drive.type === 'xdrive' ? 'X-drive' : s.drive.type === 'mecanum' ? 'Mecanum' : 'H-drive';
export const LIFT_NAME: Record<LiftType, string> = { none: 'No lift', arm: 'Arm', fourbar: '4-bar', dr4b: 'DR4B', sixbar: '6-bar', chainbar: 'Chain bar', cascade: 'Cascade' };
export const EFFECTOR_NAME: Record<EffectorType, string> = { claw: 'Claw', dual: 'Dual grip', stack: 'Stack gripper' };
/** One-line build summary ("Tank 4-wheel · DR4B · Dual grip · intake"). */
export const robotSummary = (s: RobotSpec): string => `${driveName(s)} · ${LIFT_NAME[s.lift.type]} · ${EFFECTOR_NAME[s.effector.type]}${s.intake.type !== 'none' ? ' · intake' : ''}`;
