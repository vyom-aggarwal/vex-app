import { effectorPoint, liftRange, storageCapacity } from '../engine/mechanism';
import { upAxis } from '../engine/physics';
import { PIN, stackTop } from '../engine/pieces';
import type { Controller } from '../engine/session';
import type { Sim } from '../engine/sim';
import { clamp, pointInPoly, polysOverlap, wrapAngle, type V2 } from '../shared/math';
import { TICK_HZ } from '../shared/timestep';
import { ASSIST, NEUTRAL_COMMAND, other, type BotLevel, type BotStyle, type RobotCommand } from '../shared/types';
import { mToIn } from '../shared/units';

/**
 * Bot controllers. They read the sim (never mutate it) and emit one RobotCommand per tick, so replays
 * reproduce them. Styles: scorer, controller (toggles/rollers), defender, mixed. Levels scale speed,
 * aim and assist use. A watchdog backs a bot out of any standstill longer than 1.5 s.
 */

const LEVEL = {
  easy: { speed: 0.55, turn: 0.55, tol: 1.2, react: 36, assists: 0 },
  normal: { speed: 0.8, turn: 0.75, tol: 0.8, react: 18, assists: 0 },
  hard: { speed: 1, turn: 0.95, tol: 0.5, react: 8, assists: ASSIST.autoPlace },
} satisfies Record<BotLevel, unknown>;

type Task =
  | { kind: 'fetch'; obj: number }
  | { kind: 'place'; goal: string }
  | { kind: 'detent'; id: string }
  | { kind: 'defend'; robot: number }
  | { kind: 'idle' };

interface Brain {
  task: Task;
  since: number;
  stuck: number;
  escape: number;
  press: number;
  lastPress: number;
  decideAt: number;
  mode: 'controller' | 'scorer';
  contact: number;
  backoff: number;
  lastTask: string;
}

function liftFor(sim: Sim, i: number, zIn: number): number {
  const spec = sim.specs[i];
  const { zMin, zMax } = liftRange(spec);
  if (zMax <= zMin) return 0;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (effectorPoint(spec, mid).z < zIn) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function makeBot(style: BotStyle, level: BotLevel): Controller {
  const L = LEVEL[level];
  const brain: Brain = { task: { kind: 'idle' }, since: 0, stuck: 0, escape: 0, press: 0, lastPress: -999, decideAt: 0, mode: style === 'scorer' ? 'scorer' : 'controller', contact: 0, backoff: 0, lastTask: '' };

  const fn = (sim: Sim, i: number): RobotCommand => {
    const s = sim.state;
    const me = s.robots[i];
    const spec = sim.specs[i];
    const pose = sim.robotPose(i);
    const P = { x: mToIn(pose.x), y: mToIn(pose.y) };
    const game = sim.game;
    const forbidden = new Set(game.bots.forbiddenGoals(me.alliance));
    const auton = sim.phase === 'auton';
    const line = game.field.autonLine;
    const ownSide = (p: V2): boolean => !line || !auton || (me.alliance === 'red' ? 1 : -1) * (line.n.x * p.x + line.n.y * p.y - line.c) > 4;
    const oppZones = game.field.loaders.filter((l) => l.alliance === other(me.alliance) && l.zone).map((l) => l.zone!);
    const okPoint = (p: V2): boolean => ownSide(p) && !oppZones.some((z) => pointInPoly(p, z));
    const cmd: RobotCommand = { ...NEUTRAL_COMMAND, assists: L.assists };
    const fp = sim.facts[i]?.footprint;
    const inOppZone = (): boolean => oppZones.some((z) => (fp ? polysOverlap(fp, z) : pointInPoly(P, z)));
    // Home: between the alliance's own goals, pulled toward the field center.
    const own = game.field.goals.filter((g) => g.owner === me.alliance);
    const home = { x: (own.reduce((a, g) => a + g.x, 0) / own.length) * 0.55, y: (own.reduce((a, g) => a + g.y, 0) / own.length) * 0.55 };
    const holo = spec.drive.type !== 'tank';
    const e = effectorPoint(spec, me.lift);

    // --- Watchdog -------------------------------------------------------------------------
    if (brain.escape > 0) {
      brain.escape--;
      return { ...cmd, fwd: -0.7, turn: 0.5 };
    }

    /** Drive so that robot-frame point (ax, 0) lands on target T. Returns remaining error (in). */
    const drive = (T: V2, ax: number, slow = 1, targetGoal: string | null = null): number => {
      const dx = T.x - P.x;
      const dy = T.y - P.y;
      const dist = Math.hypot(dx, dy);
      // Detour around goals near the straight path (never brush a stack at speed).
      let aim = T;
      // Leave an opponent Load Zone first.
      if (inOppZone()) aim = { x: P.x * 0.5, y: P.y * 0.5 };
      // Hard keep-out around goals this robot may never touch.
      const reach = spec.chassis.length / 2 + 6;
      for (const g of game.field.goals) {
        if (!forbidden.has(g.id)) continue;
        const d = Math.hypot(P.x - g.x, P.y - g.y);
        if (d < reach + 7) aim = { x: P.x + ((P.x - g.x) / (d || 1)) * 20, y: P.y + ((P.y - g.y) / (d || 1)) * 20 };
      }
      for (const g of game.field.goals) {
        if (g.id === targetGoal || aim !== T) continue;
        const t = clamp(((g.x - P.x) * dx + (g.y - P.y) * dy) / (dist * dist || 1), 0, 1);
        const cx = P.x + dx * t;
        const cy = P.y + dy * t;
        const d = Math.hypot(g.x - cx, g.y - cy);
        if (d < 16 && Math.hypot(g.x - P.x, g.y - P.y) > 10) {
          const nx = (cx - g.x) / (d || 1);
          const ny = (cy - g.y) / (d || 1);
          aim = { x: g.x + nx * 22, y: g.y + ny * 22 };
        }
      }
      // Ease off near stacked goals so the claw never strikes a stack at speed.
      const ep = sim.robotPoint(i, e.x, 0, e.z);
      const nearStack = s.stacks.some((st) => {
        if (st.levels.length === 0 || st.goalId === targetGoal) return false;
        const g = game.field.goals.find((x) => x.id === st.goalId)!;
        return Math.hypot(mToIn(ep.x) - g.x, mToIn(ep.y) - g.y) < 14;
      });
      if (nearStack) slow = Math.min(slow, 0.5);
      const ax2 = aim.x - P.x;
      const ay2 = aim.y - P.y;
      const heading = Math.atan2(ay2, ax2);
      const err = wrapAngle(heading - pose.th);
      const along = Math.hypot(ax2, ay2) - (aim === T ? ax : 0);
      const turn = clamp(-err * 1.6 + pose.w * 0.18, -1, 1) * L.turn;
      // Proportional approach with a floor so the last inch doesn't take forever.
      const approach = (div: number): number => {
        const v = clamp(along / div, -1, 1) * L.speed * slow;
        return Math.abs(along) < 0.15 ? 0 : Math.sign(v) * Math.max(Math.abs(v), 0.12);
      };
      if (holo) {
        const k = approach(12);
        cmd.field = { x: Math.cos(heading) * k, y: Math.sin(heading) * k };
        cmd.turn = turn;
      } else {
        cmd.turn = turn;
        cmd.fwd = Math.abs(err) < 0.35 ? approach(8) * Math.cos(err) : 0;
      }
      return Math.abs(along) + Math.abs(err) * 3;
    };

    /** Distance (in) from the effector point to T. */
    const effErr = (T: V2): number => {
      const ep = sim.robotPoint(i, e.x, 0, e.z);
      return Math.hypot(mToIn(ep.x) - T.x, mToIn(ep.y) - T.y);
    };

    const tapped = (btn: 'gripPin' | 'gripCup' | 'tool'): void => {
      if (s.tick - brain.lastPress > L.react) {
        cmd[btn] = true;
        brain.lastPress = s.tick;
      }
    };

    // --- Decide ----------------------------------------------------------------------------
    const holding = me.slots.find((x) => x >= 0) ?? (me.store[0] ?? -1);
    if (s.tick >= brain.decideAt || brain.task.kind === 'idle') {
      brain.decideAt = s.tick + TICK_HZ * 2;
      if (style === 'mixed' && s.tick > TICK_HZ * 40) brain.mode = 'scorer';
      const wanted = game.bots
        .wantDetents(me.alliance)
        .filter((d) => sim.detentState(d.id).color !== d.color)
        .map((d) => game.field.detents.find((x) => x.id === d.id)!)
        .filter((d) => okPoint({ x: d.pivot.x + d.inward.x * 14, y: d.pivot.y + d.inward.y * 14 }));
      if (style === 'defender' && sim.phase === 'driver') {
        const opps = s.robots.filter((r) => r.alliance !== me.alliance);
        if (opps.length) brain.task = { kind: 'defend', robot: opps[0].index };
      } else if ((style === 'controller' || (style === 'mixed' && brain.mode === 'controller')) && wanted.length) {
        wanted.sort((a, b) => Math.hypot(a.pivot.x - P.x, a.pivot.y - P.y) - Math.hypot(b.pivot.x - P.x, b.pivot.y - P.y));
        brain.task = { kind: 'detent', id: wanted[0].id };
      } else if (holding >= 0) {
        const kind = sim.obj(holding).kind;
        const reach = liftRange(spec).zMax;
        const goal = game.bots.targetGoals(me.alliance).find((gid) => {
          const g = game.field.goals.find((x) => x.id === gid)!;
          const st = s.stacks.find((x) => x.goalId === gid)!;
          const top = stackTop(g.height, st.levels);
          return top.accepts === kind && top.z + PIN.half + 0.8 <= reach && okPoint(g);
        });
        brain.task = goal ? { kind: 'place', goal } : { kind: 'idle' };
      } else {
        let best = -1;
        let bd = Infinity;
        for (const o of s.objects) {
          if (o.loc !== 'field') continue;
          const t = sim.objPos(o.id);
          const p = { x: mToIn(t.x), y: mToIn(t.y) };
          if (!okPoint(p) || Math.abs(p.x) > 64 || Math.abs(p.y) > 64) continue;
          const up = upAxis(sim.objRot(o.id));
          if (Math.abs(up.z) < 0.88 && !spec.intake.lying) continue;
          if (game.field.goals.some((g) => Math.hypot(g.x - p.x, g.y - p.y) < (forbidden.has(g.id) ? 22 : 9))) continue;
          if (s.robots.some((r) => r.index !== i && Math.hypot(mToIn(sim.robotPose(r.index).x) - p.x, mToIn(sim.robotPose(r.index).y) - p.y) < 14)) continue;
          const d = Math.hypot(p.x - P.x, p.y - P.y) + (o.kind === 'cup' ? 20 : 0);
          if (d < bd) {
            bd = d;
            best = o.id;
          }
        }
        brain.task = best >= 0 ? { kind: 'fetch', obj: best } : { kind: 'idle' };
      }
    }

    // --- Act -------------------------------------------------------------------------------
    const t = brain.task;
    if (JSON.stringify(t) !== brain.lastTask) {
      brain.lastTask = JSON.stringify(t);
      brain.since = s.tick;
    }
    if (t.kind === 'fetch') {
      const o = sim.obj(t.obj);
      if (o.loc !== 'field' || holding >= 0) brain.decideAt = s.tick;
      else {
        const p = sim.objPos(t.obj);
        const T = { x: mToIn(p.x), y: mToIn(p.y) };
        const want = liftFor(sim, i, 3.25);
        cmd.lift = me.lift > want + 0.03 ? -1 : 0;
        if (storageCapacity(spec) > 0) cmd.intake = 1;
        drive(T, e.x, effErr(T) < 8 ? 0.4 : 0.8);
        if (effErr(T) < 1.5 && me.lift <= want + 0.05) tapped(o.kind === 'cup' ? 'gripCup' : 'gripPin');
        if (s.tick - brain.since > TICK_HZ * 8) brain.decideAt = s.tick;
      }
    } else if (t.kind === 'place') {
      const g = game.field.goals.find((x) => x.id === t.goal)!;
      const st = s.stacks.find((x) => x.goalId === t.goal)!;
      const top = stackTop(g.height, st.levels);
      const want = liftFor(sim, i, top.z + PIN.half + 1.0);
      cmd.lift = Math.abs(me.lift - want) > 0.02 ? Math.sign(want - me.lift) : 0;
      const ready = Math.abs(me.lift - want) < 0.05;
      const near = effErr(g) < 10;
      drive(g, e.x, near ? 0.25 : ready ? 0.6 : 0.4, t.goal);
      if (holding < 0) brain.decideAt = s.tick;
      else if (ready && effErr(g) < Math.min(0.55, L.tol) && Math.hypot(pose.vx, pose.vy) < 0.15) {
        const k = me.slots.findIndex((x) => x >= 0);
        if (k >= 0) tapped(sim.slotKind(me, k) === 'cup' ? 'gripCup' : 'gripPin');
        else tapped('gripPin');
      }
    } else if (t.kind === 'detent') {
      const d = game.field.detents.find((x) => x.id === t.id)!;
      const standoff = spec.chassis.length / 2 + 2;
      const err = drive({ x: d.pivot.x, y: d.pivot.y }, standoff, 0.7);
      if (err < 3) tapped('tool');
      const want = game.bots.wantDetents(me.alliance).find((x) => x.id === t.id)!;
      if (sim.detentState(t.id).color === want.color) {
        brain.decideAt = s.tick;
        brain.task = { kind: 'idle' };
      }
    } else if (t.kind === 'defend') {
      const q = sim.robotPose(t.robot);
      const Q = { x: mToIn(q.x), y: mToIn(q.y) };
      const touching = sim.facts[i]?.robots.includes(t.robot);
      brain.contact = touching ? brain.contact + 1 : 0;
      if (brain.contact > TICK_HZ * 2) brain.backoff = TICK_HZ;
      if (brain.backoff > 0) {
        brain.backoff--;
        cmd.fwd = -0.6;
      } else {
        const theirZones = game.field.loaders.filter((l) => l.alliance === other(me.alliance) && l.zone).map((l) => l.zone!);
        const nearForbidden = game.field.goals.some((g) => forbidden.has(g.id) && Math.hypot(g.x - Q.x, g.y - Q.y) < spec.chassis.length / 2 + 20);
        const inZone = theirZones.some((z) => pointInPoly(Q, z)) || nearForbidden;
        if (okPoint(Q) && !inZone) drive(Q, spec.chassis.length / 2 + 6, 0.9);
        else if (inZone) drive({ x: Q.x * 0.6, y: Q.y * 0.6 }, 0, 0.6);
      }
    }

    if (t.kind === 'idle' || (inOppZone() && t.kind !== 'place')) drive(inOppZone() ? { x: P.x * 0.4, y: P.y * 0.4 } : home, 0, 0.6);

    // Watchdog: commanded but not moving for 1.5 s → back out.
    const trying = Math.abs(cmd.fwd) + Math.abs(cmd.turn) + (cmd.field ? Math.hypot(cmd.field.x, cmd.field.y) : 0) > 0.2;
    const moving = Math.hypot(pose.vx, pose.vy) > 0.05 || Math.abs(pose.w) > 0.3;
    brain.stuck = trying && !moving ? brain.stuck + 1 : 0;
    if (brain.stuck > TICK_HZ * 1.5) {
      brain.stuck = 0;
      brain.escape = Math.round(TICK_HZ * 0.6);
      brain.decideAt = s.tick + brain.escape;
    }
    return cmd;
  };
  return Object.assign(fn, {
    save: () => structuredClone(brain),
    load: (st: unknown) => Object.assign(brain, structuredClone(st as Brain)),
  });
}
