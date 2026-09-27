import type { Replay } from './replay';
import { loadJson, saveJson } from './storage';
import type { GameId, ModeId } from './types';

/** Local records: best score per game+mode, career totals, and the last 10 replays. */

export interface Career {
  runs: number;
  matches: number;
  wins: number;
  ties: number;
  points: number;
  secondsDriven: number;
  placed: number;
  loads: number;
  calls: number;
}

export interface Records {
  best: Partial<Record<ModeId, { score: number; date: string }>>;
  career: Career;
}

const emptyCareer = (): Career => ({ runs: 0, matches: 0, wins: 0, ties: 0, points: 0, secondsDriven: 0, placed: 0, loads: 0, calls: 0 });

export const recordsKey = (g: GameId): string => `records:${g}`;
export const replaysKey = (g: GameId): string => `replays:${g}`;
export const MAX_REPLAYS = 10;

export function loadRecords(g: GameId): Records {
  const r = loadJson<Records>(recordsKey(g), { best: {}, career: emptyCareer() });
  return { best: r.best ?? {}, career: { ...emptyCareer(), ...r.career } };
}

export interface RunSummary {
  game: GameId;
  mode: ModeId;
  score: number;
  /** 'win' | 'loss' | 'tie' for head-to-head modes, null for solo. */
  outcome: 'win' | 'loss' | 'tie' | null;
  seconds: number;
  placed: number;
  loads: number;
  calls: number;
}

/** Fold a finished run into the records. Returns true if it set a new best. */
export function commitRun(r: RunSummary): boolean {
  const rec = loadRecords(r.game);
  const c = rec.career;
  c.runs++;
  if (r.outcome) c.matches++;
  if (r.outcome === 'win') c.wins++;
  if (r.outcome === 'tie') c.ties++;
  c.points += r.score;
  c.secondsDriven += Math.round(r.seconds);
  c.placed += r.placed;
  c.loads += r.loads;
  c.calls += r.calls;
  const prev = rec.best[r.mode];
  const isBest = r.mode !== 'free' && (!prev || r.score > prev.score);
  if (isBest) rec.best[r.mode] = { score: r.score, date: new Date().toISOString() };
  saveJson(recordsKey(r.game), rec);
  return isBest;
}

export function loadReplays(g: GameId): Replay[] {
  return loadJson<Replay[]>(replaysKey(g), []);
}

/** Keep the newest MAX_REPLAYS; drop older ones if storage is full. */
export function saveReplay(r: Replay): void {
  let list = [r, ...loadReplays(r.game)].slice(0, MAX_REPLAYS);
  while (list.length > 0 && !saveJson(replaysKey(r.game), list)) list = list.slice(0, -1);
}
