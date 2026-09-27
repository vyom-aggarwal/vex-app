import {
  AUTON_LINE_Y,
  CUP_SPAWNS,
  ENDGAME_SEC,
  FIELD_HALF,
  GOALS,
  MATCH_TIMING,
  MIDFIELD,
  PIECE_RADIUS,
  PIECE_STACK_HEIGHT,
  PIN_SPAWNS,
  quadrantOf,
  RULES,
  SCORING,
  STARTING_TILES,
  TOGGLES,
  TOGGLE_SIZE,
} from './fieldConfig';
import { aabbObb, circleVsObb, clamp, localToObb, obbExtent, obbVsObb, wrapAngle, type Obb } from './geometry';
import { nextRandom } from './prng';
import { deriveRobot, integrateDrive, mixWheels, sanitizeRobotConfig } from './robot';
import type {
  Alliance,
  AllianceScore,
  GameMode,
  Goal,
  GoalScore,
  Piece,
  PieceKind,
  PinColor,
  Robot,
  RobotCommand,
  RobotConfig,
  ScoreBreakdown,
  SimState,
  StartSide,
  Toggle,
} from './types';

export const TICK_HZ = 120;
export const DT = 1 / TICK_HZ;
export const PLAYER_ID = 'player';

/** A held piece is placed on a goal if the release point is within this distance of the goal center. */
export const GOAL_CAPTURE_RADIUS = 5;
/** Release point distance past the front of the robot footprint, inches. */
export const RELEASE_GAP = 3;
const INTAKE_COOLDOWN_TICKS = Math.round(0.12 * TICK_HZ);
const OUTTAKE_COOLDOWN_TICKS = Math.round(0.3 * TICK_HZ);
const ALIGN_RANGE = 72;
const ALIGN_GAIN = 1.0;
const ALIGN_DAMP = 1.5;
const ALIGN_MAX = 0.6;

export const NEUTRAL_COMMAND: Readonly<RobotCommand> = Object.freeze({
  fwd: 0,
  strafe: 0,
  turn: 0,
  field: null,
  intake: false,
  outtake: false,
  align: false,
  autoIntake: false,
  autoScore: false,
});

export const secondsToTicks = (sec: number): number => Math.round(sec * TICK_HZ);

export interface RobotSpawn {
  id: string;
  alliance: Alliance;
  side: StartSide;
  config: RobotConfig;
  human?: boolean;
}

export interface SimOptions {
  mode: GameMode;
  seed?: number;
  playerAlliance: Alliance;
  robots: RobotSpawn[];
  /** Let robots drive during autonomous (practice). */
  autonDrive?: boolean;
  /** No game pieces or preloads (for physics tests). */
  emptyField?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

export function createSim(o: SimOptions): SimState {
  const seed = (o.seed ?? 1) >>> 0;
  const s: SimState = {
    seed,
    rng: seed,
    tick: 0,
    mode: o.mode,
    phase: o.mode === 'free' ? 'free' : 'pre',
    phaseTick: 0,
    autonDrive: !!o.autonDrive,
    playerAlliance: o.playerAlliance,
    robots: [],
    pieces: [],
    goals: [],
    toggles: [],
    autonScore: null,
    autonViolation: { red: false, blue: false },
    finalScore: null,
  };
  GOALS.forEach((g, id) =>
    s.goals.push({
      id,
      label: g.label,
      kind: g.kind,
      alliance: g.alliance,
      x: g.x,
      y: g.y,
      r: g.r,
      height: g.height,
      quadrant: g.kind === 'tall' ? null : quadrantOf(g.x, g.y),
      stack: [],
    }),
  );
  TOGGLES.forEach((t, id) =>
    s.toggles.push({ id, x: t.x, y: t.y, nx: t.nx, ny: t.ny, w: TOGGLE_SIZE.width, d: TOGGLE_SIZE.depth, owner: null, flips: 0 }),
  );
  if (!o.emptyField) {
    for (const c of CUP_SPAWNS) addPiece(s, 'cup', null, c.x, c.y);
    for (const p of PIN_SPAWNS) addPiece(s, 'pin', p.color, p.x, p.y);
    for (const g of s.goals) {
      for (let k = 0; k < GOALS[g.id].preloadPins; k++) {
        const p = addPiece(s, 'pin', 'yellow', g.x, g.y);
        p.state = 'scored';
        p.goal = g.id;
        g.stack.push(p.id);
      }
    }
  }
  for (const spawn of o.robots) {
    const tile = STARTING_TILES[spawn.alliance][spawn.side];
    const config = sanitizeRobotConfig(spawn.config);
    s.robots.push({
      id: spawn.id,
      alliance: spawn.alliance,
      human: spawn.human ?? false,
      x: tile.x,
      y: tile.y,
      theta: tile.theta,
      vx: 0,
      vy: 0,
      omega: 0,
      config,
      derived: deriveRobot(config),
      held: [],
      intakeCooldown: 0,
      outtakeCooldown: 0,
      intaking: false,
      alignTarget: null,
      stats: { scored: 0, intaked: 0, toggles: 0 },
    });
  }
  return s;
}

export function addPiece(s: SimState, kind: PieceKind, color: PinColor | null, x: number, y: number): Piece {
  const p: Piece = { id: s.pieces.length, kind, color, x, y, r: PIECE_RADIUS[kind], state: 'floor', holder: null, goal: null };
  s.pieces.push(p);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Match flow
// ---------------------------------------------------------------------------------------------

/** Leave the pre-match state. Returns false if the match already started. */
export function startMatch(s: SimState): boolean {
  if (s.phase !== 'pre') return false;
  s.phase = s.mode === 'match' ? 'auton' : 'driver';
  s.phaseTick = 0;
  return true;
}

export function robotsEnabled(s: SimState): boolean {
  return s.phase === 'driver' || s.phase === 'free' || (s.phase === 'auton' && s.autonDrive);
}

export function phaseDurationTicks(s: SimState): number {
  switch (s.phase) {
    case 'auton':
      return secondsToTicks(MATCH_TIMING.autonSec);
    case 'transition':
      return secondsToTicks(MATCH_TIMING.transitionSec);
    case 'driver':
      return secondsToTicks(s.mode === 'skills' ? MATCH_TIMING.skillsSec : MATCH_TIMING.driverSec);
    default:
      return Infinity;
  }
}

/** Final seconds of the driver period (match or skills). */
export function isEndgame(s: SimState): boolean {
  return s.phase === 'driver' && timeRemaining(s) <= ENDGAME_SEC;
}

/** Seconds left in the current period; in free practice, seconds elapsed. */
export function timeRemaining(s: SimState): number {
  switch (s.phase) {
    case 'pre':
      return s.mode === 'skills' ? MATCH_TIMING.skillsSec : MATCH_TIMING.autonSec;
    case 'free':
      return s.phaseTick / TICK_HZ;
    case 'post':
      return 0;
    default:
      return Math.max(0, (phaseDurationTicks(s) - s.phaseTick) / TICK_HZ);
  }
}

function advanceClock(s: SimState): void {
  if (s.phase === 'pre' || s.phase === 'post') return;
  s.phaseTick++;
  if (s.phase === 'free' || s.phaseTick < phaseDurationTicks(s)) return;
  if (s.phase === 'auton') {
    const sc = computeScore(s);
    s.autonScore = { red: sc.red.goalPoints, blue: sc.blue.goalPoints };
    s.phase = 'transition';
  } else if (s.phase === 'transition') {
    s.phase = 'driver';
  } else {
    s.phase = 'post';
    s.finalScore = computeScore(s);
  }
  s.phaseTick = 0;
}

// ---------------------------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------------------------

/** Advance the world one fixed tick (1/120 s). Deterministic for a given state + commands. */
export function stepSim(s: SimState, commands: Readonly<Record<string, RobotCommand>>): void {
  const enabled = robotsEnabled(s);
  const cmdFor = (r: Robot): RobotCommand => (enabled ? (commands[r.id] ?? NEUTRAL_COMMAND) : NEUTRAL_COMMAND);
  for (const r of s.robots) driveRobot(s, r, cmdFor(r));
  resolveRobots(s);
  for (const r of s.robots) manipulate(s, r, cmdFor(r));
  resolvePieces(s);
  resolveRobots(s);
  updateToggles(s);
  if (s.phase === 'auton') checkAutonLine(s);
  s.tick++;
  advanceClock(s);
}

const wheelScratch: number[] = [];

function driveRobot(s: SimState, r: Robot, cmd: RobotCommand): void {
  let fwd = clamp(cmd.fwd, -1, 1);
  let strafe = clamp(cmd.strafe, -1, 1);
  let turn = clamp(cmd.turn, -1, 1);
  const holo = r.config.drivetrain === 'xdrive';
  if (holo && cmd.field) {
    const c = Math.cos(r.theta);
    const sn = Math.sin(r.theta);
    const fx = clamp(cmd.field.x, -1, 1);
    const fy = clamp(cmd.field.y, -1, 1);
    fwd = fx * c + fy * sn;
    strafe = fx * sn - fy * c;
  }
  if (!holo) strafe = 0;
  r.alignTarget = null;
  if (cmd.align) {
    const g = findAlignGoal(s, r);
    if (g) {
      r.alignTarget = g.id;
      const err = wrapAngle(Math.atan2(g.y - r.y, g.x - r.x) - r.theta);
      const ccw = clamp(ALIGN_GAIN * err - (ALIGN_DAMP * r.omega) / r.derived.maxTurnRate, -ALIGN_MAX, ALIGN_MAX);
      turn = clamp(turn - ccw, -1, 1);
    }
  }
  mixWheels(r.derived, fwd, -strafe, -turn, wheelScratch);
  integrateDrive(r, r.derived, wheelScratch, DT);
}

// ---------------------------------------------------------------------------------------------
// Intake / outtake / goals
// ---------------------------------------------------------------------------------------------

export function stackHeight(s: SimState, g: Goal): number {
  let h = 0;
  for (const id of g.stack) h += PIECE_STACK_HEIGHT[s.pieces[id].kind];
  return h;
}

export function goalAccepts(s: SimState, g: Goal, alliance: Alliance, kind: PieceKind): boolean {
  if (stackHeight(s, g) + PIECE_STACK_HEIGHT[kind] > g.height + 1e-9) return false;
  return g.alliance === null || g.alliance === alliance || s.mode === 'skills';
}

export function releasePoint(r: Robot): { x: number; y: number } {
  const dist = r.derived.frontOffset + RELEASE_GAP;
  return { x: r.x + Math.cos(r.theta) * dist, y: r.y + Math.sin(r.theta) * dist };
}

export function intakeZoneObb(r: Robot): Obb {
  return localToObb(r.derived.intakeZone, r.x, r.y, r.theta);
}

/** Goal that a held piece would be placed on right now, if any. */
export function findScoringGoal(s: SimState, r: Robot): Goal | null {
  const p = releasePoint(r);
  const kind = heldKind(s, r);
  let best: Goal | null = null;
  let bestD = GOAL_CAPTURE_RADIUS;
  for (const g of s.goals) {
    if (!goalAccepts(s, g, r.alliance, kind)) continue;
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

/** Kind of the piece that would be released next (a Pin if the robot is empty). */
function heldKind(s: SimState, r: Robot): PieceKind {
  return r.held.length > 0 ? s.pieces[r.held[0]].kind : 'pin';
}

function findAlignGoal(s: SimState, r: Robot): Goal | null {
  const kind = heldKind(s, r);
  let best: Goal | null = null;
  let bestD = ALIGN_RANGE;
  for (const g of s.goals) {
    if (!goalAccepts(s, g, r.alliance, kind)) continue;
    const d = Math.hypot(g.x - r.x, g.y - r.y);
    if (d < bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

function findIntakeTarget(s: SimState, r: Robot): Piece | null {
  const z = intakeZoneObb(r);
  const reach = z.hx + z.hy + 3;
  let best: Piece | null = null;
  let bestD = Infinity;
  for (const p of s.pieces) {
    if (p.state !== 'floor') continue;
    if (Math.abs(p.x - z.x) > reach || Math.abs(p.y - z.y) > reach) continue;
    if (!circleVsObb(p.x, p.y, p.r, z)) continue;
    const d = (p.x - z.x) ** 2 + (p.y - z.y) ** 2;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function manipulate(s: SimState, r: Robot, cmd: RobotCommand): void {
  if (r.intakeCooldown > 0) r.intakeCooldown--;
  if (r.outtakeCooldown > 0) r.outtakeCooldown--;
  const goal = r.held.length > 0 ? findScoringGoal(s, r) : null;
  if (cmd.outtake || (cmd.autoScore && goal)) {
    r.intaking = false;
    if (r.held.length > 0 && r.outtakeCooldown === 0) {
      releasePiece(s, r, goal);
      r.outtakeCooldown = OUTTAKE_COOLDOWN_TICKS;
    }
    return;
  }
  const target = r.held.length < r.config.capacity ? findIntakeTarget(s, r) : null;
  r.intaking = cmd.intake || (cmd.autoIntake && target !== null);
  if (r.intaking && target && r.intakeCooldown === 0) {
    target.state = 'held';
    target.holder = r.id;
    r.held.push(target.id);
    r.stats.intaked++;
    r.intakeCooldown = INTAKE_COOLDOWN_TICKS;
  }
}

function releasePiece(s: SimState, r: Robot, goal: Goal | null): void {
  const id = r.held.shift();
  if (id === undefined) return;
  const p = s.pieces[id];
  p.holder = null;
  if (goal) {
    p.state = 'scored';
    p.goal = goal.id;
    p.x = goal.x;
    p.y = goal.y;
    goal.stack.push(id);
    r.stats.scored++;
    return;
  }
  const rp = releasePoint(r);
  const lim = FIELD_HALF - p.r;
  p.state = 'floor';
  p.goal = null;
  p.x = clamp(rp.x + (nextRandom(s) - 0.5) * 0.5, -lim, lim);
  p.y = clamp(rp.y + (nextRandom(s) - 0.5) * 0.5, -lim, lim);
}

// ---------------------------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------------------------

export function robotObbs(r: Robot): Obb[] {
  return r.derived.shapes.map((b) => localToObb(b, r.x, r.y, r.theta));
}

function shiftRobot(r: Robot, obbs: Obb[], dx: number, dy: number): void {
  r.x += dx;
  r.y += dy;
  for (const o of obbs) {
    o.x += dx;
    o.y += dy;
  }
}

/** Remove the velocity component heading into an obstacle along n (n points from robot to obstacle). */
function killVelocityInto(r: Robot, nx: number, ny: number): void {
  const vn = r.vx * nx + r.vy * ny;
  if (vn > 0) {
    r.vx -= vn * nx;
    r.vy -= vn * ny;
  }
}

function resolveRobots(s: SimState): void {
  const obbs = s.robots.map(robotObbs);
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < s.robots.length; i++) {
      for (let j = i + 1; j < s.robots.length; j++) {
        collideRobotPair(s.robots[i], obbs[i], s.robots[j], obbs[j]);
      }
    }
    for (let i = 0; i < s.robots.length; i++) {
      const r = s.robots[i];
      for (const o of obbs[i]) {
        for (const g of s.goals) {
          const hit = circleVsObb(g.x, g.y, g.r, o);
          if (!hit) continue;
          shiftRobot(r, obbs[i], -hit.nx * hit.depth, -hit.ny * hit.depth);
          killVelocityInto(r, hit.nx, hit.ny);
        }
      }
      constrainRobotToField(r, obbs[i]);
    }
  }
}

function collideRobotPair(a: Robot, oa: Obb[], b: Robot, ob: Obb[]): void {
  for (const sa of oa) {
    for (const sb of ob) {
      const hit = obbVsObb(sa, sb);
      if (!hit) continue;
      const half = hit.depth / 2;
      shiftRobot(a, oa, -hit.nx * half, -hit.ny * half);
      shiftRobot(b, ob, hit.nx * half, hit.ny * half);
      const rel = (b.vx - a.vx) * hit.nx + (b.vy - a.vy) * hit.ny;
      if (rel < 0) {
        const j = rel / 2;
        a.vx += j * hit.nx;
        a.vy += j * hit.ny;
        b.vx -= j * hit.nx;
        b.vy -= j * hit.ny;
      }
    }
  }
}

function constrainRobotToField(r: Robot, obbs: Obb[]): void {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const o of obbs) {
    const { ex, ey } = obbExtent(o);
    minX = Math.min(minX, o.x - ex);
    maxX = Math.max(maxX, o.x + ex);
    minY = Math.min(minY, o.y - ey);
    maxY = Math.max(maxY, o.y + ey);
  }
  const H = FIELD_HALF;
  let dx = 0;
  let dy = 0;
  if (maxX > H) dx = H - maxX;
  else if (minX < -H) dx = -H - minX;
  if (maxY > H) dy = H - maxY;
  else if (minY < -H) dy = -H - minY;
  if (dx === 0 && dy === 0) return;
  shiftRobot(r, obbs, dx, dy);
  if ((dx < 0 && r.vx > 0) || (dx > 0 && r.vx < 0)) r.vx = 0;
  if ((dy < 0 && r.vy > 0) || (dy > 0 && r.vy < 0)) r.vy = 0;
}

function constrainPiece(s: SimState, p: Piece): void {
  for (const g of s.goals) {
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const rs = p.r + g.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rs * rs) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-9) {
      p.x = g.x + rs;
    } else {
      p.x = g.x + (dx / d) * rs;
      p.y = g.y + (dy / d) * rs;
    }
  }
  const lim = FIELD_HALF - p.r;
  p.x = clamp(p.x, -lim, lim);
  p.y = clamp(p.y, -lim, lim);
}

/** Pieces are light: robots shove them. A piece pinned against a wall or goal shoves the robot back instead. */
function resolvePieces(s: SimState): void {
  const floor: Piece[] = [];
  for (const p of s.pieces) if (p.state === 'floor') floor.push(p);
  if (floor.length === 0) return;
  const obbs = s.robots.map(robotObbs);
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < floor.length; i++) {
      const a = floor[i];
      for (let j = i + 1; j < floor.length; j++) {
        const b = floor[j];
        const rs = a.r + b.r;
        const dx = b.x - a.x;
        if (dx >= rs || dx <= -rs) continue;
        const dy = b.y - a.y;
        if (dy >= rs || dy <= -rs) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        let nx: number;
        let ny: number;
        let d = 0;
        if (d2 > 1e-9) {
          d = Math.sqrt(d2);
          nx = dx / d;
          ny = dy / d;
        } else {
          const ang = nextRandom(s) * Math.PI * 2;
          nx = Math.cos(ang);
          ny = Math.sin(ang);
        }
        const push = (rs - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    for (const p of floor) constrainPiece(s, p);
    for (let ri = 0; ri < s.robots.length; ri++) {
      const r = s.robots[ri];
      for (const o of obbs[ri]) {
        const reach = o.hx + o.hy + 3;
        for (const p of floor) {
          if (Math.abs(p.x - o.x) > reach || Math.abs(p.y - o.y) > reach) continue;
          const hit = circleVsObb(p.x, p.y, p.r, o);
          if (!hit) continue;
          p.x += hit.nx * hit.depth;
          p.y += hit.ny * hit.depth;
          constrainPiece(s, p);
          const jam = circleVsObb(p.x, p.y, p.r, o);
          if (jam) {
            shiftRobot(r, obbs[ri], -jam.nx * jam.depth, -jam.ny * jam.depth);
            killVelocityInto(r, jam.nx, jam.ny);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Toggles, auton line
// ---------------------------------------------------------------------------------------------

export function toggleZone(t: Toggle): Obb {
  const hx = (Math.abs(t.ny) * t.w) / 2 + (Math.abs(t.nx) * t.d) / 2;
  const hy = (Math.abs(t.nx) * t.w) / 2 + (Math.abs(t.ny) * t.d) / 2;
  return aabbObb(t.x + (t.nx * t.d) / 2, t.y + (t.ny * t.d) / 2, hx, hy);
}

function updateToggles(s: SimState): void {
  for (const t of s.toggles) {
    const zone = toggleZone(t);
    for (const r of s.robots) {
      if (t.owner === r.alliance) continue;
      if (robotObbs(r).some((o) => obbVsObb(o, zone) !== null)) {
        t.owner = r.alliance;
        t.flips++;
        r.stats.toggles++;
      }
    }
  }
}

function checkAutonLine(s: SimState): void {
  for (const r of s.robots) {
    const crossed = r.alliance === 'red' ? r.y < AUTON_LINE_Y : r.y > AUTON_LINE_Y;
    if (crossed) s.autonViolation[r.alliance] = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

export function inMidfield(r: { x: number; y: number }): boolean {
  return Math.abs(r.x) + Math.abs(r.y) <= MIDFIELD.halfDiagonal;
}

/**
 * Who yellow Pins on a goal score for: the owner of the Toggle in the goal's quadrant.
 * Tall Goal (no quadrant): per RULES.tallYellowOwner.
 */
export function yellowOwner(s: SimState, g: Goal): Alliance | null {
  if (g.quadrant === null) {
    if (RULES.tallYellowOwner === 'none') return null;
    let red = 0;
    let blue = 0;
    for (const r of s.robots) {
      if (!inMidfield(r)) continue;
      if (r.alliance === 'red') red++;
      else blue++;
    }
    return red > blue ? 'red' : blue > red ? 'blue' : null;
  }
  return s.toggles.find((t) => quadrantOf(t.x, t.y) === g.quadrant)?.owner ?? null;
}

/** Per RULES.cupCover: a Pin with a Cup directly on top of it does not score. */
export function isCovered(s: SimState, g: Goal, index: number): boolean {
  if (RULES.cupCover === 'none') return false;
  const above = g.stack[index + 1];
  return above !== undefined && s.pieces[above].kind === 'cup';
}

function emptyAllianceScore(): AllianceScore {
  return {
    pins: 0,
    pinPoints: 0,
    yellowPins: 0,
    yellowPoints: 0,
    goalPoints: 0,
    toggles: 0,
    parked: 0,
    midfieldPoints: 0,
    autonBonus: 0,
    total: 0,
  };
}

/** Score the field as it stands (live during a match, final once phase is 'post'). */
export function computeScore(s: SimState): ScoreBreakdown {
  const res: ScoreBreakdown = { red: emptyAllianceScore(), blue: emptyAllianceScore(), goals: [], autonWinner: null };
  for (const g of s.goals) {
    const gs: GoalScore = {
      id: g.id,
      label: g.label,
      kind: g.kind,
      alliance: g.alliance,
      redPins: 0,
      bluePins: 0,
      yellowPins: 0,
      cups: 0,
      covered: 0,
      yellowOwner: yellowOwner(s, g),
      red: 0,
      blue: 0,
    };
    g.stack.forEach((id, i) => {
      const p = s.pieces[id];
      if (p.kind === 'cup') {
        gs.cups++;
      } else if (isCovered(s, g, i)) {
        gs.covered++;
      } else if (p.color === 'yellow') {
        gs.yellowPins++;
        const a = gs.yellowOwner;
        if (!a) return;
        gs[a] += SCORING.yellowPin;
        res[a].yellowPins++;
        res[a].yellowPoints += SCORING.yellowPin;
      } else {
        if (p.color === 'red') gs.redPins++;
        else gs.bluePins++;
        // Skills: Pins of either alliance color count for the solo robot.
        const a = s.mode === 'skills' ? s.playerAlliance : (p.color ?? s.playerAlliance);
        gs[a] += SCORING.alliancePin;
        res[a].pins++;
        res[a].pinPoints += SCORING.alliancePin;
      }
    });
    res.red.goalPoints += gs.red;
    res.blue.goalPoints += gs.blue;
    res.goals.push(gs);
  }
  for (const t of s.toggles) {
    if (!t.owner) continue;
    res[t.owner].toggles++;
  }
  for (const r of s.robots) {
    if (!inMidfield(r)) continue;
    res[r.alliance].parked++;
    res[r.alliance].midfieldPoints += SCORING.midfieldRobot;
  }
  if (s.mode === 'match' && s.autonScore) {
    const v = s.autonViolation;
    const a = s.autonScore;
    let winner: Alliance | 'tie' | null;
    if (v.red && v.blue) winner = null;
    else if (v.red) winner = 'blue';
    else if (v.blue) winner = 'red';
    else winner = a.red > a.blue ? 'red' : a.blue > a.red ? 'blue' : 'tie';
    res.autonWinner = winner;
    if (winner === 'tie') {
      res.red.autonBonus = SCORING.autonBonus / 2;
      res.blue.autonBonus = SCORING.autonBonus / 2;
    } else if (winner) {
      res[winner].autonBonus = SCORING.autonBonus;
    }
  }
  for (const a of [res.red, res.blue]) {
    a.total = a.goalPoints + a.midfieldPoints + a.autonBonus;
  }
  return res;
}
