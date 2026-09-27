import type { Collider, RigidBody, World } from '@dimforge/rapier3d-compat';
import { clamp, hashString, pointInPoly, polysOverlap, rectCorners, wrapAngle, type V2 } from '../shared/math';
import {
  isEndgame,
  matchElapsed,
  newTimer,
  robotsEnabled,
  startTimer,
  tickTimer,
  timeRemaining,
  type TimerState,
} from '../shared/matchTimer';
import { nextRandom } from '../shared/prng';
import { DT, TICK_HZ } from '../shared/timestep';
import {
  ASSIST,
  NEUTRAL_COMMAND,
  PIN_HALVES,
  type Alliance,
  type HalfColor,
  type HpCommand,
  type ModeId,
  type PinType,
  type RobotCommand,
  type RobotEntry,
  type RobotSpec,
  type TickInput,
} from '../shared/types';
import { DEG, inToM, mToIn } from '../shared/units';
import { buildDriveModel, groupVoltages, wheelForces, type DriveModel } from './drivetrain';
import {
  CHASSIS_BASE,
  CLEARANCE,
  TOOL,
  actuationTime,
  effectorPoint,
  effectorSlots,
  footprintX,
  liftRate,
  maxUnitSize,
  pneumaticBudget,
  storageCapacity,
} from './mechanism';
import {
  G_DETENT,
  G_FIELD,
  G_HELD,
  G_NONE,
  G_OBJ,
  G_STACKED,
  RAPIER,
  cupParts,
  loadPhysics,
  octagonPoints,
  pinParts,
  quatAxisAngle,
  quatFromZ,
  quatMul,
  quatYaw,
  robotGroups,
  upAxis,
  yawOf,
  type Quat,
  type Vec3,
} from './physics';
import { CUP, PIN, SNAP_ABOVE, SNAP_BELOW, SNAP_RADIUS, levelBottoms, stackTop } from './pieces';
import { analyzeStack, stackIds } from './stacks';
import type {
  AutonResult,
  DetentDef,
  EngineEvent,
  GameDefinition,
  GoalDef,
  GoalStack,
  ModeDef,
  RobotFacts,
  RobotScoreFacts,
  RuleContext,
  ScoreInput,
  ScoreResult,
  StackLevel,
  ViolationCall,
} from './types';
import { autonViolations, newRefState, runRules, type RefState } from './violations';

// ---------------------------------------------------------------------------------------------
// Serializable state
// ---------------------------------------------------------------------------------------------

export type ObjLoc = 'field' | 'held' | 'stored' | 'goal' | 'loader' | 'supply' | 'riding';

export interface ObjState {
  id: number;
  kind: 'pin' | 'cup';
  pin: PinType | null;
  loc: ObjLoc;
  /** Robot index for held/stored. */
  holder: number;
  /** Goal id for loc 'goal'; loader id for loc 'loader'. */
  where: string;
  /** Object this one rides on (loc 'riding'). */
  base: number;
  /**
   * For carried/stacked/riding pieces: local +z (pin half 0 / cup clear half) points down.
   * Held pieces: relative to the un-flipped wrist.
   */
  zDown: boolean;
  onLine: boolean;
  supply: Alliance | null;
  body: number;
  lastRobot: number;
}

export interface RobotState {
  index: number;
  alliance: Alliance;
  lift: number;
  wrist: number;
  wristTarget: 0 | 1;
  /** Held unit root per effector slot, -1 = empty. */
  slots: number[];
  store: number[];
  prev: number;
  pneu: number;
  toolTicks: number;
  ejectTicks: number;
  grabCooldown: number;
  body: number;
  plate: number;
  stats: { placed: number; removed: number; loads: number };
}

export interface LoaderState {
  id: string;
  queue: number[];
  presented: number;
  delay: number;
}

export interface DetentState {
  id: string;
  body: number;
  forced: number;
  forceTicks: number;
  forcedBy: number;
}

export interface SimState {
  tick: number;
  rng: number;
  seed: number;
  timer: TimerState;
  objects: ObjState[];
  robots: RobotState[];
  stacks: GoalStack[];
  loaders: LoaderState[];
  detents: DetentState[];
  hpCooldown: Record<Alliance, number>;
  ref: RefState;
  auton: AutonResult | null;
  final: ScoreResult | null;
}

export interface SimOptions {
  game: GameDefinition;
  modeId: ModeId;
  robots: RobotEntry[];
  seed: number;
  autoRef?: boolean;
  worlds?: boolean;
}

type Owner =
  | { t: 'robot'; i: number }
  | { t: 'obj'; id: number }
  | { t: 'goal'; id: string }
  | { t: 'loader'; id: string }
  | { t: 'detent'; id: string }
  | { t: 'wall' }
  | { t: 'floor' };

/** Buttons packed for edge detection. */
const BTN = { gripPin: 1, gripCup: 2, wrist: 4, tool: 8 };
const packButtons = (c: RobotCommand): number =>
  (c.gripPin ? BTN.gripPin : 0) | (c.gripCup ? BTN.gripCup : 0) | (c.wrist ? BTN.wrist : 0) | (c.tool ? BTN.tool : 0);

/** Robot hitting a stack faster than this (m/s) knocks it apart from the struck level up. EST. */
export const BREAK_SPEED = 0.45;
/** Detent spring as a velocity blend (stable for light bodies): ω → gain·(target − angle). */
const DETENT_GAIN = 10;
const DETENT_BLEND = 0.25;
const DETENT_FORCE_GAIN = 14;
const DETENT_FORCE_BLEND = 0.5;
const DETENT_MAX_W = 12;
const SEAT_TOL = 6 * DEG;
const SEAT_OMEGA = 0.6;
const UPRIGHT_COS = Math.cos(28 * DEG);
const LYING_SIN = Math.sin(35 * DEG);

const halfOf = (kind: 'pin' | 'cup'): number => (kind === 'pin' ? PIN.half : CUP.half);

export class Sim {
  readonly game: GameDefinition;
  readonly mode: ModeDef;
  readonly entries: RobotEntry[];
  readonly specs: RobotSpec[];
  readonly autoRef: boolean;
  readonly worlds: boolean;
  world: World;
  state: SimState;
  /** Events raised during the last step (engine events + new violation calls). */
  events: EngineEvent[] = [];
  calls: ViolationCall[] = [];
  facts: RobotFacts[] = [];
  private models: DriveModel[];
  private owners = new Map<number, Owner>();
  private goalById = new Map<string, GoalDef>();
  private detentDefs: DetentDef[];
  private lastCmds: RobotCommand[] = [];
  private lineObjects = new Set<number>();

  static async create(opts: SimOptions): Promise<Sim> {
    await loadPhysics();
    return new Sim(opts);
  }

  /** Call loadPhysics() first (Sim.create does). */
  constructor(opts: SimOptions) {
    this.game = opts.game;
    const mode = opts.game.modes.find((m) => m.id === opts.modeId);
    if (!mode) throw new Error(`Unknown mode ${opts.modeId}`);
    this.mode = mode;
    this.entries = opts.robots;
    this.specs = opts.robots.map((r) => r.spec);
    this.autoRef = opts.autoRef ?? true;
    this.worlds = opts.worlds ?? false;
    this.models = this.specs.map((s) => buildDriveModel(s));
    this.detentDefs = opts.game.field.detents;
    for (const g of opts.game.field.goals) this.goalById.set(g.id, g);

    this.world = new RAPIER.World({ x: 0, y: 0, z: -9.81 });
    this.world.timestep = DT;
    this.state = {
      tick: 0,
      rng: opts.seed | 0,
      seed: opts.seed | 0,
      timer: newTimer(mode.timing),
      objects: [],
      robots: [],
      stacks: opts.game.field.goals.map((g) => ({ goalId: g.id, levels: [] })),
      loaders: opts.game.field.loaders.map((l) => ({ id: l.id, queue: [], presented: -1, delay: 0 })),
      detents: [],
      hpCooldown: { red: 0, blue: 0 },
      ref: newRefState(),
      auton: null,
      final: null,
    };
    this.buildField();
    this.buildObjects();
    this.buildRobots();
    this.syncCarried();
  }

  // -------------------------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------------------------

  private addCollider(desc: InstanceType<typeof RAPIER.ColliderDesc>, body: RigidBody, owner: Owner): Collider {
    const c = this.world.createCollider(desc, body);
    this.owners.set(c.handle, owner);
    return c;
  }

  private buildField(): void {
    const f = this.game.field;
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const hs = inToM(f.size / 2);
    const wallT = inToM(2);
    const wallH = inToM(f.wallHeight);
    this.addCollider(
      RAPIER.ColliderDesc.cuboid(hs + wallT * 2, hs + wallT * 2, 0.05).setTranslation(0, 0, -0.05).setFriction(0.8).setCollisionGroups(G_FIELD),
      ground,
      { t: 'floor' },
    );
    for (const [x, y, hx, hy] of [
      [hs + wallT / 2, 0, wallT / 2, hs + wallT],
      [-hs - wallT / 2, 0, wallT / 2, hs + wallT],
      [0, hs + wallT / 2, hs + wallT, wallT / 2],
      [0, -hs - wallT / 2, hs + wallT, wallT / 2],
    ])
      this.addCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, wallH / 2).setTranslation(x, y, wallH / 2).setFriction(0.3).setCollisionGroups(G_FIELD),
        ground,
        { t: 'wall' },
      );
    for (const g of f.goals) {
      const d = RAPIER.ColliderDesc.convexHull(octagonPoints(g.width, g.height))!;
      this.addCollider(d.setTranslation(inToM(g.x), inToM(g.y), 0).setFriction(0.5).setCollisionGroups(G_FIELD), ground, { t: 'goal', id: g.id });
    }
    for (const l of f.loaders) {
      this.addCollider(
        RAPIER.ColliderDesc.cuboid(inToM(l.w / 2), inToM(l.d / 2), inToM(l.h / 2))
          .setTranslation(inToM(l.x), inToM(l.y), inToM(l.h / 2))
          .setCollisionGroups(G_FIELD),
        ground,
        { t: 'loader', id: l.id },
      );
    }
    for (const d of f.detents) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(inToM(d.pivot.x), inToM(d.pivot.y), inToM(d.pivot.z)).setCanSleep(false).setAngularDamping(0.5),
      );
      const R = inToM(d.side / Math.sqrt(3));
      const u = { x: d.inward.x, y: d.inward.y };
      const axis = this.detentAxis(d);
      const L = inToM(d.length / 2);
      const pts: number[] = [];
      for (const a of [90, 210, 330]) {
        const c = Math.cos(a * DEG) * R;
        const s = Math.sin(a * DEG) * R;
        for (const sgn of [-1, 1]) pts.push(u.x * c + axis.x * L * sgn, u.y * c + axis.y * L * sgn, s + axis.z * L * sgn);
      }
      const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!.setMass(1.0).setFriction(0.6).setCollisionGroups(G_DETENT);
      this.addCollider(desc, body, { t: 'detent', id: d.id });
      const jd = RAPIER.JointData.revolute({ x: inToM(d.pivot.x), y: inToM(d.pivot.y), z: inToM(d.pivot.z) }, { x: 0, y: 0, z: 0 }, axis);
      this.world.createImpulseJoint(jd, ground, body, true);
      const start = d.detents.find((x) => x.color === d.start)!;
      body.setRotation(quatAxisAngle(axis, start.angle * DEG), true);
      this.state.detents.push({ id: d.id, body: body.handle, forced: -1, forceTicks: 0, forcedBy: -1 });
    }
  }

  detentAxis(d: DetentDef): Vec3 {
    // inward × up
    return { x: d.inward.y, y: -d.inward.x, z: 0 };
  }

  private createObjectBody(kind: 'pin' | 'cup', pos: Vec3, rot: Quat, id: number): RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation(rot).setLinearDamping(0.2).setAngularDamping(0.4),
    );
    const parts = kind === 'pin' ? pinParts() : cupParts();
    const mass = (kind === 'pin' ? PIN.massKg : CUP.massKg) / parts.length;
    for (const p of parts) {
      const d = RAPIER.ColliderDesc.convexHull(p)!.setMass(mass).setFriction(0.55).setRestitution(0.05).setCollisionGroups(G_OBJ);
      this.addCollider(d, body, { t: 'obj', id });
    }
    return body;
  }

  /** Add an object; returns its id. */
  addObject(kind: 'pin' | 'cup', pin: PinType | null, pos: Vec3, rot: Quat, loc: ObjLoc = 'field'): number {
    const id = this.state.objects.length;
    const body = this.createObjectBody(kind, pos, rot, id);
    const o: ObjState = { id, kind, pin, loc, holder: -1, where: '', base: -1, zDown: false, onLine: false, supply: null, body: body.handle, lastRobot: -1 };
    this.state.objects.push(o);
    if (loc === 'supply') this.hide(o);
    return id;
  }

  private buildObjects(): void {
    const m = this.mode;
    for (const s of m.layout) {
      const z = s.upright ? halfOf(s.kind) : s.kind === 'pin' ? PIN.collarAC / 2 : CUP.rim / 2;
      let rot: Quat;
      let zDown = false;
      if (s.upright) {
        zDown = s.kind === 'pin' ? PIN_HALVES[s.pin!][0] !== s.topColor : s.cupUp === 'opaque';
        rot = zDown ? quatAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI) : { x: 0, y: 0, z: 0, w: 1 };
      } else {
        const a = (s.lyingDir ?? 0) * DEG;
        // Lying: half 0 (or the clear end) points along lyingDir unless topColor names half 1.
        const flip = s.kind === 'pin' && s.topColor !== undefined && PIN_HALVES[s.pin!][0] !== s.topColor;
        const dir = { x: Math.cos(a) * (flip ? -1 : 1), y: Math.sin(a) * (flip ? -1 : 1), z: 0 };
        rot = quatFromZ(dir);
      }
      const id = this.addObject(s.kind, s.pin ?? null, { x: inToM(s.x), y: inToM(s.y), z: inToM(z) + 0.002 }, rot);
      const o = this.state.objects[id];
      o.zDown = zDown;
      o.onLine = !!s.onLine;
      if (o.onLine) this.lineObjects.add(id);
      if (s.nestIn !== undefined) {
        // Nested into a goal (e.g. yellow Pins starting in the neutral goals).
        this.pushLevel(s.nestIn, o, zDown);
      } else if (s.rideOn !== undefined) {
        // Rides on the previous object (e.g. a Pin nested in a Cup).
        o.loc = 'riding';
        o.base = s.rideOn;
        this.setCarried(o);
      }
    }
    for (const a of ['red', 'blue'] as Alliance[]) {
      const sup = m.supply[a];
      if (!sup) continue;
      for (let i = 0; i < sup.cups; i++) this.addSupply('cup', null, a);
      for (const [t, n] of Object.entries(sup.pins) as [PinType, number][]) for (let i = 0; i < n; i++) this.addSupply('pin', t, a);
    }
  }

  private addSupply(kind: 'pin' | 'cup', pin: PinType | null, a: Alliance): number {
    const id = this.addObject(kind, pin, { x: 0, y: 0, z: -2 - this.state.objects.length * 0.2 }, { x: 0, y: 0, z: 0, w: 1 }, 'supply');
    this.state.objects[id].supply = a;
    return id;
  }

  private buildRobots(): void {
    const byAlliance: Record<Alliance, number> = { red: 0, blue: 0 };
    this.entries.forEach((e, i) => {
      const starts = this.mode.starts.filter((s) => s.alliance === e.alliance);
      const st = starts[e.slot % starts.length] ?? starts[byAlliance[e.alliance]];
      byAlliance[e.alliance]++;
      const spec = e.spec;
      const model = this.models[i];
      // Back the robot against the start surface: center = surface point + heading × (length/2 + gap).
      const off = spec.chassis.length / 2 + 0.05;
      const cx = st.x + Math.cos(st.th * DEG) * off;
      const cy = st.y + Math.sin(st.th * DEG) * off;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(inToM(cx), inToM(cy), 0.002)
          .setRotation(quatYaw(st.th * DEG))
          .enabledRotations(false, false, true)
          .setCanSleep(false)
          .setCcdEnabled(true),
      );
      const hL = inToM(spec.chassis.length / 2);
      const hW = inToM(spec.chassis.width / 2);
      const baseH = inToM(CHASSIS_BASE - CLEARANCE);
      const grp = robotGroups(i);
      this.addCollider(
        RAPIER.ColliderDesc.cuboid(hL, hW, baseH / 2)
          .setTranslation(0, 0, inToM(CLEARANCE) + baseH / 2)
          .setMass(model.mass * 0.85)
          .setFriction(0)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setCollisionGroups(grp),
        body,
        { t: 'robot', i },
      );
      const towerH = spec.chassis.height - CHASSIS_BASE;
      if (towerH > 1) {
        this.addCollider(
          RAPIER.ColliderDesc.cuboid(hL * 0.55, hW * 0.7, inToM(towerH / 2))
            .setTranslation(-hL * 0.35, 0, inToM(CHASSIS_BASE + towerH / 2))
            .setMass(model.mass * 0.15)
            .setFriction(0)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setCollisionGroups(grp),
          body,
          { t: 'robot', i },
        );
      }
      const e0 = effectorPoint(spec, 0);
      const plate = this.addCollider(
        RAPIER.ColliderDesc.cuboid(inToM(0.4), inToM(2.4), inToM(1.3))
          .setTranslation(inToM(e0.x - 2.6), 0, inToM(e0.z))
          .setMass(0.01)
          .setFriction(0)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setCollisionGroups(grp),
        body,
        { t: 'robot', i },
      );
      const rs: RobotState = {
        index: i,
        alliance: e.alliance,
        lift: 0,
        wrist: 0,
        wristTarget: 0,
        slots: effectorSlots(spec).map(() => -1),
        store: [],
        prev: 0,
        pneu: pneumaticBudget(spec),
        toolTicks: 0,
        ejectTicks: 0,
        grabCooldown: 0,
        body: body.handle,
        plate: plate.handle,
        stats: { placed: 0, removed: 0, loads: 0 },
      };
      this.state.robots.push(rs);
      // Preload: goes straight into the robot (claw if possible, else storage).
      const pre = this.mode.preload[e.alliance];
      if (pre) {
        const id = this.addObject('pin', pre, { x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 0, w: 1 });
        const o = this.state.objects[id];
        const slot = rs.slots.findIndex((_, k) => this.slotKind(rs, k) !== 'cup');
        o.zDown = false;
        if (slot >= 0) this.hold(rs, slot, o);
        else if (storageCapacity(spec) > 0) this.storeObj(rs, o);
        else this.hold(rs, 0, o);
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------------------------

  body(h: number): RigidBody {
    return this.world.getRigidBody(h);
  }
  obj(id: number): ObjState {
    return this.state.objects[id];
  }
  get phase() {
    return this.state.timer.phase;
  }
  get remaining(): number {
    return timeRemaining(this.state.timer, this.mode.timing);
  }
  get endgame(): boolean {
    return isEndgame(this.state.timer, this.mode.timing);
  }

  robotPose(i: number): { x: number; y: number; th: number; vx: number; vy: number; w: number } {
    const b = this.body(this.state.robots[i].body);
    const t = b.translation();
    const v = b.linvel();
    return { x: t.x, y: t.y, th: yawOf(b.rotation()), vx: v.x, vy: v.y, w: b.angvel().z };
  }

  /** World position of a robot-frame point (inches). */
  robotPoint(i: number, xIn: number, yIn: number, zIn: number): Vec3 {
    const p = this.robotPose(i);
    const c = Math.cos(p.th);
    const s = Math.sin(p.th);
    const x = inToM(xIn);
    const y = inToM(yIn);
    return { x: p.x + c * x - s * y, y: p.y + s * x + c * y, z: inToM(zIn) };
  }

  objPos(id: number): Vec3 {
    const t = this.body(this.obj(id).body).translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  objRot(id: number): Quat {
    return this.body(this.obj(id).body).rotation();
  }

  /** Riders chain above a root, bottom → top (root first). */
  unitOf(rootId: number): number[] {
    const ids = [rootId];
    for (;;) {
      const top = ids[ids.length - 1];
      const next = this.state.objects.find((o) => o.loc === 'riding' && o.base === top);
      if (!next) return ids;
      ids.push(next.id);
    }
  }

  slotKind(r: RobotState, k: number): 'any' | 'pin' | 'cup' {
    return effectorSlots(this.specs[r.index])[k];
  }

  /** The seated color of a detent, or null between states. */
  detentState(id: string): { color: HalfColor | null; angle: number } {
    const k = this.state.detents.findIndex((d) => d.id === id);
    const def = this.detentDefs[k];
    const b = this.body(this.state.detents[k].body);
    const axis = this.detentAxis(def);
    const q = b.rotation();
    const ang = wrapAngle(2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w));
    const w = b.angvel();
    const omega = w.x * axis.x + w.y * axis.y + w.z * axis.z;
    const nearest = this.nearestDetent(def, ang);
    const seated = Math.abs(wrapAngle(ang - nearest.angle * DEG)) < SEAT_TOL && Math.abs(omega) < SEAT_OMEGA;
    return { color: seated ? nearest.color : null, angle: ang };
  }

  private nearestDetent(def: DetentDef, ang: number): DetentDef['detents'][number] {
    let best = def.detents[0];
    let bd = Infinity;
    for (const d of def.detents) {
      const e = Math.abs(wrapAngle(ang - d.angle * DEG));
      if (e < bd) {
        bd = e;
        best = d;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------------------------
  // Match control
  // -------------------------------------------------------------------------------------------

  start(): boolean {
    return startTimer(this.state.timer, this.mode.timing);
  }

  step(input: TickInput): void {
    const s = this.state;
    this.events = [];
    this.calls = [];
    const enabled = robotsEnabled(s.timer);
    for (const hp of input.hp) this.humanLoad(hp);
    for (const l of s.loaders) this.tickLoader(l);
    if (s.hpCooldown.red > 0) s.hpCooldown.red--;
    if (s.hpCooldown.blue > 0) s.hpCooldown.blue--;

    s.robots.forEach((r, i) => {
      let cmd = input.cmds[i] ?? NEUTRAL_COMMAND;
      if (!enabled) cmd = NEUTRAL_COMMAND;
      else cmd = this.applyAssists(r, cmd);
      this.lastCmds[i] = cmd;
      this.drive(r, cmd);
      if (enabled) this.mechanisms(r, cmd);
      r.prev = packButtons(cmd);
    });
    this.detentTorques();
    this.syncCarried();
    this.world.step();
    this.postStep();

    const ev = tickTimer(s.timer, this.mode.timing);
    if (ev === 'autonEnd') {
      s.auton = this.game.autonResult(this.scoreInput(true), s.ref.calls);
    } else if (ev === 'end') {
      s.final = this.score();
    }
    if (this.autoRef && (s.timer.phase === 'auton' || s.timer.phase === 'driver' || ev !== null)) {
      this.calls = runRules(s.ref, this.game.rules, this.ruleContext(), this.game.escalation);
    }
    s.tick++;
  }

  // -------------------------------------------------------------------------------------------
  // Drive + assists
  // -------------------------------------------------------------------------------------------

  private drive(r: RobotState, cmd: RobotCommand): void {
    const b = this.body(r.body);
    const p = this.robotPose(r.index);
    let fwd = cmd.fwd;
    let strafe = cmd.strafe;
    if (cmd.field) {
      const c = Math.cos(p.th);
      const s = Math.sin(p.th);
      fwd = cmd.field.x * c + cmd.field.y * s;
      strafe = -(-cmd.field.x * s + cmd.field.y * c);
    }
    const m = this.models[r.index];
    const volts = groupVoltages(m, clamp(fwd, -1, 1), clamp(strafe, -1, 1), clamp(cmd.turn, -1, 1));
    const f = wheelForces(m, p, volts, DT);
    b.resetForces(true);
    b.resetTorques(true);
    b.addForce({ x: f.fx, y: f.fy, z: 0 }, true);
    b.addTorque({ x: 0, y: 0, z: f.mz }, true);
  }

  /** Goal auto-align: steer so the effector point sits over the nearest useful target. */
  private applyAssists(r: RobotState, cmd: RobotCommand): RobotCommand {
    if (!(cmd.assists & ASSIST.align) || !cmd.align) return cmd;
    const spec = this.specs[r.index];
    const e = effectorPoint(spec, r.lift);
    const holding = r.slots.some((x) => x >= 0);
    let target: V2 | null = null;
    let best = inToM(30);
    const ep = this.robotPoint(r.index, e.x, 0, e.z);
    if (holding) {
      for (const g of this.game.field.goals) {
        if (this.game.bots.forbiddenGoals(r.alliance).includes(g.id)) continue;
        const d = Math.hypot(inToM(g.x) - ep.x, inToM(g.y) - ep.y);
        if (d < best) {
          best = d;
          target = { x: inToM(g.x), y: inToM(g.y) };
        }
      }
    } else {
      for (const o of this.state.objects) {
        if (o.loc !== 'field' && o.loc !== 'loader') continue;
        const t = this.objPos(o.id);
        const d = Math.hypot(t.x - ep.x, t.y - ep.y);
        if (d < best) {
          best = d;
          target = { x: t.x, y: t.y };
        }
      }
    }
    if (!target) return cmd;
    const p = this.robotPose(r.index);
    const c = Math.cos(p.th);
    const s = Math.sin(p.th);
    // Target in the robot frame, relative to the effector point.
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const lx = c * dx + s * dy - inToM(e.x);
    const ly = -s * dx + c * dy;
    const out = { ...cmd };
    const holo = this.models[r.index].kind !== 'tank';
    const k = 1 / inToM(6);
    if (holo) {
      out.fwd = clamp(cmd.fwd + lx * k * 0.6, -1, 1);
      out.strafe = clamp(cmd.strafe - ly * k * 0.6, -1, 1);
      out.field = null;
    } else {
      const ang = Math.atan2(ly, lx + inToM(e.x));
      out.turn = clamp(cmd.turn - ang * 2.2, -1, 1);
      if (Math.abs(ang) < 0.25) out.fwd = clamp(cmd.fwd + lx * k * 0.5, -1, 1);
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Mechanisms: lift, wrist, grips, intake, tool
  // -------------------------------------------------------------------------------------------

  private mechanisms(r: RobotState, cmd: RobotCommand): void {
    const spec = this.specs[r.index];
    const pressed = (bit: number): boolean => (packButtons(cmd) & bit) !== 0 && (r.prev & bit) === 0;
    r.lift = clamp(r.lift + cmd.lift * liftRate(spec) * DT, 0, 1);
    const e = effectorPoint(spec, r.lift);
    this.world.getCollider(r.plate).setTranslationWrtParent({ x: inToM(e.x - 2.6), y: 0, z: inToM(e.z) });
    if (r.grabCooldown > 0) r.grabCooldown--;

    // Wrist flip (single pieces only).
    if (pressed(BTN.wrist) && spec.effector.wrist && this.canActuate(r, spec.effector.actuation === 'pneumatic')) {
      const units = r.slots.filter((x) => x >= 0).map((x) => this.unitOf(x).length);
      if (units.every((n) => n <= 1)) r.wristTarget = r.wristTarget ? 0 : 1;
    }
    const wt = actuationTime(spec, 'wrist');
    if (Number.isFinite(wt)) r.wrist = clamp(r.wrist + Math.sign(r.wristTarget - r.wrist) * (DT / wt), 0, 1);

    // Grips toggle their slot.
    const slots = effectorSlots(spec);
    const pneuClaw = spec.effector.actuation === 'pneumatic';
    const gripSlot = (want: 'pin' | 'cup'): number => (slots.length === 1 ? 0 : slots.indexOf(want));
    for (const [bit, want] of [
      [BTN.gripPin, 'pin'],
      [BTN.gripCup, 'cup'],
    ] as const) {
      if (!pressed(bit)) continue;
      const k = gripSlot(want);
      if (k < 0 || !this.canActuate(r, pneuClaw)) continue;
      if (r.slots[k] >= 0) this.release(r, k);
      else this.grab(r, k, want);
    }
    // Auto-grab / auto-place assists.
    if (cmd.assists & ASSIST.autoGrab && r.grabCooldown === 0) {
      r.slots.forEach((id, k) => {
        if (id < 0) {
          const want = slots[k] === 'any' ? null : slots[k];
          const c = this.captureCandidate(r, k, want as 'pin' | 'cup' | null);
          if (c) this.grab(r, k, want as 'pin' | 'cup' | null);
        }
      });
    }
    if (cmd.assists & ASSIST.autoPlace) {
      r.slots.forEach((id, k) => {
        if (id >= 0 && this.nestTarget(id, this.heldPose(r, k).pos)) this.release(r, k);
      });
    }

    // Intake: in pulls floor pieces into storage; out ejects the last stored piece.
    if (cmd.intake > 0 && spec.intake.type !== 'none') this.intake(r);
    if (r.ejectTicks > 0) r.ejectTicks--;
    if (cmd.intake < 0 && r.store.length > 0 && r.ejectTicks === 0) this.eject(r);

    // Toggle / roller tool.
    if (r.toolTicks > 0) r.toolTicks--;
    const helper = (cmd.assists & ASSIST.toolHelper) !== 0;
    if ((pressed(BTN.tool) || helper) && r.toolTicks === 0) this.useTool(r, !pressed(BTN.tool));
  }

  private canActuate(r: RobotState, pneumatic: boolean): boolean {
    if (!pneumatic) return true;
    if (r.pneu <= 0) return false;
    r.pneu--;
    return true;
  }

  /** Is this robot allowed to take on these pieces (possession / carry limit)? */
  canPossess(r: RobotState, add: number[]): boolean {
    const rule = this.game.possession;
    const units: number[][] = [];
    for (const id of r.slots) if (id >= 0) units.push(this.unitOf(id));
    for (const id of r.store) units.push([id]);
    units.push(add);
    let pins = 0;
    let cups = 0;
    let stacks = 0;
    for (const u of units) {
      if (rule.stacks > 0 && u.length > 1) {
        stacks++;
        continue;
      }
      for (const id of u) {
        if (this.obj(id).kind === 'pin') pins++;
        else cups++;
      }
    }
    return pins <= rule.pins && cups <= rule.cups && stacks <= rule.stacks;
  }

  /** Refuse an extra object: push it away and raise a possession event. */
  private refuse(r: RobotState, id: number): void {
    const o = this.obj(id);
    if (o.loc === 'field') {
      const p = this.robotPose(r.index);
      const b = this.body(o.body);
      b.applyImpulse({ x: Math.cos(p.th) * 0.02, y: Math.sin(p.th) * 0.02, z: 0.005 }, true);
    }
    this.events.push({ type: 'possession', robot: r.index, objectId: id });
  }

  /** Nearest capturable piece for slot k. Returns the object id (a unit root or a top piece). */
  captureCandidate(r: RobotState, k: number, want: 'pin' | 'cup' | null): number | null {
    const spec = this.specs[r.index];
    const kind = this.slotKind(r, k);
    const e = effectorPoint(spec, r.lift);
    const p = this.robotPose(r.index);
    const c = Math.cos(p.th);
    const s = Math.sin(p.th);
    const yOff = kind === 'pin' ? 1.8 : kind === 'cup' ? -1.8 : 0;
    let best: number | null = null;
    let bd = Infinity;
    const tops = new Set<number>();
    for (const st of this.state.stacks) {
      const last = st.levels[st.levels.length - 1];
      if (!last) continue;
      if (last.kind === 'cup') tops.add(last.id);
      else for (const pp of last.pins) tops.add(pp.id);
    }
    for (const o of this.state.objects) {
      const top = o.loc === 'riding' && !this.state.objects.some((x) => x.loc === 'riding' && x.base === o.id);
      const ok = o.loc === 'field' || o.loc === 'loader' || (o.loc === 'goal' && tops.has(o.id)) || top;
      if (!ok) continue;
      if (kind !== 'any' && o.kind !== kind) continue;
      if (o.loc === 'loader' && !this.isPresented(o)) continue;
      if (top && !this.rootAvailable(o.id)) continue;
      const t = this.objPos(o.id);
      const dx = mToIn(c * (t.x - p.x) + s * (t.y - p.y)) - e.x;
      const dy = mToIn(-s * (t.x - p.x) + c * (t.y - p.y)) - yOff;
      const dz = mToIn(t.z) - e.z;
      if (Math.abs(dx) > 2.6 || Math.abs(dy) > 2.6 || Math.abs(dz) > 2.8) continue;
      if (o.loc === 'field') {
        const up = upAxis(this.objRot(o.id));
        const upright = Math.abs(up.z) > UPRIGHT_COS;
        const lying = Math.abs(up.z) < LYING_SIN;
        if (!upright && !(lying && spec.intake.lying)) continue;
      }
      const unit = o.loc === 'field' || o.loc === 'loader' ? this.unitOf(o.id) : [o.id];
      if (unit.length > maxUnitSize(spec)) continue;
      let d = Math.hypot(dx, dy, dz);
      if (want && o.kind !== want) d += 10;
      if (d < bd) {
        bd = d;
        best = o.id;
      }
    }
    return best;
  }

  private grab(r: RobotState, k: number, want: 'pin' | 'cup' | null): void {
    let id = this.captureCandidate(r, k, want);
    if (id === null) {
      // Conveyor feeding the claw: take from storage.
      const kind = this.slotKind(r, k);
      const si = r.store.findIndex((x) => kind === 'any' || this.obj(x).kind === kind);
      if (si >= 0) {
        const sid = r.store.splice(si, 1)[0];
        this.hold(r, k, this.obj(sid));
      }
      return;
    }
    const o = this.obj(id);
    const unit = o.loc === 'field' || o.loc === 'loader' ? this.unitOf(id) : [id];
    if (!this.canPossess(r, unit)) {
      this.refuse(r, id);
      return;
    }
    const p = this.robotPose(r.index);
    const wasLoc = o.loc;
    let zDown: boolean;
    if (wasLoc === 'field') {
      const up = upAxis(this.objRot(id));
      zDown = Math.abs(up.z) > UPRIGHT_COS ? up.z < 0 : up.x * Math.cos(p.th) + up.y * Math.sin(p.th) < 0;
    } else zDown = o.zDown;
    if (wasLoc === 'goal') this.removeFromGoal(o.where, [id], r.index, true);
    if (wasLoc === 'riding') o.base = -1;
    if (wasLoc === 'loader') {
      const l = this.state.loaders.find((x) => x.id === o.where)!;
      l.presented = -1;
      l.delay = Math.round(this.game.loadDelaySec * TICK_HZ);
    }
    o.zDown = zDown !== (r.wrist > 0.5);
    this.hold(r, k, o);
  }

  private isPresented(o: ObjState): boolean {
    return o.loc === 'loader' && this.state.loaders.some((l) => l.presented === o.id);
  }

  /** A rider can be picked off only when its unit's root is loose on the field or presented at a loader. */
  private rootAvailable(id: number): boolean {
    let o = this.obj(id);
    while (o.loc === 'riding') o = this.obj(o.base);
    return o.loc === 'field' || this.isPresented(o);
  }

  private hold(r: RobotState, k: number, o: ObjState): void {
    o.loc = 'held';
    o.holder = r.index;
    o.where = '';
    o.lastRobot = r.index;
    r.slots[k] = o.id;
    this.setKinematic(o, G_HELD);
  }

  private storeObj(r: RobotState, o: ObjState): void {
    o.loc = 'stored';
    o.holder = r.index;
    o.lastRobot = r.index;
    r.store.push(o.id);
    this.setKinematic(o, G_NONE);
  }

  private setKinematic(o: ObjState, grp: number): void {
    const b = this.body(o.body);
    b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.setGroups(b, grp);
  }

  private setDynamic(o: ObjState, v?: Vec3): void {
    const b = this.body(o.body);
    b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.setGroups(b, G_OBJ);
    if (v) b.setLinvel(v, true);
  }

  private setGroups(b: RigidBody, grp: number): void {
    for (let i = 0; i < b.numColliders(); i++) b.collider(i).setCollisionGroups(grp);
  }

  private hide(o: ObjState): void {
    const b = this.body(o.body);
    b.setEnabled(false);
  }

  private show(o: ObjState): void {
    this.body(o.body).setEnabled(true);
  }

  /** Pose of a held piece (slot k). */
  heldPose(r: RobotState, k: number): { pos: Vec3; rot: Quat } {
    const spec = this.specs[r.index];
    const e = effectorPoint(spec, r.lift);
    const kind = this.slotKind(r, k);
    const yOff = kind === 'pin' ? 1.8 : kind === 'cup' ? -1.8 : 0;
    const pos = this.robotPoint(r.index, e.x, yOff, e.z);
    const th = this.robotPose(r.index).th;
    const o = this.obj(r.slots[k]);
    const wristRot = quatAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI * r.wrist);
    const base = o.zDown ? quatAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI) : { x: 0, y: 0, z: 0, w: 1 };
    return { pos, rot: quatMul(quatYaw(th), quatMul(wristRot, base)) };
  }

  /** World zDown of a held piece right now. */
  private heldZDown(r: RobotState, o: ObjState): boolean {
    return o.zDown !== r.wrist > 0.5;
  }

  private release(r: RobotState, k: number): void {
    const id = r.slots[k];
    const o = this.obj(id);
    const pose = this.heldPose(r, k);
    r.slots[k] = -1;
    r.grabCooldown = Math.round(0.4 * TICK_HZ);
    o.zDown = this.heldZDown(r, o);
    const goal = this.nestTarget(id, pose.pos);
    if (goal) {
      this.appendUnit(goal, id, r.index);
      return;
    }
    o.loc = 'field';
    o.holder = -1;
    const b = this.body(o.body);
    b.setTranslation(pose.pos, true);
    b.setRotation(pose.rot, true);
    const rp = this.robotPose(r.index);
    this.setDynamic(o, { x: rp.vx, y: rp.vy, z: 0 });
  }

  /** Goal id a unit rooted at `id` would nest into from position `pos` (piece center), or null. */
  nestTarget(id: number, pos: Vec3): string | null {
    const o = this.obj(id);
    for (const g of this.game.field.goals) {
      const dh = Math.hypot(pos.x - inToM(g.x), pos.y - inToM(g.y));
      if (dh > inToM(SNAP_RADIUS)) continue;
      const st = this.state.stacks.find((s) => s.goalId === g.id)!;
      const top = stackTop(g.height, st.levels);
      if (top.accepts !== o.kind) continue;
      const bottom = mToIn(pos.z) - halfOf(o.kind);
      if (bottom < top.z - SNAP_BELOW || bottom > top.z + SNAP_ABOVE) continue;
      return g.id;
    }
    return null;
  }

  private pushLevel(goalId: string, o: ObjState, zDown: boolean): void {
    const st = this.state.stacks.find((s) => s.goalId === goalId)!;
    const level: StackLevel =
      o.kind === 'pin'
        ? { kind: 'pins', pins: [{ id: o.id, pin: o.pin!, down: zDown ? 0 : 1 }] }
        : { kind: 'cup', id: o.id, down: zDown ? 'clear' : 'opaque' };
    st.levels.push(level);
    o.loc = 'goal';
    o.where = goalId;
    o.holder = -1;
    o.base = -1;
    o.zDown = zDown;
    this.setKinematic(o, G_STACKED);
  }

  /** Nest a unit (root + riders) onto a goal stack. */
  private appendUnit(goalId: string, rootId: number, robot: number | null): void {
    for (const id of this.unitOf(rootId)) {
      const o = this.obj(id);
      this.pushLevel(goalId, o, o.zDown);
      this.events.push({ type: 'placed', goalId, objectId: id, robot });
      if (robot !== null) this.state.robots[robot].stats.placed++;
    }
  }

  /** Remove the given objects (and everything above the lowest) from a goal stack. */
  private removeFromGoal(goalId: string, ids: number[], robot: number | null, byGrip: boolean): number[] {
    const st = this.state.stacks.find((s) => s.goalId === goalId)!;
    const before = analyzeStack(st, this.game.id === 'override');
    let lowest = st.levels.length;
    st.levels.forEach((l, i) => {
      const has = l.kind === 'cup' ? ids.includes(l.id) : l.pins.some((p) => ids.includes(p.id));
      if (has) lowest = Math.min(lowest, i);
    });
    const wasTop = lowest === st.levels.length - 1;
    let removedIds: number[];
    if (byGrip && lowest === st.levels.length - 1) {
      const l = st.levels[lowest];
      if (l.kind === 'pins' && l.pins.length > 1) {
        l.pins = l.pins.filter((p) => !ids.includes(p.id));
        removedIds = ids;
      } else {
        st.levels.pop();
        removedIds = stackIds([l]);
      }
    } else {
      removedIds = stackIds(st.levels.splice(lowest));
    }
    const placedBefore = removedIds.some(
      (id) => before.pins.some((p) => p.id === id && p.placed) || before.cups.some((c) => c.id === id && c.placed),
    );
    this.events.push({
      type: 'removed',
      goalId,
      objectIds: removedIds,
      robot,
      placedBefore,
      top: wasTop,
      count: removedIds.length,
    });
    if (robot !== null) this.state.robots[robot].stats.removed += removedIds.length;
    for (const id of removedIds) {
      const o = this.obj(id);
      o.where = '';
    }
    return removedIds;
  }

  private intake(r: RobotState): void {
    const spec = this.specs[r.index];
    const cap = storageCapacity(spec);
    const p = this.robotPose(r.index);
    const c = Math.cos(p.th);
    const s = Math.sin(p.th);
    const L = spec.chassis.length / 2;
    const halfW = Math.min(spec.chassis.width / 2 - 1, 6);
    for (const o of this.state.objects) {
      if (o.loc !== 'field' && !this.isPresented(o)) continue;
      if (this.state.objects.some((x) => x.loc === 'riding' && x.base === o.id)) continue;
      const t = this.objPos(o.id);
      if (mToIn(t.z) > 5) continue;
      const lx = mToIn(c * (t.x - p.x) + s * (t.y - p.y));
      const ly = mToIn(-s * (t.x - p.x) + c * (t.y - p.y));
      const front = spec.intake.mount !== 'back' && lx > L - 1 && lx < L + 3.5;
      const back = spec.intake.mount !== 'front' && lx < -L + 1 && lx > -L - 3.5;
      if (!(front || back) || Math.abs(ly) > halfW) continue;
      let upright = true;
      let up: Vec3 = { x: 0, y: 0, z: 1 };
      if (o.loc === 'field') {
        up = upAxis(this.objRot(o.id));
        upright = Math.abs(up.z) > UPRIGHT_COS;
        const lying = Math.abs(up.z) < LYING_SIN;
        if ((upright && !spec.intake.upright) || (lying && !spec.intake.lying) || (!upright && !lying)) continue;
      }
      if (r.store.length >= cap) return;
      if (!this.canPossess(r, [o.id])) {
        this.refuse(r, o.id);
        return;
      }
      if (o.loc === 'loader') {
        const l = this.state.loaders.find((x) => x.id === o.where)!;
        l.presented = -1;
        l.delay = Math.round(this.game.loadDelaySec * TICK_HZ);
        o.zDown = false;
      } else {
        // The intake rights a lying piece: whichever end points away from the robot ends up on top.
        const away = (up.x * c + up.y * s) * (front ? 1 : -1);
        o.zDown = upright ? up.z < 0 : away < 0;
      }
      o.where = '';
      this.storeObj(r, o);
    }
  }

  private eject(r: RobotState): void {
    const id = r.store.pop()!;
    const o = this.obj(id);
    const spec = this.specs[r.index];
    const front = spec.intake.mount !== 'back';
    const x = (spec.chassis.length / 2 + 3.5) * (front ? 1 : -1);
    const pos = this.robotPoint(r.index, x, 0, halfOf(o.kind) + 0.2);
    const b = this.body(o.body);
    b.setTranslation(pos, true);
    b.setRotation(o.zDown ? quatAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI) : { x: 0, y: 0, z: 0, w: 1 }, true);
    o.loc = 'field';
    o.holder = -1;
    const p = this.robotPose(r.index);
    const k = front ? 0.5 : -0.5;
    this.setDynamic(o, { x: p.vx + Math.cos(p.th) * k, y: p.vy + Math.sin(p.th) * k, z: 0 });
    r.ejectTicks = Math.round(0.4 * TICK_HZ);
  }

  private useTool(r: RobotState, auto: boolean): void {
    const spec = this.specs[r.index];
    const tool = TOOL[spec.tool.type];
    const p = this.robotPose(r.index);
    const front = this.robotPoint(r.index, spec.chassis.length / 2, 0, 0);
    let bestK = -1;
    let bd = Infinity;
    this.detentDefs.forEach((d, k) => {
      // Distance from the robot's front to the detent's line segment (on the tiles).
      const ax = this.detentAxis(d);
      const px = inToM(d.pivot.x);
      const py = inToM(d.pivot.y);
      const L = inToM(d.length / 2);
      const t = clamp((front.x - px) * ax.x + (front.y - py) * ax.y, -L, L);
      const qx = px + ax.x * t;
      const qy = py + ax.y * t;
      const dist = Math.hypot(front.x - qx, front.y - qy);
      const facing = Math.cos(Math.atan2(qy - p.y, qx - p.x) - p.th);
      if (facing < 0.5) return;
      if (dist < bd) {
        bd = dist;
        bestK = k;
      }
    });
    if (bestK < 0 || mToIn(bd) > tool.reach + 1.2) return;
    const def = this.detentDefs[bestK];
    const cur = this.detentState(def.id).color;
    const want: HalfColor = cur === r.alliance ? (auto ? r.alliance : 'yellow') : r.alliance;
    if (auto && cur === r.alliance) return;
    if (!def.detents.some((d) => d.color === want)) return;
    if (tool.pneumatic && !this.canActuate(r, true)) return;
    const ds = this.state.detents[bestK];
    ds.forced = def.detents.findIndex((d) => d.color === want);
    ds.forceTicks = Math.round((tool.time + 0.25) * TICK_HZ);
    ds.forcedBy = r.index;
    r.toolTicks = Math.round((tool.time + 0.3) * TICK_HZ);
  }

  private detentTorques(): void {
    this.state.detents.forEach((ds, k) => {
      const def = this.detentDefs[k];
      const b = this.body(ds.body);
      const axis = this.detentAxis(def);
      const q = b.rotation();
      const ang = wrapAngle(2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w));
      const w = b.angvel();
      const omega = w.x * axis.x + w.y * axis.y + w.z * axis.z;
      let target: number;
      let gain = DETENT_GAIN;
      let blend = DETENT_BLEND;
      if (ds.forceTicks > 0) {
        ds.forceTicks--;
        target = def.detents[ds.forced].angle * DEG;
        gain = DETENT_FORCE_GAIN;
        blend = DETENT_FORCE_BLEND;
        if (ds.forceTicks === 0) ds.forcedBy = -1;
      } else target = this.nearestDetent(def, ang).angle * DEG;
      const err = wrapAngle(ang - target);
      const wT = clamp(-gain * err, -DETENT_MAX_W, DETENT_MAX_W);
      const dw = (wT - omega) * blend;
      b.setAngvel({ x: w.x + axis.x * dw, y: w.y + axis.y * dw, z: w.z + axis.z * dw }, true);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Carried / stacked / riding poses
  // -------------------------------------------------------------------------------------------

  private setCarried(o: ObjState): void {
    const b = this.body(o.body);
    if (b.bodyType() !== RAPIER.RigidBodyType.KinematicPositionBased) this.setKinematic(o, G_NONE);
    else this.setGroups(b, G_NONE);
  }

  private placeKinematic(o: ObjState, pos: Vec3, rot: Quat, immediate: boolean): void {
    const b = this.body(o.body);
    if (immediate) {
      b.setTranslation(pos, true);
      b.setRotation(rot, true);
    }
    b.setNextKinematicTranslation(pos);
    b.setNextKinematicRotation(rot);
  }

  /** Pose all kinematic pieces for the coming step. */
  private syncCarried(): void {
    const s = this.state;
    const flipQ = quatAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI);
    const I = { x: 0, y: 0, z: 0, w: 1 };
    for (const r of s.robots) {
      r.slots.forEach((id, k) => {
        if (id < 0) return;
        const pose = this.heldPose(r, k);
        this.placeKinematic(this.obj(id), pose.pos, pose.rot, false);
      });
      const spec = this.specs[r.index];
      const th = this.robotPose(r.index).th;
      r.store.forEach((id, k) => {
        const o = this.obj(id);
        const pos = this.robotPoint(r.index, spec.chassis.length / 2 - 3 - 3.4 * k, 0, CHASSIS_BASE + halfOf(o.kind));
        this.placeKinematic(o, pos, quatMul(quatYaw(th), o.zDown ? flipQ : I), false);
      });
    }
    for (const st of s.stacks) {
      const g = this.goalById.get(st.goalId)!;
      const bottoms = levelBottoms(g.height, st.levels);
      st.levels.forEach((l, i) => {
        const ids = l.kind === 'cup' ? [{ id: l.id, zDown: l.down === 'clear' }] : l.pins.map((p) => ({ id: p.id, zDown: p.down === 0 }));
        ids.forEach(({ id, zDown }, j) => {
          const o = this.obj(id);
          const pos = { x: inToM(g.x) + j * 0.01, y: inToM(g.y), z: inToM(bottoms[i] + halfOf(o.kind)) };
          this.placeKinematic(o, pos, zDown ? flipQ : I, true);
        });
      });
    }
    for (const l of s.loaders) {
      if (l.presented < 0) continue;
      const def = this.game.field.loaders.find((x) => x.id === l.id)!;
      const o = this.obj(l.presented);
      const pos = { x: inToM(def.exit.x), y: inToM(def.exit.y), z: inToM(halfOf(o.kind)) };
      this.placeKinematic(o, pos, o.zDown ? flipQ : I, true);
    }
    // Riders follow their base, stacked along the base's up axis.
    for (const o of s.objects) {
      if (o.loc === 'riding' || o.base >= 0 || !this.isRoot(o.id)) continue;
      const unit = this.unitOf(o.id);
      if (unit.length < 2) continue;
      const b = this.body(o.body);
      let center: Vec3 = b.translation();
      let up: Vec3 = upAxis(b.rotation());
      let rootZDown = up.z < 0;
      if (o.loc === 'held') {
        const r = s.robots[o.holder];
        const pose = this.heldPose(r, r.slots.indexOf(o.id));
        center = pose.pos;
        up = upAxis(pose.rot);
        rootZDown = this.heldZDown(r, o);
      } else if (o.loc === 'loader') {
        const def = this.game.field.loaders.find((x) => x.id === o.where)!;
        center = { x: inToM(def.exit.x), y: inToM(def.exit.y), z: this.isPresented(o) ? inToM(halfOf(o.kind)) : -1 };
        up = { x: 0, y: 0, z: o.zDown ? -1 : 1 };
        rootZDown = o.zDown;
      }
      if (rootZDown) up = { x: -up.x, y: -up.y, z: -up.z };
      const levels: StackLevel[] = unit.map((id, i) => {
        const x = this.obj(id);
        const zd = i === 0 ? rootZDown : x.zDown;
        return x.kind === 'pin' ? { kind: 'pins', pins: [{ id, pin: x.pin!, down: zd ? 0 : 1 }] } : { kind: 'cup', id, down: zd ? 'clear' : 'opaque' };
      });
      const bottoms = levelBottoms(0, levels);
      const rootBottom = { x: center.x - up.x * inToM(halfOf(o.kind)), y: center.y - up.y * inToM(halfOf(o.kind)), z: center.z - up.z * inToM(halfOf(o.kind)) };
      for (let i = 1; i < unit.length; i++) {
        const x = this.obj(unit[i]);
        const off = inToM(bottoms[i] - bottoms[0] + halfOf(x.kind));
        const pos = { x: rootBottom.x + up.x * off, y: rootBottom.y + up.y * off, z: rootBottom.z + up.z * off };
        const dir = x.zDown ? { x: -up.x, y: -up.y, z: -up.z } : up;
        this.placeKinematic(x, pos, quatFromZ(dir), o.loc !== 'field');
      }
    }
  }

  private isRoot(id: number): boolean {
    const o = this.obj(id);
    return o.loc === 'field' || o.loc === 'held' || o.loc === 'loader';
  }

  // -------------------------------------------------------------------------------------------
  // After each physics step: contacts, stack breaks, free-object nesting, unit breakup
  // -------------------------------------------------------------------------------------------

  private touching(c1: Collider, c2: Collider): boolean {
    let hit = false;
    this.world.contactPair(c1, c2, (m) => {
      for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) < 0.004) hit = true;
    });
    return hit;
  }

  private postStep(): void {
    const s = this.state;
    const facts: RobotFacts[] = [];
    const struck: { goal: string; level: number; robot: number }[] = [];
    const objIndex = new Map<number, number>();
    for (const st of s.stacks)
      st.levels.forEach((l, i) => {
        for (const id of stackIds([l])) objIndex.set(id, i);
      });

    s.robots.forEach((r, i) => {
      const b = this.body(r.body);
      const touching = new Set<string>();
      const objects = new Set<number>();
      const robots = new Set<number>();
      for (let k = 0; k < b.numColliders(); k++) {
        const col = b.collider(k);
        this.world.contactPairsWith(col, (other) => {
          const ow = this.owners.get(other.handle);
          if (!ow || ow.t === 'floor') return;
          if (!this.touching(col, other)) return;
          if (ow.t === 'robot') robots.add(ow.i);
          else if (ow.t === 'obj') {
            objects.add(ow.id);
            this.obj(ow.id).lastRobot = i;
          } else if (ow.t === 'wall') touching.add('wall');
          else touching.add(ow.id);
        });
      }
      const p = this.robotPose(i);
      const speed = Math.hypot(p.vx, p.vy);
      for (const id of objects) {
        const lvl = objIndex.get(id);
        const o = this.obj(id);
        if (lvl === undefined || o.loc !== 'goal') continue;
        const g = this.goalById.get(o.where)!;
        const toward = (p.vx * (inToM(g.x) - p.x) + p.vy * (inToM(g.y) - p.y)) / (Math.hypot(inToM(g.x) - p.x, inToM(g.y) - p.y) || 1);
        if (toward > BREAK_SPEED || speed > BREAK_SPEED * 1.6) struck.push({ goal: o.where, level: lvl, robot: i });
      }
      // Mechanism strike: the effector sweeping fast through a stack's column knocks it apart.
      const spec0 = this.specs[i];
      const e0 = effectorPoint(spec0, r.lift);
      const ep = this.robotPoint(i, e0.x, 0, e0.z);
      for (const st of s.stacks) {
        if (st.levels.length === 0) continue;
        const g = this.goalById.get(st.goalId)!;
        const dh = mToIn(Math.hypot(ep.x - inToM(g.x), ep.y - inToM(g.y)));
        if (dh > 1.6) continue;
        const bottoms = levelBottoms(g.height, st.levels);
        const ez = e0.z;
        const lvl = bottoms.findIndex((b, k) => ez >= b && ez <= b + (st.levels[k].kind === 'pins' ? PIN.height : CUP.height));
        if (lvl >= 0 && speed > BREAK_SPEED) struck.push({ goal: st.goalId, level: lvl, robot: i });
      }
      // Tool contact counts as touching the detent.
      for (const d of s.detents) if (d.forcedBy === i) touching.add(d.id);
      const spec = this.specs[i];
      const fx = footprintX(spec, r.lift);
      const cmd = this.lastCmds[i] ?? NEUTRAL_COMMAND;
      facts.push({
        index: i,
        alliance: r.alliance,
        x: mToIn(p.x),
        y: mToIn(p.y),
        th: p.th,
        footprint: this.footprint(i, fx.min, fx.max),
        touching: [...touching],
        objects: [...objects],
        robots: [...robots],
        speed,
        effort: Math.min(1, Math.hypot(cmd.fwd, cmd.strafe, cmd.turn, cmd.field ? Math.hypot(cmd.field.x, cmd.field.y) : 0)),
        holding: [...r.slots.filter((x) => x >= 0), ...r.store],
      });
    });
    this.facts = facts;

    // Break struck stacks (lowest struck level per goal).
    const byGoal = new Map<string, { level: number; robot: number }>();
    for (const h of struck) {
      const cur = byGoal.get(h.goal);
      if (!cur || h.level < cur.level) byGoal.set(h.goal, { level: h.level, robot: h.robot });
    }
    for (const [goalId, h] of byGoal) this.breakStack(goalId, h.level, h.robot);

    // Free pieces falling onto a goal opening nest; tipped units fall apart.
    for (const o of s.objects) {
      if (o.loc !== 'field') continue;
      const b = this.body(o.body);
      if (b.isSleeping()) continue;
      const up = upAxis(b.rotation());
      const unit = this.unitOf(o.id);
      if (unit.length > 1 && Math.abs(up.z) < Math.cos(45 * DEG)) {
        for (const id of unit.slice(1)) {
          const x = this.obj(id);
          x.loc = 'field';
          x.base = -1;
          this.setDynamic(x, b.linvel());
        }
        continue;
      }
      const v = b.linvel();
      if (v.z > -0.02 || Math.abs(up.z) < UPRIGHT_COS) continue;
      const t = b.translation();
      o.zDown = up.z < 0;
      const goal = this.nestTarget(o.id, { x: t.x, y: t.y, z: t.z });
      if (goal) this.appendUnit(goal, o.id, o.lastRobot >= 0 ? o.lastRobot : null);
    }
  }

  private breakStack(goalId: string, level: number, robot: number): void {
    const st = this.state.stacks.find((x) => x.goalId === goalId)!;
    const ids = stackIds(st.levels.slice(level));
    const removed = this.removeFromGoal(goalId, ids, robot, false);
    const p = this.robotPose(robot);
    const dir = Math.atan2(p.vy, p.vx);
    removed.forEach((id, j) => {
      const o = this.obj(id);
      o.loc = 'field';
      const b = this.body(o.body);
      const t = b.translation();
      const jitter = (nextRandom(this.state) - 0.5) * 0.6;
      b.setTranslation({ x: t.x + Math.cos(dir + jitter) * 0.04 * (j + 1), y: t.y + Math.sin(dir + jitter) * 0.04 * (j + 1), z: t.z + 0.01 * j }, true);
      this.setDynamic(o, { x: p.vx * 0.7, y: p.vy * 0.7, z: 0.2 });
      b.setAngvel({ x: -Math.sin(dir) * 4, y: Math.cos(dir) * 4, z: 0 }, true);
    });
  }

  private footprint(i: number, xmin: number, xmax: number): V2[] {
    const p = this.robotPose(i);
    const spec = this.specs[i];
    const cx = (xmin + xmax) / 2;
    const c = Math.cos(p.th);
    const s = Math.sin(p.th);
    return rectCorners(mToIn(p.x) + c * cx, mToIn(p.y) + s * cx, p.th, (xmax - xmin) / 2, spec.chassis.width / 2);
  }

  // -------------------------------------------------------------------------------------------
  // Loaders / human player
  // -------------------------------------------------------------------------------------------

  /** Validate and perform a Match Load. Loader -1 = Free Drive spawn in front of robot 0. */
  humanLoad(hp: HpCommand): { ok: boolean; reason?: string } {
    const s = this.state;
    const fail = (reason: string, loader = ''): { ok: false; reason: string } => {
      this.events.push({ type: 'load', alliance: hp.alliance, loader, ok: false, reason });
      return { ok: false, reason };
    };
    if (hp.loader < 0) {
      if (s.timer.phase !== 'free') return fail('Spawning is only available in Free Drive');
      const pos = this.robotPoint(0, this.specs[0].chassis.length / 2 + 6, 0, 0);
      const up = { x: 0, y: 0, z: 0, w: 1 };
      if (hp.cup) this.addObject('cup', null, { ...pos, z: inToM(CUP.half) + 0.002 }, up);
      else if (hp.pin) this.addObject('pin', hp.pin, { ...pos, z: inToM(PIN.half) + 0.002 }, up);
      return { ok: true };
    }
    const def = this.game.field.loaders[hp.loader];
    if (!def) return fail('No such Loader');
    if (!this.mode.loadPhases.includes(s.timer.phase)) return fail('Loading is not allowed right now', def.id);
    if (!this.mode.loaderAccess[hp.alliance].includes(def.alliance)) return fail('Not your Loader', def.id);
    if (s.hpCooldown[hp.alliance] > 0) return fail('Wait for the previous load', def.id);
    const l = s.loaders[hp.loader];
    if (l.queue.length + (l.presented >= 0 ? 1 : 0) >= this.game.loaderCapacity) return fail('Loader is full', def.id);
    if (!hp.pin && !hp.cup) return fail('Nothing to load', def.id);
    const pool = s.objects.filter((o) => o.loc === 'supply' && o.supply === def.alliance);
    const cup = hp.cup ? pool.find((o) => o.kind === 'cup') : undefined;
    const pin = hp.pin ? pool.find((o) => o.kind === 'pin' && o.pin === hp.pin) : undefined;
    if ((hp.cup && !cup) || (hp.pin && !pin)) return fail('Supply is empty', def.id);
    const root = cup ?? pin!;
    for (const o of [cup, pin]) {
      if (!o) continue;
      o.supply = null;
      o.loc = 'loader';
      o.where = def.id;
      o.zDown = false;
      this.show(o);
      this.setKinematic(o, G_NONE);
      this.placeKinematic(o, { x: inToM(def.x), y: inToM(def.y), z: -1 }, { x: 0, y: 0, z: 0, w: 1 }, true);
    }
    if (cup && pin) {
      pin.loc = 'riding';
      pin.base = cup.id;
      pin.where = '';
    }
    l.queue.push(root.id);
    s.hpCooldown[hp.alliance] = Math.round(this.game.loadDelaySec * TICK_HZ);
    const player = s.robots.find((r) => r.alliance === hp.alliance);
    if (player) player.stats.loads++;
    this.events.push({ type: 'load', alliance: hp.alliance, loader: def.id, ok: true });
    return { ok: true };
  }

  private tickLoader(l: LoaderState): void {
    if (l.delay > 0) l.delay--;
    if (l.presented >= 0 || l.queue.length === 0 || l.delay > 0) return;
    const id = l.queue.shift()!;
    const o = this.obj(id);
    l.presented = id;
    this.setKinematic(o, G_STACKED);
  }

  // -------------------------------------------------------------------------------------------
  // Scoring and rules
  // -------------------------------------------------------------------------------------------

  scoreFacts(): RobotScoreFacts[] {
    const f = this.game.field;
    const H = f.size / 2 - 0.3;
    return this.facts.map((r) => {
      const loaders: string[] = [];
      for (const l of f.loaders) {
        const rect: V2[] = [
          { x: l.x - l.w / 2 - 0.4, y: l.y - l.d / 2 - 0.4 },
          { x: l.x + l.w / 2 + 0.4, y: l.y - l.d / 2 - 0.4 },
          { x: l.x + l.w / 2 + 0.4, y: l.y + l.d / 2 + 0.4 },
          { x: l.x - l.w / 2 - 0.4, y: l.y + l.d / 2 + 0.4 },
        ];
        if (r.touching.includes(l.id) || polysOverlap(r.footprint, rect)) loaders.push(l.id);
      }
      return {
        alliance: r.alliance,
        inMidfield: f.midfield ? polysOverlap(r.footprint, f.midfield) : false,
        touchingPerimeter: r.touching.includes('wall') || r.footprint.some((p) => Math.abs(p.x) > H || Math.abs(p.y) > H),
        loaders,
      };
    });
  }

  scoreInput(excludeMidfield = false): ScoreInput {
    const detents: Record<string, HalfColor | null> = {};
    const touched: Record<string, boolean> = {};
    for (const d of this.detentDefs) {
      detents[d.id] = this.detentState(d.id).color;
      touched[d.id] = this.facts.some((f) => f.touching.includes(d.id));
    }
    return {
      mode: this.mode.id,
      stacks: this.state.stacks,
      detents,
      detentTouched: touched,
      robots: this.scoreFacts(),
      auton: this.state.auton,
      redCards: this.state.ref.redCards,
      worlds: this.worlds,
      excludeMidfield,
    };
  }

  score(): ScoreResult {
    return this.state.final ?? this.game.scoring(this.scoreInput(), this.mode.id);
  }

  private ruleContext(): RuleContext {
    return {
      game: this.game.id,
      mode: this.mode.id,
      phase: this.state.timer.phase,
      tick: this.state.tick,
      elapsed: matchElapsed(this.state.timer),
      remaining: this.remaining,
      endgame: this.endgame,
      robots: this.facts,
      events: this.events,
      lineObjects: this.lineObjects,
      objectPos: (id) => {
        const o = this.state.objects[id];
        if (!o || o.loc === 'supply') return null;
        const t = this.objPos(id);
        return { x: mToIn(t.x), y: mToIn(t.y) };
      },
      field: this.game.field,
    };
  }

  autonViolations(): Record<Alliance, boolean> {
    return autonViolations(this.state.ref.calls);
  }

  // -------------------------------------------------------------------------------------------
  // Render / replay support
  // -------------------------------------------------------------------------------------------

  /** Pack poses for rendering: objects (x,y,z,qx,qy,qz,qw), robots (x,y,z,th,lift,wrist), detent angles. */
  poses(out?: Float32Array): Float32Array {
    const n = this.state.objects.length;
    const m = this.state.robots.length;
    const k = this.state.detents.length;
    const size = n * 7 + m * 6 + k;
    const f = out && out.length === size ? out : new Float32Array(size);
    let i = 0;
    for (const o of this.state.objects) {
      const b = this.body(o.body);
      const t = b.translation();
      const q = b.rotation();
      f[i++] = t.x;
      f[i++] = t.y;
      f[i++] = t.z;
      f[i++] = q.x;
      f[i++] = q.y;
      f[i++] = q.z;
      f[i++] = q.w;
    }
    for (const r of this.state.robots) {
      const p = this.robotPose(r.index);
      f[i++] = p.x;
      f[i++] = p.y;
      f[i++] = this.body(r.body).translation().z;
      f[i++] = p.th;
      f[i++] = r.lift;
      f[i++] = r.wrist;
    }
    for (const d of this.detentDefs) f[i++] = this.detentState(d.id).angle;
    return f;
  }

  /** Deterministic hash of logical state + every body pose. */
  hash(): string {
    const parts: string[] = [JSON.stringify(this.state)];
    this.world.forEachRigidBody((b) => {
      const t = b.translation();
      const q = b.rotation();
      parts.push(`${t.x},${t.y},${t.z},${q.x},${q.y},${q.z},${q.w}`);
    });
    return hashString(parts.join('|'));
  }

  takeSnapshot(): { state: string; world: Uint8Array } {
    return { state: JSON.stringify(this.state), world: this.world.takeSnapshot() };
  }

  restoreSnapshot(snap: { state: string; world: Uint8Array }): void {
    this.world.free();
    this.world = RAPIER.World.restoreSnapshot(snap.world);
    this.state = JSON.parse(snap.state) as SimState;
  }

  dispose(): void {
    this.world.free();
  }
}

