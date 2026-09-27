import { polysOverlap } from '../../shared/math';
import { TICK_HZ } from '../../shared/timestep';
import { other } from '../../shared/types';
import type { RuleCheck, RuleContext } from '../../engine/types';
import { holdingRule } from '../../engine/violations';
import { FIELD, GOALS, QUAD_COLOR } from './field';

/** Override automatic rule checks. Each returns raw calls; the framework dedupes them. */

type Out = ReturnType<RuleCheck['check']>;
const LINGER_SEC = 3; // EST: "lingering" in an opponent's Load Zone
const LINE_SLACK = 1; // in: tolerance before a robot counts as touching tiles across the line

const side = (x: number, y: number): number => {
  const l = FIELD.autonLine!;
  return l.n.x * x + l.n.y * y - l.c;
};
const across = (a: 'red' | 'blue', x: number, y: number, slack = 0): boolean => (a === 'red' ? side(x, y) < -slack : side(x, y) > slack);

/** Stacked objects on each goal, for SG9 ("anything stacked on them"). */
function stackedOn(ctx: RuleContext, goalId: string, id: number): boolean {
  const p = ctx.objectPos(id);
  const g = GOALS.find((x) => x.id === goalId)!;
  return !!p && Math.hypot(p.x - g.x, p.y - g.y) < 1;
}

const SG6: RuleCheck = {
  id: 'SG6',
  check(ctx) {
    const out: Out = [];
    for (const e of ctx.events)
      if (e.type === 'possession') {
        const r = ctx.robots.find((x) => x.index === e.robot)!;
        out.push({ rule: 'SG6', robot: e.robot, alliance: r.alliance, level: 'foul', text: 'Possession limit is 1 Pin and 1 Cup' });
      }
    return out;
  },
};

const SG7: RuleCheck = {
  id: 'SG7',
  check(ctx) {
    const out: Out = [];
    if (ctx.phase !== 'auton') return out;
    for (const r of ctx.robots) {
      const call = (text: string) => out.push({ rule: 'SG7', robot: r.index, alliance: r.alliance, level: 'foul', text });
      if (r.footprint.some((p) => across(r.alliance, p.x, p.y, LINE_SLACK))) {
        call('Crossed the Autonomous Line');
        continue;
      }
      const obj = r.objects.find((id) => {
        if (ctx.lineObjects.has(id)) return false;
        const p = ctx.objectPos(id);
        return !!p && across(r.alliance, p.x, p.y);
      });
      if (obj !== undefined) {
        call('Touched an object across the Autonomous Line');
        continue;
      }
      const el = r.touching.find((t) => {
        const g = GOALS.find((x) => x.id === t);
        const region = g ? g.region : FIELD.detents.find((d) => d.id === t)?.region;
        return region && region !== 'MID' && QUAD_COLOR[region as keyof typeof QUAD_COLOR] !== r.alliance;
      });
      if (el) call('Touched a field element across the Autonomous Line');
    }
    return out;
  },
};

const SG9: RuleCheck = {
  id: 'SG9',
  check(ctx) {
    const out: Out = [];
    for (const r of ctx.robots) {
      const opp = GOALS.filter((g) => g.kind === 'alliance' && g.owner === other(r.alliance));
      // A robot being shoved into the goal by an opponent isn't interacting with it.
      const pushed = r.robots.some((j) => ctx.robots.find((x) => x.index === j)?.alliance !== r.alliance);
      const hit = !pushed && opp.some((g) => r.touching.includes(g.id) || r.objects.some((id) => stackedOn(ctx, g.id, id)));
      if (hit) out.push({ rule: 'SG9', robot: r.index, alliance: r.alliance, level: 'major', text: 'Interacted with an opposing Alliance Goal' });
    }
    return out;
  },
};

const SG10: RuleCheck = {
  id: 'SG10',
  check(ctx) {
    const out: Out = [];
    for (const e of ctx.events) {
      if (e.type !== 'removed' || e.robot === null || !e.placedBefore) continue;
      const g = GOALS.find((x) => x.id === e.goalId)!;
      if (g.kind === 'alliance') continue;
      const r = ctx.robots.find((x) => x.index === e.robot)!;
      out.push({ rule: 'SG10', robot: r.index, alliance: r.alliance, level: 'major', text: 'Removed Placed objects from a neutral Goal' });
    }
    return out;
  },
};

const SG12: RuleCheck = {
  id: 'SG12',
  check(ctx) {
    const out: Out = [];
    if (!ctx.endgame) return out;
    for (const e of ctx.events) {
      if (e.type !== 'placed' || e.goalId !== 'G0' || e.robot === null) continue;
      const r = ctx.robots.find((x) => x.index === e.robot)!;
      out.push({ rule: 'SG12', robot: r.index, alliance: r.alliance, level: 'foul', text: 'Placed on the Midfield Goal during the Endgame' });
    }
    return out;
  },
};

const SG13: RuleCheck = {
  id: 'SG13',
  check(ctx, mem) {
    const out: Out = [];
    if (ctx.phase !== 'driver') return out;
    const zones = (a: 'red' | 'blue') => FIELD.loaders.filter((l) => l.alliance === a && l.zone).map((l) => l.zone!);
    for (const r of ctx.robots) {
      const opp = other(r.alliance);
      const call = (text: string) => out.push({ rule: 'SG13', robot: r.index, alliance: r.alliance, level: 'foul', text });
      for (const j of r.robots) {
        const b = ctx.robots.find((x) => x.index === j)!;
        if (b.alliance !== opp || !zones(opp).some((z) => polysOverlap(b.footprint, z))) continue;
        // Only the robot driving into the contact is called, not the one being rammed.
        const toward = ((b.x - r.x) * r.vx + (b.y - r.y) * r.vy) / (Math.hypot(b.x - r.x, b.y - r.y) || 1);
        if (toward > 0.1) call('Contacted an opponent in its Load Zone');
      }
      const key = `linger${r.index}`;
      if (zones(opp).some((z) => polysOverlap(r.footprint, z))) {
        mem[key] = (mem[key] ?? 0) + 1;
        if (mem[key] > LINGER_SEC * TICK_HZ) {
          call("Lingered in the opponent's Load Zone");
          mem[key] = 0;
        }
      } else mem[key] = 0;
      if (FIELD.loaders.some((l) => l.alliance === opp && r.touching.includes(l.id))) call("Touched an opponent's Loader");
    }
    return out;
  },
};

export const OVERRIDE_RULES: RuleCheck[] = [SG6, SG7, SG9, SG10, SG12, SG13, holdingRule('GG17', 3, 24, 5)];
