import type { MatchTiming, Phase } from '../shared/matchTimer';
import type { V2 } from '../shared/math';
import type { Alliance, CupHalf, GameId, HalfColor, ModeId, PinType, RobotSpec } from '../shared/types';

/**
 * GameDefinition: everything game-specific, authored in INCHES with the origin at field center,
 * +y toward the red Alliance Station, z up. The engine converts to meters when building the world.
 */

export interface GoalDef {
  id: string;
  kind: 'alliance' | 'neutral' | 'center';
  owner: Alliance | null;
  x: number;
  y: number;
  /** Height of the goal opening above the tiles. */
  height: number;
  /** Octagon across-flats of the goal body. */
  width: number;
  /** Inner diameter of the opening a Pin nests into. */
  opening: number;
  /** Quadrant / zone id this goal belongs to ('' for none). */
  region: string;
}

export interface DetentDef {
  id: string;
  kind: 'toggle' | 'roller';
  region: string;
  /** Hinge point (the prism's long axis sits here, above the wall). */
  pivot: { x: number; y: number; z: number };
  /** Unit vector pointing from the wall into the field. The hinge axis is inward × up. */
  inward: { x: number; y: number };
  /** Triangular prism: length along the wall and side of the triangle. */
  length: number;
  side: number;
  /**
   * Discrete seated states, degrees about the hinge axis. Positive rotation lifts the field-side edge.
   * The state shown is the color of the face that points up and into the field.
   */
  detents: { color: HalfColor; angle: number }[];
  start: HalfColor;
  /** Rollers spin freely through their states; toggles have end stops. */
  continuous: boolean;
}

export interface LoaderDef {
  id: string;
  alliance: Alliance;
  x: number;
  y: number;
  /** Footprint (x by y) and height. */
  w: number;
  d: number;
  h: number;
  /** Where loaded pieces come out (tile level). */
  exit: { x: number; y: number };
  /** Load Zone polygon on the tiles, if the game has one. */
  zone: V2[] | null;
}

export interface RegionDef {
  id: string;
  label: string;
  /** Alliance color of the region (quadrant color / zone color), if any. */
  color: Alliance | null;
  poly: V2[];
}

export interface TapeDef {
  a: V2;
  b: V2;
  width: number;
  color: 'white' | 'red' | 'blue' | 'yellow' | 'black';
}

export interface FieldDef {
  /** Interior size (square), inches. */
  size: number;
  wallHeight: number;
  goals: GoalDef[];
  detents: DetentDef[];
  loaders: LoaderDef[];
  regions: RegionDef[];
  tape: TapeDef[];
  /** Midfield (Override) polygon, used for SC6. */
  midfield: V2[] | null;
  /** Autonomous line: the red side is where n·p > c (n is a unit normal in the field plane). */
  autonLine: { n: V2; c: number } | null;
  /** Driver stations, for camera placement. */
  stations: { alliance: Alliance; x: number; y: number }[];
}

export interface ObjectSpawn {
  kind: 'pin' | 'cup';
  pin?: PinType;
  x: number;
  y: number;
  upright: boolean;
  /** Lying objects: direction of the object's half-0/clear end, degrees in the field plane. */
  lyingDir?: number;
  /** Pins: color of the half facing up (or the half-0 end when lying). */
  topColor?: HalfColor;
  /** Cups: which half faces up. */
  cupUp?: CupHalf;
  /** Starts on the Autonomous line (usable by either alliance in Autonomous). */
  onLine?: boolean;
  /** Starts nested in this goal (upright). */
  nestIn?: string;
  /** Starts nested on top of the layout entry with this index (e.g. a Pin in a Cup). */
  rideOn?: number;
}

export interface StartPose {
  alliance: Alliance;
  /** Point on the surface the robot's back touches (perimeter or Loader face). */
  x: number;
  y: number;
  /** Heading, degrees; 0 = +x. */
  th: number;
}

/** Contents of each alliance's Match Load supply. */
export interface SupplyDef {
  pins: Partial<Record<PinType, number>>;
  cups: number;
}

export interface ModeDef {
  id: ModeId;
  label: string;
  blurb: string;
  timing: MatchTiming;
  /** How many robots per alliance; player is always robot 0. */
  robots: { red: number; blue: number };
  starts: StartPose[];
  layout: ObjectSpawn[];
  preload: Partial<Record<Alliance, PinType>>;
  supply: Partial<Record<Alliance, SupplyDef>>;
  /** Loader alliances usable by each alliance's human player. */
  loaderAccess: Record<Alliance, Alliance[]>;
  /** Phases when loading is allowed. */
  loadPhases: Phase[];
  solo: boolean;
}

export interface PossessionRule {
  /** Loose objects a robot may control at once. */
  pins: number;
  cups: number;
  /** Nested stacks (any height) a robot may carry at once. 0 = stacks count as their parts. */
  stacks: number;
  ruleId: string;
}

export interface BuilderRules {
  startMax: number;
  footprintMax: number;
  heightMax: number | null;
  totalWatts: number;
  driveWatts: number | null;
  noPto: boolean;
  pneumaticPsi: number;
  maxTanks: number | null;
  allowStackGripper: boolean;
}

// ---------------------------------------------------------------------------------------------
// Logical nesting model (scoring reads only this)
// ---------------------------------------------------------------------------------------------

export interface StackPin {
  id: number;
  pin: PinType;
  /** Index into PIN_HALVES of the half pointing down. */
  down: 0 | 1;
}
export type StackLevel = { kind: 'pins'; pins: StackPin[] } | { kind: 'cup'; id: number; down: CupHalf };

export interface GoalStack {
  goalId: string;
  levels: StackLevel[];
}

export interface RobotScoreFacts {
  alliance: Alliance;
  inMidfield: boolean;
  touchingPerimeter: boolean;
  /** Loader ids this robot touches. */
  loaders: string[];
}

export interface ScoreInput {
  mode: ModeId;
  stacks: GoalStack[];
  /** Seated state of each detent element, or null when between detents. */
  detents: Record<string, HalfColor | null>;
  detentTouched: Record<string, boolean>;
  robots: RobotScoreFacts[];
  /** Autonomous results, filled at the end of Autonomous. */
  auton: AutonResult | null;
  /** Teams zeroed by red cards (robot indices). */
  redCards: number[];
  /** Worlds-qualifying AWP thresholds (Override). */
  worlds?: boolean;
  /** Exclude Midfield-position-dependent points (Override Autonomous Bonus). */
  excludeMidfield?: boolean;
}

export interface AutonResult {
  red: number;
  blue: number;
  violation: { red: boolean; blue: boolean };
  /** Snapshot facts used for win-point / ranking-point checks. */
  bonus: { red: number; blue: number };
  awp: { red: boolean; blue: boolean };
}

export interface ScoreLine {
  label: string;
  red: number;
  blue: number;
}

export interface ScoreResult {
  red: number;
  blue: number;
  lines: ScoreLine[];
  /** Extra results for the results screen (AWP / RP flags). */
  flags: { label: string; red: boolean; blue: boolean }[];
}

// ---------------------------------------------------------------------------------------------
// Rules / violations
// ---------------------------------------------------------------------------------------------

export interface RobotFacts {
  index: number;
  alliance: Alliance;
  x: number;
  y: number;
  th: number;
  /** Footprint polygon in inches. */
  footprint: V2[];
  /** Element ids touched this tick (goal / detent / loader ids, 'wall'). */
  touching: string[];
  /** Object ids touched this tick. */
  objects: number[];
  /** Robot indices touched this tick. */
  robots: number[];
  speed: number;
  /** Velocity (m/s, field axes). */
  vx: number;
  vy: number;
  /** Commanded drive magnitude 0..1. */
  effort: number;
  holding: number[];
}

export type EngineEvent =
  | { type: 'removed'; goalId: string; objectIds: number[]; robot: number | null; placedBefore: boolean; top: boolean; count: number }
  | { type: 'placed'; goalId: string; objectId: number; robot: number | null }
  | { type: 'possession'; robot: number; objectId: number }
  | { type: 'load'; alliance: Alliance; loader: string; ok: boolean; reason?: string };

export interface RuleContext {
  game: GameId;
  mode: ModeId;
  phase: Phase;
  tick: number;
  /** Seconds of match time elapsed and remaining in the current period. */
  elapsed: number;
  remaining: number;
  endgame: boolean;
  robots: RobotFacts[];
  events: EngineEvent[];
  /** Objects that started on the Autonomous line. */
  lineObjects: Set<number>;
  objectPos: (id: number) => V2 | null;
  field: FieldDef;
}

export type CallLevel = 'warning' | 'foul' | 'major' | 'red';

export interface ViolationCall {
  rule: string;
  robot: number;
  alliance: Alliance;
  level: CallLevel;
  text: string;
  tick: number;
  /** True if committed during Autonomous (flips the Override bonus). */
  auton: boolean;
}

export interface RuleCheck {
  id: string;
  /** Called every tick while the match is running. `mem` persists per rule. */
  check(ctx: RuleContext, mem: Record<string, number>): Omit<ViolationCall, 'tick' | 'auton'>[];
}

export interface BotHints {
  /** Goals worth targeting for an alliance, best first. */
  targetGoals(alliance: Alliance): string[];
  /** Detents an alliance wants and the color it wants them. */
  wantDetents(alliance: Alliance): { id: string; color: HalfColor }[];
  /** Goals the alliance must never touch. */
  forbiddenGoals(alliance: Alliance): string[];
}

export interface GameDefinition {
  id: GameId;
  name: string;
  field: FieldDef;
  modes: ModeDef[];
  possession: PossessionRule;
  builder: BuilderRules;
  holdingCount: number;
  /** Fouls escalate warning → yellow → red (Pinnacle). */
  escalation: boolean;
  /** Whether rules at the loaders use Load Zones (Override). */
  loaderCapacity: number;
  loadDelaySec: number;
  scoring(input: ScoreInput, modeId: ModeId): ScoreResult;
  /** Autonomous-end evaluation (bonus / AWP / auton RP). */
  autonResult(input: ScoreInput, violations: ViolationCall[]): AutonResult;
  rules: RuleCheck[];
  bots: BotHints;
  presets(): RobotSpec[];
}
