/**
 * Rebindable controls. Every action can have several keyboard keys and several gamepad buttons.
 * Gamepad indices follow the W3C "standard" mapping; labels use V5 controller names.
 */

export type Action =
  | 'forward'
  | 'back'
  | 'strafeLeft'
  | 'strafeRight'
  | 'turnLeft'
  | 'turnRight'
  | 'liftUp'
  | 'liftDown'
  | 'intakeIn'
  | 'intakeOut'
  | 'gripPin'
  | 'gripCup'
  | 'wrist'
  | 'tool'
  | 'align'
  | 'load'
  | 'loaderPrev'
  | 'loaderNext'
  | 'kindPin'
  | 'kindOpp'
  | 'kindYellow'
  | 'kindCup'
  | 'kindPair'
  | 'camera'
  | 'view2d'
  | 'breakdown'
  | 'spawn'
  | 'reset'
  | 'start'
  | 'menu';

export type ActionGroup = 'Driving' | 'Mechanisms' | 'Human player' | 'Match and view';

export interface ActionInfo {
  id: Action;
  label: string;
  group: ActionGroup;
  /** Fires once per press (menu/camera/load…) rather than being held. */
  edge: boolean;
  /** Keyboard only (driving axes come from the sticks on a gamepad). */
  keyboardOnly?: boolean;
}

export const ACTIONS: ActionInfo[] = [
  { id: 'forward', label: 'Forward', group: 'Driving', edge: false, keyboardOnly: true },
  { id: 'back', label: 'Back', group: 'Driving', edge: false, keyboardOnly: true },
  { id: 'strafeLeft', label: 'Strafe left (holonomic) / turn left (tank)', group: 'Driving', edge: false, keyboardOnly: true },
  { id: 'strafeRight', label: 'Strafe right (holonomic) / turn right (tank)', group: 'Driving', edge: false, keyboardOnly: true },
  { id: 'turnLeft', label: 'Turn left', group: 'Driving', edge: false, keyboardOnly: true },
  { id: 'turnRight', label: 'Turn right', group: 'Driving', edge: false, keyboardOnly: true },
  { id: 'align', label: 'Goal auto-align (hold)', group: 'Driving', edge: false },
  { id: 'liftUp', label: 'Lift up', group: 'Mechanisms', edge: false },
  { id: 'liftDown', label: 'Lift down', group: 'Mechanisms', edge: false },
  { id: 'intakeIn', label: 'Intake in', group: 'Mechanisms', edge: false },
  { id: 'intakeOut', label: 'Intake out', group: 'Mechanisms', edge: false },
  { id: 'gripPin', label: 'Grip / release Pin', group: 'Mechanisms', edge: false },
  { id: 'gripCup', label: 'Grip / release Cup', group: 'Mechanisms', edge: false },
  { id: 'wrist', label: 'Wrist flip', group: 'Mechanisms', edge: false },
  { id: 'tool', label: 'Toggle / Roller tool', group: 'Mechanisms', edge: false },
  { id: 'load', label: 'Feed next Match Load', group: 'Human player', edge: true },
  { id: 'loaderPrev', label: 'Previous Loader', group: 'Human player', edge: true },
  { id: 'loaderNext', label: 'Next Loader', group: 'Human player', edge: true },
  { id: 'kindPin', label: 'Load type: alliance Pin', group: 'Human player', edge: true },
  { id: 'kindOpp', label: 'Load type: other-color Pin', group: 'Human player', edge: true },
  { id: 'kindYellow', label: 'Load type: yellow Pin', group: 'Human player', edge: true },
  { id: 'kindCup', label: 'Load type: Cup', group: 'Human player', edge: true },
  { id: 'kindPair', label: 'Load type: Cup + Pin (nested)', group: 'Human player', edge: true },
  { id: 'start', label: 'Start match / pause', group: 'Match and view', edge: true },
  { id: 'reset', label: 'Restart', group: 'Match and view', edge: true },
  { id: 'menu', label: 'Menu', group: 'Match and view', edge: true },
  { id: 'camera', label: 'Cycle camera', group: 'Match and view', edge: true },
  { id: 'view2d', label: 'Toggle 2D / 3D view', group: 'Match and view', edge: true },
  { id: 'breakdown', label: 'Show score breakdown', group: 'Match and view', edge: true },
  { id: 'spawn', label: 'Spawn piece (Free drive)', group: 'Match and view', edge: true },
];

export interface Bindings {
  keys: Record<Action, string[]>;
  pad: Record<Action, number[]>;
}

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    forward: ['KeyW'],
    back: ['KeyS'],
    strafeLeft: ['KeyA'],
    strafeRight: ['KeyD'],
    turnLeft: ['KeyQ', 'ArrowLeft'],
    turnRight: ['KeyE', 'ArrowRight'],
    align: ['KeyV'],
    liftUp: ['KeyR', 'ArrowUp'],
    liftDown: ['KeyF', 'ArrowDown'],
    intakeIn: ['Space'],
    intakeOut: ['ShiftLeft', 'ShiftRight'],
    gripPin: ['KeyJ'],
    gripCup: ['KeyK'],
    wrist: ['KeyL'],
    tool: ['KeyT'],
    load: ['KeyG'],
    loaderPrev: ['BracketLeft'],
    loaderNext: ['BracketRight'],
    kindPin: ['Digit1'],
    kindYellow: ['Digit2'],
    kindCup: ['Digit3'],
    kindPair: ['Digit4'],
    kindOpp: ['Digit5'],
    start: ['Enter', 'NumpadEnter'],
    reset: ['Backspace'],
    menu: ['Escape'],
    camera: ['KeyC'],
    view2d: ['KeyM'],
    breakdown: ['Tab'],
    spawn: ['KeyP'],
  },
  pad: {
    forward: [],
    back: [],
    strafeLeft: [],
    strafeRight: [],
    turnLeft: [],
    turnRight: [],
    align: [13],
    liftUp: [4],
    liftDown: [6],
    intakeIn: [5],
    intakeOut: [7],
    gripPin: [0],
    gripCup: [1],
    wrist: [3],
    tool: [2],
    load: [12],
    loaderPrev: [14],
    loaderNext: [15],
    kindPin: [],
    kindYellow: [],
    kindCup: [],
    kindPair: [],
    kindOpp: [],
    start: [9],
    reset: [8],
    menu: [],
    camera: [11],
    view2d: [10],
    breakdown: [],
    spawn: [],
  },
};

/** Fill in any actions missing from a stored bindings object (e.g. after an update adds one). */
export function normalizeBindings(b: Partial<Bindings> | undefined): Bindings {
  const keys = { ...DEFAULT_BINDINGS.keys };
  const pad = { ...DEFAULT_BINDINGS.pad };
  for (const a of ACTIONS) {
    const k = b?.keys?.[a.id];
    const p = b?.pad?.[a.id];
    if (Array.isArray(k)) keys[a.id] = k.filter((x) => typeof x === 'string');
    if (Array.isArray(p)) pad[a.id] = p.filter((x) => Number.isInteger(x));
  }
  return { keys, pad };
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Home'];
export const padLabel = (i: number): string => PAD_NAMES[i] ?? `Button ${i}`;

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Tab: 'Tab',
  CapsLock: 'Caps',
};

export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Which actions another binding would clash with (same key/button on two actions). */
export function conflicts(b: Bindings, kind: 'keys' | 'pad', value: string | number, except: Action): Action[] {
  return ACTIONS.filter((a) => a.id !== except && (b[kind][a.id] as (string | number)[]).includes(value)).map((a) => a.id);
}
