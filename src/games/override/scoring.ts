import { analyzeStack, type StackInfo } from '../../engine/stacks';
import type { AutonResult, GoalDef, ScoreInput, ScoreLine, ScoreResult, ViolationCall } from '../../engine/types';
import type { Alliance, HalfColor, ModeId } from '../../shared/types';
import { GOALS, QUAD_COLOR } from './field';

/** Override scoring (SC2–SC8, RSC3). Pure: reads only the logical stack model and robot facts. */

export const PTS = { bonus: 12, colored: 5, yellow: 10, midfield: 8 };

const goalById = new Map(GOALS.map((g) => [g.id, g]));

/** SC4: a Toggle counts only when seated and untouched; otherwise yellow. */
export function toggleColor(input: ScoreInput, region: string): HalfColor {
  const id = `T_${region}`;
  if (input.detentTouched[id]) return 'yellow';
  return input.detents[id] ?? 'yellow';
}

export function midfieldCounts(input: ScoreInput): Record<Alliance, number> {
  const c = { red: 0, blue: 0 };
  for (const r of input.robots) if (r.inMidfield) c[r.alliance]++;
  return c;
}

/** SC5: owner of yellow halves on a goal. */
export function yellowOwner(input: ScoreInput, g: GoalDef): Alliance | null {
  if (g.region === 'MID') {
    if (input.excludeMidfield) return null;
    const c = midfieldCounts(input);
    return c.red > c.blue ? 'red' : c.blue > c.red ? 'blue' : null;
  }
  const t = toggleColor(input, g.region);
  return t === 'yellow' ? null : t;
}

export function analyzeAll(input: ScoreInput): { goal: GoalDef; info: StackInfo }[] {
  return input.stacks.map((s) => ({ goal: goalById.get(s.goalId)!, info: analyzeStack(s, true) }));
}

/** Per placed pin: which alliance each visible half scores for. */
function pinCredits(input: ScoreInput, goal: GoalDef, info: StackInfo, skills: boolean): { id: number; halves: { color: HalfColor; to: Alliance | null }[] }[] {
  const owner = yellowOwner(input, goal);
  const qColor = goal.region === 'MID' ? null : QUAD_COLOR[goal.region as keyof typeof QUAD_COLOR];
  return info.pins
    .filter((p) => p.placed)
    .map((p) => ({
      id: p.id,
      halves: p.halves
        .filter((h) => h.visible)
        .map((h) => {
          if (h.color === 'yellow') {
            if (!skills) return { color: h.color, to: owner };
            // RSC3: a Toggle grants ownership only when set to its own quadrant's color; Midfield yellow needs the robot in the Midfield.
            if (goal.region === 'MID') return { color: h.color, to: !input.excludeMidfield && input.robots.some((r) => r.inMidfield) ? 'red' : null };
            return { color: h.color, to: toggleColor(input, goal.region) === qColor ? 'red' : null };
          }
          if (!skills) return { color: h.color, to: h.color as Alliance };
          const ok = goal.region === 'MID' || qColor === h.color;
          return { color: h.color, to: ok ? 'red' : null };
        }),
    }));
}

export function scoreOverride(input: ScoreInput, modeId: ModeId): ScoreResult {
  const skills = modeId === 'skills';
  const lines: ScoreLine[] = [];
  const colored = { red: 0, blue: 0 };
  const yellow = { red: 0, blue: 0 };
  for (const { goal, info } of analyzeAll(input))
    for (const p of pinCredits(input, goal, info, skills))
      for (const h of p.halves) {
        if (!h.to) continue;
        if (h.color === 'yellow') yellow[h.to] += PTS.yellow;
        else colored[h.to] += PTS.colored;
      }
  lines.push({ label: skills ? 'Red / blue halves' : 'Alliance-colored halves', ...colored });
  lines.push({ label: 'Yellow halves', ...yellow });
  const mid = input.excludeMidfield || input.hideEndStates ? { red: 0, blue: 0 } : midfieldCounts(input);
  const midPts = skills ? { red: (mid.red + mid.blue) * PTS.midfield, blue: 0 } : { red: mid.red * PTS.midfield, blue: mid.blue * PTS.midfield };
  lines.push({ label: 'Robots in the Midfield', ...midPts });
  const bonus = !skills && input.auton ? input.auton.bonus : { red: 0, blue: 0 };
  if (!skills) lines.push({ label: 'Autonomous Bonus', ...bonus });
  const red = lines.reduce((a, l) => a + l.red, 0);
  const blue = lines.reduce((a, l) => a + l.blue, 0);
  const flags = input.auton && !skills ? [{ label: input.worlds ? 'Autonomous Win Point (Worlds)' : 'Autonomous Win Point', red: input.auton.awp.red, blue: input.auton.awp.blue }] : [];
  return { red, blue, lines, flags };
}

/** SC7 bonus + SC8 AWP, evaluated at the end of Autonomous. */
export function overrideAuton(input: ScoreInput, calls: ViolationCall[]): AutonResult {
  const noMid = scoreOverride({ ...input, excludeMidfield: true, auton: null }, input.mode);
  const violation = {
    red: calls.some((c) => c.auton && c.alliance === 'red'),
    blue: calls.some((c) => c.auton && c.alliance === 'blue'),
  };
  let bonus = { red: 0, blue: 0 };
  if (violation.red && violation.blue) bonus = { red: 0, blue: 0 };
  else if (violation.red) bonus = { red: 0, blue: PTS.bonus };
  else if (violation.blue) bonus = { red: PTS.bonus, blue: 0 };
  else if (noMid.red > noMid.blue) bonus = { red: PTS.bonus, blue: 0 };
  else if (noMid.blue > noMid.red) bonus = { red: 0, blue: PTS.bonus };
  else bonus = { red: PTS.bonus / 2, blue: PTS.bonus / 2 };
  const awp = { red: awpFor(input, 'red', violation.red), blue: awpFor(input, 'blue', violation.blue) };
  return { red: noMid.red, blue: noMid.blue, violation, bonus, awp };
}

/** SC8 Autonomous Win Point for one alliance. */
export function awpFor(input: ScoreInput, a: Alliance, violated: boolean): boolean {
  const need = input.worlds ? { pins: 7, goals: 3 } : { pins: 6, goals: 2 };
  if (violated) return false;
  if (input.robots.some((r) => r.alliance === a && r.touchingPerimeter)) return false;
  const full = { ...input, excludeMidfield: false };
  let pins = 0;
  let goals = 0;
  for (const { goal, info } of analyzeAll(full)) {
    // Quadrants across the Autonomous Line don't count; the Midfield Goal belongs to no Quadrant.
    if (goal.region !== 'MID' && QUAD_COLOR[goal.region as keyof typeof QUAD_COLOR] !== a) continue;
    const mine = pinCredits(full, goal, info, false).filter((p) => p.halves.some((h) => h.to === a)).length;
    pins += mine;
    if (mine >= 2) goals++;
  }
  return pins >= need.pins && goals >= need.goals;
}
