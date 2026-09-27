import {
  CARTRIDGES,
  DEFAULT_ROBOT_CONFIG,
  deriveRobot,
  GEAR_RATIOS,
  IN_PER_M,
  MAX_SIZE,
  MAX_TURN_SCRUB,
  MIN_SIZE,
  MOTOR_COUNTS,
  ROBOT_MASS_KG,
  sanitizeRobotConfig,
  WHEEL_DIAMETERS,
  WHEEL_MU,
} from '../sim/robot';
import type { Alliance, Drivetrain, GameMode, IntakeStyle, RobotConfig, StartSide } from '../sim/types';
import type { Curve, DriveMode } from '../input/mapping';
import { h, type Child } from './dom';
import { formatClock } from './hud';
import type { Records, Settings } from './storage';

export type Screen = 'main' | 'setup' | 'settings' | 'records' | 'controls';

export const CONTROLS: ReadonlyArray<readonly [string, string, string]> = [
  ['Drive', 'W / S forward-back; A / D strafe (X-drive) or turn (tank)', 'Sticks (per drive mode)'],
  ['Turn', 'Q / E or ← / →', 'Right stick X (Split Arcade)'],
  ['Intake (hold)', 'Space', 'RT / R2'],
  ['Outtake', 'Shift', 'LT / L2'],
  ['Align assist', 'F', 'RB / R1'],
  ['Start match', 'Enter', 'Start'],
  ['Restart', 'R', 'Back / Select'],
  ['Menu / pause', 'Esc', '—'],
];

export interface MenuHooks {
  play(mode: GameMode): void;
  settings(): Settings;
  saveSettings(s: Settings): void;
  robot(): RobotConfig;
  saveRobot(c: RobotConfig): void;
  records(): Records;
  resetRecords(): void;
}

type Option = readonly [string, string];

function selectRow(label: string, options: readonly Option[], value: string, onChange: (v: string) => void, hint?: string): HTMLElement {
  const sel = h(
    'select',
    { value, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
    ...options.map(([v, text]) => h('option', { value: v }, text)),
  );
  return h('label', { class: 'row' }, h('span', { class: 'row-label' }, label, hint ? h('small', null, hint) : null), sel);
}

function checkRow(label: string, checked: boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const box = h('input', { type: 'checkbox', checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) });
  return h('label', { class: 'row' }, h('span', { class: 'row-label' }, label, hint ? h('small', null, hint) : null), box);
}

function rangeRow(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  fmt: (v: number) => string,
  onChange: (v: number) => void,
): HTMLElement {
  const out = h('output', null, fmt(value));
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value: String(value),
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      out.textContent = fmt(v);
      onChange(v);
    },
  });
  return h('label', { class: 'row' }, h('span', { class: 'row-label' }, label), h('span', { class: 'range' }, input, out));
}

const section = (title: string, ...rows: Child[]): HTMLElement => h('fieldset', null, h('legend', null, title), ...rows);

export class Menus {
  screen: Screen | null = null;

  constructor(
    private root: HTMLElement,
    private hooks: MenuHooks,
  ) {}

  get visible(): boolean {
    return this.screen !== null;
  }

  show(screen: Screen): void {
    this.screen = screen;
    this.root.classList.remove('hidden');
    this.root.replaceChildren(this.build(screen));
    const first = this.root.querySelector<HTMLElement>('button, select, input');
    first?.focus({ preventScroll: true });
  }

  hide(): void {
    this.screen = null;
    this.root.classList.add('hidden');
    this.root.replaceChildren();
  }

  /** Esc inside a sub-screen returns to the main menu. */
  back(): void {
    if (this.screen && this.screen !== 'main') this.show('main');
  }

  private build(screen: Screen): HTMLElement {
    switch (screen) {
      case 'main':
        return this.mainScreen();
      case 'setup':
        return this.setupScreen();
      case 'settings':
        return this.settingsScreen();
      case 'records':
        return this.recordsScreen();
      case 'controls':
        return this.controlsScreen();
    }
  }

  private frame(title: string, body: Child[], footer: Child[] = []): HTMLElement {
    return h(
      'div',
      { class: 'panel' },
      h('header', null, h('button', { class: 'ghost', onclick: () => this.show('main') }, '← Back'), h('h2', null, title)),
      h('div', { class: 'panel-body' }, ...body),
      footer.length ? h('footer', null, ...footer) : null,
    );
  }

  private mainScreen(): HTMLElement {
    const cfg = this.hooks.robot();
    const d = deriveRobot(cfg);
    const st = this.hooks.settings();
    const btn = (title: string, sub: string, fn: () => void, primary = false): HTMLElement =>
      h('button', { class: primary ? 'menu-btn primary' : 'menu-btn', onclick: fn }, h('span', { class: 'btn-title' }, title), h('span', { class: 'btn-sub' }, sub));
    return h(
      'div',
      { class: 'panel main' },
      h('h1', null, 'OVERRIDE', h('span', { class: 'accent' }, ' SIM')),
      h('p', { class: 'tagline' }, 'Driver practice for the VEX V5 Robotics Competition 2026-27 game (unofficial)'),
      h(
        'div',
        { class: 'menu-grid' },
        btn('Match', '15 s auton + 1:45 driver', () => this.hooks.play('match'), true),
        btn('Skills', '1:00 solo run', () => this.hooks.play('skills')),
        btn('Free Practice', 'No timer · R resets the field', () => this.hooks.play('free')),
        btn('Robot Setup', `${cfg.drivetrain === 'tank' ? 'Tank' : 'X-drive'} · ${d.topSpeed.toFixed(0)} in/s · ${cfg.motorCount} motors`, () => this.show('setup')),
        btn('Settings', `${st.alliance === 'red' ? 'Red' : 'Blue'} alliance · ${driveModeName(st.driveMode)}`, () => this.show('settings')),
        btn('Records', 'Personal bests & career totals', () => this.show('records')),
        btn('Controls', 'Keyboard & gamepad', () => this.show('controls')),
      ),
      h('p', { class: 'fine' }, 'Field layout and point values are placeholders until verified against the official game manual. Not affiliated with VEX Robotics or the REC Foundation.'),
    );
  }

  private setupScreen(): HTMLElement {
    let cfg = this.hooks.robot();
    const stats = h('div', { class: 'stats' });
    const renderStats = (): void => {
      const d = deriveRobot(cfg);
      const push = Math.min(d.stallForcePerMotor * cfg.motorCount, WHEEL_MU * ROBOT_MASS_KG * 9.81);
      const row = (k: string, v: string): HTMLElement => h('div', { class: 'stat' }, h('span', null, k), h('b', null, v));
      stats.replaceChildren(
        row('Wheel speed', `${d.wheelRpm.toFixed(0)} rpm`),
        row('Top speed', `${d.topSpeed.toFixed(1)} in/s  (${(d.topSpeed / 12).toFixed(2)} ft/s)`),
        row('0 → 95% speed', `${d.timeToTop.toFixed(2)} s`),
        row('Launch accel', `${(d.peakAccel / IN_PER_M / 9.81).toFixed(2)} g`),
        row('Turn rate', `${((d.maxTurnRate * 180) / Math.PI).toFixed(0)} °/s`),
        row('Pushing force', `${push.toFixed(0)} N  (traction limit ${(WHEEL_MU * ROBOT_MASS_KG * 9.81).toFixed(0)} N)`),
        row('Footprint', `${cfg.length.toFixed(1)}" × ${cfg.width.toFixed(1)}"${cfg.intakeStyle === 'extended' ? ' + 5" intake' : ''}`),
        row('Assumed mass', `${(ROBOT_MASS_KG * 2.2046).toFixed(1)} lb`),
      );
    };
    const update = (patch: Partial<RobotConfig>): void => {
      cfg = sanitizeRobotConfig({ ...cfg, ...patch });
      this.hooks.saveRobot(cfg);
      renderStats();
    };
    renderStats();
    const inch = (v: number): string => `${v.toFixed(1)}"`;
    return this.frame(
      'Robot Setup',
      [
        h(
          'div',
          { class: 'split' },
          h(
            'div',
            null,
            section(
              'Drivetrain',
              selectRow('Type', [['tank', 'Tank'], ['xdrive', 'X-drive (holonomic)']], cfg.drivetrain, (v) => update({ drivetrain: v as Drivetrain })),
              selectRow(
                'Motor cartridge',
                CARTRIDGES.map((c) => [String(c), `${c} rpm (${c === 100 ? 'red' : c === 200 ? 'green' : 'blue'})`] as const),
                String(cfg.cartridgeRpm),
                (v) => update({ cartridgeRpm: Number(v) as RobotConfig['cartridgeRpm'] }),
              ),
              selectRow('External gear ratio', GEAR_RATIOS.map((g) => [String(g.value), g.label] as const), String(cfg.gearRatio), (v) => update({ gearRatio: Number(v) }), 'driving : driven'),
              selectRow('Wheel diameter', WHEEL_DIAMETERS.map((w) => [String(w), `${w}"`] as const), String(cfg.wheelDiameter), (v) => update({ wheelDiameter: Number(v) })),
              selectRow('Drive motors', MOTOR_COUNTS.map((m) => [String(m), `${m} motors`] as const), String(cfg.motorCount), (v) => update({ motorCount: Number(v) as RobotConfig['motorCount'] })),
              rangeRow('Turn scrub', 0, MAX_TURN_SCRUB, 0.05, cfg.turnScrub, (v) => `${Math.round(v * 100)}%`, (v) => update({ turnScrub: v })),
            ),
            section(
              'Chassis (18" × 18" start limit)',
              rangeRow('Width', MIN_SIZE, MAX_SIZE, 0.5, cfg.width, inch, (v) => update({ width: v })),
              rangeRow('Length', MIN_SIZE, MAX_SIZE, 0.5, cfg.length, inch, (v) => update({ length: v })),
            ),
            section(
              'Intake',
              selectRow(
                'Style',
                [
                  ['compact', 'Compact: short reach, small footprint'],
                  ['extended', 'Extended: +5" reach, bigger footprint'],
                ],
                cfg.intakeStyle,
                (v) => update({ intakeStyle: v as IntakeStyle }),
              ),
              selectRow('Capacity', [['1', '1 piece'], ['2', '2 pieces'], ['3', '3 pieces']], String(cfg.capacity), (v) => update({ capacity: Number(v) })),
            ),
          ),
          h('div', { class: 'stats-col' }, h('h3', null, 'Computed performance'), stats, h('p', { class: 'fine' }, 'Top speed = cartridge rpm × gear ratio × π × wheel diameter (× √2 forward on X-drive). Turn rate = ideal wheel-limited rate × (1 − turn scrub). More motors add torque, so the robot accelerates and pushes harder until the wheels slip.')),
        ),
      ],
      [
        h('button', { class: 'ghost', onclick: () => { this.hooks.saveRobot({ ...DEFAULT_ROBOT_CONFIG }); this.show('setup'); } }, 'Reset to defaults'),
        h('button', { class: 'primary', onclick: () => this.show('main') }, 'Done'),
      ],
    );
  }

  private settingsScreen(): HTMLElement {
    const s = { ...this.hooks.settings() };
    const save = (patch: Partial<Settings>): void => {
      Object.assign(s, patch);
      this.hooks.saveSettings({ ...s });
    };
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    return this.frame(
      'Settings',
      [
        h(
          'div',
          { class: 'split' },
          h(
            'div',
            null,
            section(
              'Driver station',
              selectRow('Alliance', [['red', 'Red'], ['blue', 'Blue']], s.alliance, (v) => save({ alliance: v as Alliance }), 'camera views from your driver wall'),
              selectRow('Starting tile', [['left', 'Left'], ['right', 'Right']], s.startSide, (v) => save({ startSide: v as StartSide })),
            ),
            section(
              'Driving',
              selectRow(
                'Drive mode (gamepad)',
                [['split', 'Split Arcade'], ['arcade', 'Arcade'], ['tank', 'Tank']],
                s.driveMode,
                (v) => save({ driveMode: v as DriveMode }),
              ),
              checkRow('Field-centric', s.fieldCentric, (v) => save({ fieldCentric: v }), 'X-drive only'),
              rangeRow('Stick deadzone', 0, 0.3, 0.01, s.deadzone, pct, (v) => save({ deadzone: v })),
              selectRow('Sensitivity curve', [['linear', 'Linear'], ['cubic', 'Cubic (fine control near center)']], s.curve, (v) => save({ curve: v as Curve })),
              rangeRow('Max speed scale', 0.3, 1, 0.05, s.maxSpeed, pct, (v) => save({ maxSpeed: v })),
            ),
          ),
          h(
            'div',
            null,
            section(
              'Assists',
              checkRow('Auto-intake', s.autoIntake, (v) => save({ autoIntake: v }), 'intake runs when a piece is in front'),
              checkRow('Goal-align assist', s.alignAssist, (v) => save({ alignAssist: v }), 'hold F / RB to turn toward the nearest goal'),
              checkRow('Auto-score', s.autoScore, (v) => save({ autoScore: v }), 'releases when lined up on a goal'),
            ),
            section(
              'Practice',
              checkRow('Drive during autonomous', s.autonDrive, (v) => save({ autonDrive: v }), 'otherwise the robot sits disabled for 15 s'),
              checkRow('Show intake zone & release marker', s.showZones, (v) => save({ showZones: v })),
            ),
          ),
        ),
      ],
      [h('button', { class: 'primary', onclick: () => this.show('main') }, 'Done')],
    );
  }

  private recordsScreen(): HTMLElement {
    const r = this.hooks.records();
    const c = r.career;
    const val = (v: number | null): string => (v === null ? '—' : String(v));
    const tr = (k: string, v: string): HTMLElement => h('tr', null, h('td', null, k), h('td', null, v));
    return this.frame(
      'Records',
      [
        h(
          'div',
          { class: 'split' },
          section(
            'Personal bests',
            h(
              'table',
              { class: 'kv' },
              h(
                'tbody',
                null,
                tr('Match (your alliance score)', val(r.best.match)),
                tr('Skills (1:00)', val(r.best.skills)),
                tr('Free practice (pieces in one session)', val(r.best.free)),
              ),
            ),
          ),
          section(
            'Career',
            h(
              'table',
              { class: 'kv' },
              h(
                'tbody',
                null,
                tr('Matches played', String(c.matchesPlayed)),
                tr('Match wins', String(c.wins)),
                tr('Skills runs', String(c.skillsRuns)),
                tr('Pieces scored', String(c.piecesScored)),
                tr('Toggles flipped', String(c.togglesFlipped)),
                tr('Free-practice time', formatClock(c.practiceSeconds, true)),
              ),
            ),
          ),
        ),
        h('p', { class: 'fine' }, 'Stored only in this browser (localStorage). No accounts, no online leaderboard.'),
      ],
      [
        h(
          'button',
          {
            class: 'ghost danger',
            onclick: () => {
              if (window.confirm('Reset all personal bests and career totals?')) {
                this.hooks.resetRecords();
                this.show('records');
              }
            },
          },
          'Reset records',
        ),
        h('button', { class: 'primary', onclick: () => this.show('main') }, 'Done'),
      ],
    );
  }

  private controlsScreen(): HTMLElement {
    return this.frame(
      'Controls',
      [
        h(
          'table',
          { class: 'controls' },
          h('thead', null, h('tr', null, h('th', null, 'Action'), h('th', null, 'Keyboard'), h('th', null, 'Gamepad'))),
          h('tbody', null, ...CONTROLS.map(([a, k, g]) => h('tr', null, h('td', null, a), h('td', null, k), h('td', null, g)))),
        ),
        h(
          'ul',
          { class: 'notes' },
          h('li', null, 'Gamepad drive modes: Split Arcade = left stick Y drives, right stick X turns (left X strafes on X-drive). Arcade = left stick drives and turns (right X strafes). Tank = each stick drives one side (average X strafes).'),
          h('li', null, 'Keyboard turning runs at 70% so tapping is controllable. Max speed scale applies to both.'),
          h('li', null, 'Outtake near a goal (green release marker) stacks the piece on it; anywhere else drops it in front.'),
          h('li', null, 'Drive into a wall Toggle to flip it to your alliance.'),
          h('li', null, 'Key/button rebinding is not supported.'),
        ),
      ],
      [h('button', { class: 'primary', onclick: () => this.show('main') }, 'Done')],
    );
  }
}

function driveModeName(m: DriveMode): string {
  return m === 'split' ? 'Split Arcade' : m === 'arcade' ? 'Arcade' : 'Tank';
}
