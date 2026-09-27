import { TICK_HZ } from '../shared/timestep';
import type { Alliance } from '../shared/types';
import type { CallLevel, RobotFacts, RuleCheck, RuleContext, ViolationCall } from './types';

/**
 * Violation framework: game rule checks emit raw calls every tick; this module dedupes them
 * (one call per rule+robot per cooldown), applies Pinnacle-style escalation and tracks red cards.
 */

export interface RefState {
  calls: ViolationCall[];
  mem: Record<string, Record<string, number>>;
  lastCall: Record<string, number>;
  fouls: Record<number, number>;
  redCards: number[];
}

export const newRefState = (): RefState => ({ calls: [], mem: {}, lastCall: {}, fouls: {}, redCards: [] });

const COOLDOWN_TICKS = 3 * TICK_HZ;

export function runRules(ref: RefState, rules: RuleCheck[], ctx: RuleContext, escalation: boolean): ViolationCall[] {
  const fresh: ViolationCall[] = [];
  for (const rule of rules) {
    const mem = (ref.mem[rule.id] ??= {});
    for (const c of rule.check(ctx, mem)) {
      const key = `${c.rule}:${c.robot}`;
      const last = ref.lastCall[key];
      if (last !== undefined && ctx.tick - last < COOLDOWN_TICKS) continue;
      ref.lastCall[key] = ctx.tick;
      let level: CallLevel = c.level;
      if (escalation && level !== 'red') {
        const n = (ref.fouls[c.robot] = (ref.fouls[c.robot] ?? 0) + 1);
        level = n === 1 ? 'warning' : n === 2 ? 'foul' : 'red';
      }
      const call: ViolationCall = { ...c, level, tick: ctx.tick, auton: ctx.phase === 'auton' };
      if (level === 'red' && !ref.redCards.includes(c.robot)) ref.redCards.push(c.robot);
      ref.calls.push(call);
      fresh.push(call);
    }
  }
  return fresh;
}

export const autonViolations = (calls: ViolationCall[]): Record<Alliance, boolean> => ({
  red: calls.some((c) => c.auton && c.alliance === 'red'),
  blue: calls.some((c) => c.auton && c.alliance === 'blue'),
});

/** Minimum distance between two convex polygons' vertices/edges (approximate: vertex-to-edge). */
function polyGap(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
  let best = Infinity;
  const segDist = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): number => {
    const dx = r.x - q.x;
    const dy = r.y - q.y;
    const t = Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - q.x - t * dx, p.y - q.y - t * dy);
  };
  for (const [P, Q] of [
    [a, b],
    [b, a],
  ])
    for (const p of P) for (let i = 0; i < Q.length; i++) best = Math.min(best, segDist(p, Q[i], Q[(i + 1) % Q.length]));
  return best;
}

/**
 * Generic holding rule (trap / pin): a robot touching an opponent that is pressed against the field,
 * barely moving while its driver pushes. The count pauses once they separate by `pauseIn`; after a pause
 * a `recoverSec` window must pass before a new hold starts counting from zero.
 */
export function holdingRule(id: string, countSec: number, pauseIn = 24, recoverSec = 0): RuleCheck {
  return {
    id,
    check(ctx: RuleContext, mem: Record<string, number>) {
      const out: ReturnType<RuleCheck['check']> = [];
      if (ctx.phase !== 'driver' && ctx.phase !== 'auton') return out;
      const byIdx = new Map<number, RobotFacts>(ctx.robots.map((r) => [r.index, r]));
      for (const a of ctx.robots) {
        for (const b of ctx.robots) {
          if (a.alliance === b.alliance) continue;
          const key = `${a.index}>${b.index}`;
          const pinned =
            a.robots.includes(b.index) && b.speed < 0.08 && b.effort > 0.3 && b.touching.some((t) => t !== '' && t !== `robot`);
          const gap = polyGap(a.footprint, byIdx.get(b.index)!.footprint);
          const rec = mem[`${key}:rec`] ?? 0;
          if (rec > 0) mem[`${key}:rec`] = rec - 1;
          if (pinned && rec <= 0) {
            mem[key] = (mem[key] ?? 0) + 1;
            if (mem[key] > countSec * TICK_HZ) {
              out.push({ rule: id, robot: a.index, alliance: a.alliance, level: 'foul', text: `Holding longer than a ${countSec}-count` });
              mem[key] = 0;
              mem[`${key}:rec`] = recoverSec * TICK_HZ;
            }
          } else if (gap > pauseIn && (mem[key] ?? 0) > 0) {
            mem[key] = 0;
            mem[`${key}:rec`] = recoverSec * TICK_HZ;
          }
        }
      }
      return out;
    },
  };
}
