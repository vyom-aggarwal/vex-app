import type { Alliance, AllianceScore, ScoreBreakdown, SimState } from '../sim/types';
import { h } from './dom';

export function hideOverlay(root: HTMLElement): void {
  root.classList.add('hidden');
  root.replaceChildren();
}

function showOverlay(root: HTMLElement, card: HTMLElement): void {
  root.replaceChildren(card);
  root.classList.remove('hidden');
  card.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
}

export function pauseOverlay(root: HTMLElement, a: { resume(): void; restart(): void; menu(): void }): void {
  showOverlay(
    root,
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'Paused'),
      h(
        'div',
        { class: 'card-actions vertical' },
        h('button', { class: 'primary', onclick: a.resume }, 'Resume (Esc)'),
        h('button', { onclick: a.restart }, 'Restart (R)'),
        h('button', { class: 'ghost', onclick: a.menu }, 'Main menu'),
      ),
    ),
  );
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** End-of-match breakdown: Pins per goal, midfield, auton bonus. */
export function resultsOverlay(
  root: HTMLElement,
  s: SimState,
  sc: ScoreBreakdown,
  personalBest: boolean,
  a: { again(): void; menu(): void },
): void {
  const skills = s.mode === 'skills';
  const cols: Alliance[] = skills ? [s.playerAlliance] : ['red', 'blue'];
  const cell = (v: number | string, cls = ''): HTMLElement => h('td', { class: `num ${cls}` }, String(v));
  const row = (label: string, pick: (x: AllianceScore) => number, detail?: (x: AllianceScore) => string): HTMLElement =>
    h('tr', null, h('td', null, label), ...cols.map((c) => cell(detail ? `${pick(sc[c])}  (${detail(sc[c])})` : pick(sc[c]), c)));

  const goalRows = sc.goals
    .filter((g) => g.redPins + g.bluePins + g.yellowPins + g.cups + g.covered > 0)
    .map((g) => {
      const parts: string[] = [];
      if (skills) {
        if (g.redPins + g.bluePins) parts.push(plural(g.redPins + g.bluePins, 'pin'));
      } else {
        if (g.redPins) parts.push(`${g.redPins} red`);
        if (g.bluePins) parts.push(`${g.bluePins} blue`);
      }
      if (g.yellowPins) parts.push(`${g.yellowPins} yellow${g.yellowOwner ? (skills ? '' : ` → ${g.yellowOwner}`) : ' (unowned)'}`);
      if (g.cups) parts.push(plural(g.cups, 'cup'));
      if (g.covered) parts.push(`${g.covered} covered`);
      return h('tr', null, h('td', null, h('b', null, g.label), h('small', null, parts.join(' · '))), ...cols.map((c) => cell(g[c], c)));
    });

  const me = s.playerAlliance;
  let title: string;
  if (skills) title = `Skills score: ${sc[me].total}`;
  else if (sc.red.total === sc.blue.total) title = `Tie ${sc.red.total}–${sc.blue.total}`;
  else {
    const w: Alliance = sc.red.total > sc.blue.total ? 'red' : 'blue';
    title = `${w === 'red' ? 'Red' : 'Blue'} wins ${Math.max(sc.red.total, sc.blue.total)}–${Math.min(sc.red.total, sc.blue.total)}`;
  }

  showOverlay(
    root,
    h(
      'div',
      { class: 'card results' },
      h('h2', null, title),
      personalBest ? h('p', { class: 'pb' }, '★ New personal best!') : null,
      h(
        'table',
        { class: 'breakdown' },
        h('thead', null, h('tr', null, h('th', null, ''), ...cols.map((c) => h('th', { class: `num ${c}` }, skills ? 'Points' : c.toUpperCase())))),
        h(
          'tbody',
          null,
          ...goalRows,
          goalRows.length === 0 ? h('tr', null, h('td', { class: 'muted', colSpan: cols.length + 1 }, 'No pieces scored')) : null,
          row('Midfield', (x) => x.midfieldPoints, (x) => plural(x.parked, 'robot')),
          skills ? null : row('Autonomous bonus', (x) => x.autonBonus),
        ),
        h('tfoot', null, h('tr', null, h('td', null, 'Total'), ...cols.map((c) => cell(sc[c].total, c)))),
      ),
      !skills && s.autonViolation[me] ? h('p', { class: 'muted' }, 'Your robot crossed the autonomous line, so the auton bonus went to the other alliance.') : null,
      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'primary', onclick: a.again }, 'Run it back (Enter)'),
        h('button', { class: 'ghost', onclick: a.menu }, 'Main menu (Esc)'),
      ),
    ),
  );
}
