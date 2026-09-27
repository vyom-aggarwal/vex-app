import { other } from '../../shared/types';
import type { RuleCheck } from '../../engine/types';
import { holdingRule } from '../../engine/violations';
import { FIELD, GOALS } from './field';

/** Pinnacle automatic rule checks. Fouls escalate warning → yellow → red in the framework. */

type Out = ReturnType<RuleCheck['check']>;
const SLACK = 1;
const across = (a: 'red' | 'blue', y: number, slack = 0): boolean => (a === 'red' ? y < -slack : y > slack);

const CARRY: RuleCheck = {
  id: '3.3.2',
  check(ctx) {
    const out: Out = [];
    for (const e of ctx.events)
      if (e.type === 'possession') {
        const r = ctx.robots.find((x) => x.index === e.robot)!;
        out.push({ rule: '3.3.2', robot: e.robot, alliance: r.alliance, level: 'foul', text: 'Carry limit is 1 Pin, 1 Cup and 1 stack' });
      }
    return out;
  },
};

const AUTON_SIDE: RuleCheck = {
  id: '5.3.1',
  check(ctx) {
    const out: Out = [];
    if (ctx.phase !== 'auton' || ctx.mode !== 'alliance') return out;
    for (const r of ctx.robots) {
      const bad =
        r.footprint.some((p) => across(r.alliance, p.y, SLACK)) ||
        r.objects.some((id) => {
          const p = ctx.objectPos(id);
          return !!p && across(r.alliance, p.y);
        }) ||
        r.touching.some((t) => {
          const g = GOALS.find((x) => x.id === t);
          const d = FIELD.detents.find((x) => x.id === t);
          const y = g ? g.y : d ? d.pivot.y : 0;
          return across(r.alliance, y);
        });
      if (bad) out.push({ rule: '5.3.1', robot: r.index, alliance: r.alliance, level: 'foul', text: "Contacted the opponent's side in Autonomous" });
    }
    return out;
  },
};

const NEUTRAL_REMOVAL: RuleCheck = {
  id: '5.3.4',
  check(ctx) {
    const out: Out = [];
    for (const e of ctx.events) {
      if (e.type !== 'removed' || e.robot === null) continue;
      const g = GOALS.find((x) => x.id === e.goalId)!;
      if (g.kind === 'alliance') continue;
      const r = ctx.robots.find((x) => x.index === e.robot)!;
      const late = ctx.mode === 'alliance' ? ctx.elapsed >= 90 : ctx.remaining <= 30;
      if (late) out.push({ rule: '5.3.4', robot: r.index, alliance: r.alliance, level: 'red', text: 'Removed from a neutral-zone Goal in the final 30 s' });
      else if (!(e.top && e.count === 1))
        out.push({ rule: '5.3.4', robot: r.index, alliance: r.alliance, level: 'red', text: 'Removed more than the single top object from a neutral-zone Goal' });
    }
    return out;
  },
};

const OPP_GOALS: RuleCheck = {
  id: '5.3.5',
  check(ctx) {
    const out: Out = [];
    for (const r of ctx.robots) {
      const opp = GOALS.filter((g) => g.kind === 'alliance' && g.owner === other(r.alliance));
      const pushed = r.robots.some((j) => ctx.robots.find((x) => x.index === j)?.alliance !== r.alliance);
      if (!pushed && opp.some((g) => r.touching.includes(g.id)))
        out.push({ rule: '5.3.5', robot: r.index, alliance: r.alliance, level: 'red', text: 'Interacted with an opposing alliance Goal' });
    }
    return out;
  },
};

export const PINNACLE_RULES: RuleCheck[] = [CARRY, AUTON_SIDE, NEUTRAL_REMOVAL, OPP_GOALS, holdingRule('5.3.6', 4)];
