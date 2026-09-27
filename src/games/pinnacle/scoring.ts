import { analyzeStack, placedCups, visibleHalves } from '../../engine/stacks';
import type { AutonResult, GoalDef, ScoreInput, ScoreLine, ScoreResult, ViolationCall } from '../../engine/types';
import type { Alliance, HalfColor, ModeId } from '../../shared/types';
import { GOALS, ROLLER_OF } from './field';

/** Pinnacle scoring (Achieve manual v1.2). Pure: reads only the logical stacks, roller states and robot facts. */

export const PTS = { cup: 1, half: 5, center: 10, park: 21 };
const goalById = new Map(GOALS.map((g) => [g.id, g]));

/** Color a zone's roller shows (between detents counts as yellow). */
export function rollerColor(input: ScoreInput, region: string): HalfColor {
  const id = ROLLER_OF[region];
  return (id && input.detents[id]) || 'yellow';
}

interface GoalTally {
  goal: GoalDef;
  cups: number;
  red: number;
  blue: number;
  yellow: number;
}

export function tallies(input: ScoreInput): GoalTally[] {
  return input.stacks.map((s) => {
    const info = analyzeStack(s, false);
    const halves = visibleHalves(info);
    return {
      goal: goalById.get(s.goalId)!,
      cups: placedCups(info),
      red: halves.filter((h) => h === 'red').length,
      blue: halves.filter((h) => h === 'blue').length,
      yellow: halves.filter((h) => h === 'yellow').length,
    };
  });
}

/** Solo points for one goal. */
export function soloGoalPoints(t: Omit<GoalTally, 'goal'> & { kind: GoalDef['kind']; owner: Alliance | null }, roller: HalfColor): number {
  if (t.kind === 'center') return t.cups * PTS.cup + (t.red + t.blue + t.yellow) * PTS.center;
  let p = t.cups * PTS.cup;
  const neutral = t.kind === 'neutral';
  if (neutral || t.owner === 'red') p += t.red * PTS.half;
  if (neutral || t.owner === 'blue') p += t.blue * PTS.half;
  const yellowOk = t.owner === 'blue' ? roller === 'blue' : roller === 'red';
  if (yellowOk) p += t.yellow * PTS.half;
  return p;
}

/** Alliance points for one goal. */
export function allianceGoalPoints(t: Omit<GoalTally, 'goal'> & { kind: GoalDef['kind']; owner: Alliance | null }, roller: HalfColor): Record<Alliance, number> {
  const out = { red: 0, blue: 0 };
  if (t.kind === 'center') {
    out.red += t.red * PTS.center;
    out.blue += t.blue * PTS.center;
    const lead: Alliance | null = t.red > t.blue ? 'red' : t.blue > t.red ? 'blue' : null;
    if (lead) out[lead] += t.cups * PTS.cup + t.yellow * PTS.center;
    return out;
  }
  const rollerA: Alliance | null = roller === 'yellow' ? null : roller;
  if (t.kind === 'alliance' && t.owner) {
    out[t.owner] += t[t.owner] * PTS.half + t.cups * PTS.cup;
    if (rollerA) out[rollerA] += t.yellow * PTS.half;
    return out;
  }
  out.red += t.red * PTS.half;
  out.blue += t.blue * PTS.half;
  if (rollerA) out[rollerA] += t.cups * PTS.cup + t.yellow * PTS.half;
  return out;
}

/** Robots touching one of their own Loaders, at most one robot per Loader (max bipartite matching). */
export function parkedCount(input: ScoreInput, a: Alliance, ownLoaders: string[]): number {
  const robots = input.robots.filter((r) => r.alliance === a).map((r) => r.loaders.filter((l) => ownLoaders.includes(l)));
  const match = new Map<string, number>();
  const tryAssign = (i: number, seen: Set<string>): boolean => {
    for (const l of robots[i]) {
      if (seen.has(l)) continue;
      seen.add(l);
      const cur = match.get(l);
      if (cur === undefined || tryAssign(cur, seen)) {
        match.set(l, i);
        return true;
      }
    }
    return false;
  };
  let n = 0;
  robots.forEach((_, i) => {
    if (tryAssign(i, new Set())) n++;
  });
  return n;
}

const LOADERS: Record<Alliance, string[]> = { red: ['LR1', 'LR2'], blue: ['LB1', 'LB2'] };

export function scorePinnacle(input: ScoreInput, modeId: ModeId): ScoreResult {
  const t = tallies(input);
  const lines: ScoreLine[] = [];
  if (modeId === 'solo' || modeId === 'solocode') {
    let goals = 0;
    for (const g of t) goals += soloGoalPoints({ ...g, kind: g.goal.kind, owner: g.goal.owner }, rollerColor(input, g.goal.region));
    lines.push({ label: 'Goals', red: goals, blue: 0 });
    const zeroed = input.redCards.includes(0);
    if (zeroed) lines.push({ label: 'Red card', red: -goals, blue: 0 });
    return { red: zeroed ? 0 : goals, blue: 0, lines, flags: [] };
  }
  const goalPts = { red: 0, blue: 0 };
  for (const g of t) {
    const p = allianceGoalPoints({ ...g, kind: g.goal.kind, owner: g.goal.owner }, rollerColor(input, g.goal.region));
    goalPts.red += p.red;
    goalPts.blue += p.blue;
  }
  lines.push({ label: 'Goals', ...goalPts });
  const park = { red: parkedCount(input, 'red', LOADERS.red) * PTS.park, blue: parkedCount(input, 'blue', LOADERS.blue) * PTS.park };
  lines.push({ label: 'Parked', ...park });
  const red = goalPts.red + park.red;
  const blue = goalPts.blue + park.blue;
  const flags = [
    { label: 'Autonomous RP', red: input.auton?.awp.red ?? false, blue: input.auton?.awp.blue ?? false },
    { label: 'Endgame RP', red: endgameRP(input, 'red'), blue: endgameRP(input, 'blue') },
  ];
  return { red, blue, lines, flags };
}

/** Autonomous RP: ≥3 Cups and ≥4 halfpins scored (credited to the alliance) across ≥2 Goals, plus own zone roller in own color. */
export function autonRP(input: ScoreInput, a: Alliance): boolean {
  let cups = 0;
  let halves = 0;
  let goals = 0;
  for (const g of tallies(input)) {
    const roller = rollerColor(input, g.goal.region);
    const rollerA = roller === 'yellow' ? null : roller;
    let c = 0;
    let h = g[a];
    if (g.goal.kind === 'center') {
      const lead = g.red > g.blue ? 'red' : g.blue > g.red ? 'blue' : null;
      if (lead === a) {
        c = g.cups;
        h += g.yellow;
      }
    } else if (g.goal.kind === 'alliance') {
      if (g.goal.owner === a) c = g.cups;
      else h = 0;
      if (rollerA === a) h += g.yellow;
    } else if (rollerA === a) {
      c = g.cups;
      h += g.yellow;
    }
    cups += c;
    halves += h;
    if (c + h > 0) goals++;
  }
  const own = rollerColor(input, a === 'red' ? 'RED' : 'BLUE') === a;
  return cups >= 3 && halves >= 4 && goals >= 2 && own;
}

/** Endgame RP: a stack with ≥5 visible own-color halfpins, ≥1 roller in own color, ≥1 robot on an own Loader. */
export function endgameRP(input: ScoreInput, a: Alliance): boolean {
  const stack = tallies(input).some((g) => g[a] >= 5);
  const roller = ['RED', 'BLUE', 'N1', 'N2'].some((z) => rollerColor(input, z) === a);
  const loader = input.robots.some((r) => r.alliance === a && r.loaders.some((l) => LOADERS[a].includes(l)));
  return stack && roller && loader;
}

/** Ranking points for one alliance given a final result: win 2 / tie 1 plus the two bonus RPs. */
export function rankingPoints(res: ScoreResult, a: Alliance): number {
  const o = a === 'red' ? 'blue' : 'red';
  const win = res[a] > res[o] ? 2 : res[a] === res[o] ? 1 : 0;
  return win + res.flags.filter((f) => f[a]).length;
}

export function pinnacleAuton(input: ScoreInput, calls: ViolationCall[]): AutonResult {
  const s = scorePinnacle({ ...input, auton: null }, input.mode);
  return {
    red: s.red,
    blue: s.blue,
    violation: { red: calls.some((c) => c.auton && c.alliance === 'red'), blue: calls.some((c) => c.auton && c.alliance === 'blue') },
    bonus: { red: 0, blue: 0 },
    awp: { red: autonRP(input, 'red'), blue: autonRP(input, 'blue') },
  };
}
