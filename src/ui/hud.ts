import { isEndgame, timeRemaining } from '../sim/sim';
import type { Phase, ScoreBreakdown, SimState } from '../sim/types';
import { h, setText } from './dom';
import type { Settings } from './storage';

const PHASE_LABEL: Record<Phase, string> = {
  pre: 'READY',
  auton: 'AUTONOMOUS',
  transition: 'PAUSE',
  driver: 'DRIVER CONTROL',
  post: 'FINAL',
  free: 'FREE PRACTICE',
};

export function formatClock(sec: number, countUp = false): string {
  const t = countUp ? Math.floor(sec) : Math.ceil(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** In-game overlay: scorebar, phase banners, held pieces, active assists, key hints. */
export class Hud {
  private leftLabel: HTMLElement;
  private leftVal: HTMLElement;
  private leftBox: HTMLElement;
  private rightLabel: HTMLElement;
  private rightVal: HTMLElement;
  private rightBox: HTMLElement;
  private phaseEl: HTMLElement;
  private timeEl: HTMLElement;
  private banner: HTMLElement;
  private endgame: HTMLElement;
  private prompt: HTMLElement;
  private held: HTMLElement;
  private chips: HTMLElement;
  private hints: HTMLElement;
  private lastPhase: Phase | null = null;
  private bannerUntil = 0;
  private heldKey = '';

  constructor(private root: HTMLElement) {
    this.leftLabel = h('span', { class: 'sb-label' });
    this.leftVal = h('span', { class: 'sb-val' }, '0');
    this.leftBox = h('div', { class: 'sb red' }, this.leftLabel, this.leftVal);
    this.rightLabel = h('span', { class: 'sb-label' });
    this.rightVal = h('span', { class: 'sb-val' }, '0');
    this.rightBox = h('div', { class: 'sb blue' }, this.rightLabel, this.rightVal);
    this.phaseEl = h('span', { class: 'sb-phase' });
    this.timeEl = h('span', { class: 'sb-time' });
    this.banner = h('div', { class: 'banner' });
    this.endgame = h('div', { class: 'endgame' }, 'ENDGAME');
    this.prompt = h('div', { class: 'prompt' });
    this.held = h('div', { class: 'held' });
    this.chips = h('div', { class: 'chips' });
    this.hints = h('div', { class: 'hints' });
    root.replaceChildren(
      h('div', { class: 'scorebar' }, this.leftBox, h('div', { class: 'sb clock' }, this.phaseEl, this.timeEl), this.rightBox),
      this.banner,
      this.endgame,
      this.prompt,
      h('div', { class: 'hud-foot' }, this.held, this.chips, this.hints),
    );
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  reset(): void {
    this.lastPhase = null;
    this.bannerUntil = 0;
    this.banner.classList.remove('show');
  }

  private flash(text: string, now: number): void {
    setText(this.banner, text);
    this.banner.classList.add('show');
    this.bannerUntil = now + 1600;
  }

  update(s: SimState, sc: ScoreBreakdown, settings: Settings, padName: string | null): void {
    const now = performance.now();
    const me = s.robots.find((r) => r.human) ?? s.robots[0];
    const mine = s.playerAlliance;

    if (s.mode === 'match') {
      setText(this.leftLabel, 'RED');
      setText(this.leftVal, String(sc.red.total));
      setText(this.rightLabel, 'BLUE');
      setText(this.rightVal, String(sc.blue.total));
      this.leftBox.className = 'sb red';
      this.rightBox.className = 'sb blue';
    } else {
      setText(this.leftLabel, 'SCORE');
      setText(this.leftVal, String(sc[mine].total));
      setText(this.rightLabel, s.mode === 'skills' ? 'PIECES' : 'SCORED');
      setText(this.rightVal, String(me?.stats.scored ?? 0));
      this.leftBox.className = `sb ${mine}`;
      this.rightBox.className = 'sb neutral';
    }
    const label = s.mode === 'skills' && (s.phase === 'driver' || s.phase === 'pre') ? 'SKILLS' : PHASE_LABEL[s.phase];
    setText(this.phaseEl, label);
    setText(this.timeEl, formatClock(timeRemaining(s), s.phase === 'free'));
    const endgame = isEndgame(s);
    this.timeEl.classList.toggle('urgent', endgame);
    this.endgame.classList.toggle('show', endgame);

    if (s.phase !== this.lastPhase) {
      if (this.lastPhase !== null || s.phase !== 'pre') {
        if (s.phase === 'auton') this.flash(s.autonDrive ? 'AUTONOMOUS' : 'AUTONOMOUS · robot disabled', now);
        else if (s.phase === 'transition') this.flash('AUTON OVER', now);
        else if (s.phase === 'driver') this.flash(s.mode === 'skills' ? 'SKILLS RUN · GO!' : 'DRIVER CONTROL · GO!', now);
        else if (s.phase === 'post') this.flash(s.mode === 'skills' ? 'TIME!' : 'MATCH OVER', now);
      }
      this.lastPhase = s.phase;
    }
    if (this.bannerUntil && now > this.bannerUntil) {
      this.banner.classList.remove('show');
      this.bannerUntil = 0;
    }

    let prompt = '';
    if (s.phase === 'pre') prompt = 'Press Enter or Start to begin';
    else if (s.phase === 'auton' && !s.autonDrive) prompt = 'Autonomous: robot disabled (enable "Drive during autonomous" in Settings)';
    setText(this.prompt, prompt);
    this.prompt.classList.toggle('show', prompt !== '');

    if (me) {
      const key = me.held.join(',') + '/' + me.config.capacity;
      if (key !== this.heldKey) {
        this.heldKey = key;
        const dots = [];
        for (let i = 0; i < me.config.capacity; i++) {
          const pid = me.held[i];
          const p = pid === undefined ? null : s.pieces[pid];
          const cls = !p ? 'dot empty' : p.kind === 'cup' ? 'dot cup' : p.color === 'yellow' ? 'dot pin' : `dot ${p.color}`;
          dots.push(h('span', { class: cls }));
        }
        this.held.replaceChildren(h('span', { class: 'foot-label' }, 'HELD'), ...dots);
      }
    }

    const chips: string[] = [];
    if (settings.autoIntake) chips.push('Auto-intake');
    if (settings.alignAssist) chips.push(me?.alignTarget !== null && me?.alignTarget !== undefined ? 'Align ●' : 'Align (F/RB)');
    if (settings.autoScore) chips.push('Auto-score');
    if (settings.fieldCentric && me?.config.drivetrain === 'xdrive') chips.push('Field-centric');
    chips.push(padName ? 'Gamepad ✓' : 'Keyboard');
    const chipText = chips.join('  ·  ');
    setText(this.chips, chipText);

    const hint =
      s.phase === 'free'
        ? 'R: reset field  ·  Esc: menu'
        : s.phase === 'pre'
          ? 'Enter/Start: begin  ·  Esc: menu'
          : 'R/Back: restart  ·  Esc: pause';
    setText(this.hints, hint);
  }
}
