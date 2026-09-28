import type { GameDefinition, ModeDef, ScoreResult } from '../engine/types';
import type { Phase } from '../shared/matchTimer';
import type { HalfColor } from '../shared/types';
import { KeyHint, TweenNumber, type KeyHintProps } from './components';
import { phaseTag } from './chrome';
import { Icon } from './icons';
import type { HeldPiece, RobotChip } from './runner';

/** In-match HUD pieces. Small, quiet, tabular; the field is the hero. */

const HALF_NAME: Record<HalfColor, string> = { red: 'red', blue: 'blue', yellow: 'yellow' };

export const pieceLabel = (p: HeldPiece): string =>
  p.kind === 'pin' ? `Pin, ${HALF_NAME[p.top]} over ${HALF_NAME[p.bottom]}` : `Cup, ${p.clearUp ? 'clear half up' : 'clear half down'}`;

/** A Pin (two colored halves, top to bottom) or a Cup (clear and solid halves). Yellow halves carry a dot pattern. */
export function PieceIcon({ piece, size = 'var(--icon-md)' }: { piece: HeldPiece; size?: string }) {
  const label = pieceLabel(piece);
  if (piece.kind === 'pin')
    return (
      <svg viewBox="0 0 12 24" width={`calc(${size} / 2)`} height={size} role="img" aria-label={label} className="zd-piece">
        <title>{label}</title>
        <rect x="1" y="1" width="10" height="11" rx="2" className={`zd-half is-${piece.top}`} />
        <rect x="1" y="12" width="10" height="11" rx="2" className={`zd-half is-${piece.bottom}`} />
        {piece.top === 'yellow' && <circle cx="6" cy="6.5" r="1.3" className="zd-half-dot" />}
        {piece.bottom === 'yellow' && <circle cx="6" cy="17.5" r="1.3" className="zd-half-dot" />}
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={label} className="zd-piece">
      <title>{label}</title>
      <path d="M4 3.5h16L18.5 12h-13z" className={piece.clearUp ? 'zd-cup-clear' : 'zd-cup-solid'} />
      <path d="M5.5 12h13L17 20.5H7z" className={piece.clearUp ? 'zd-cup-solid' : 'zd-cup-clear'} />
    </svg>
  );
}

export function ScoreBar({ red, blue, clock, phase, endgame, solo, onClick }: { red: number; blue: number; clock: string; phase: Phase; endgame: boolean; solo: boolean; onClick: () => void }) {
  return (
    <div className={`zd-scorebar${endgame ? ' is-endgame' : ''}`} role="group" aria-label="Score">
      <div className="zd-score is-red" aria-label={`${solo ? 'Score' : 'Red'} ${red}`}>
        <span className="zd-score-name">{solo ? 'Score' : 'Red'}</span>
        <span className="zd-score-num zd-num">
          <TweenNumber value={red} durationToken="--dur-base" />
        </span>
      </div>
      <button type="button" className="zd-clock" onClick={onClick} aria-label={`${phaseTag(phase, endgame)} ${clock}. Show score breakdown`}>
        <span className="zd-clock-phase">{phaseTag(phase, endgame)}</span>
        <span className="zd-clock-time zd-num">{clock}</span>
      </button>
      {!solo && (
        <div className="zd-score is-blue" aria-label={`Blue ${blue}`}>
          <span className="zd-score-num zd-num">
            <TweenNumber value={blue} durationToken="--dur-base" />
          </span>
          <span className="zd-score-name">Blue</span>
        </div>
      )}
    </div>
  );
}

export function TeamChips({ robots, side }: { robots: RobotChip[]; side: 'red' | 'blue' }) {
  const list = robots.filter((r) => r.alliance === side);
  if (!list.length) return null;
  return (
    <div className={`zd-chips is-${side}`}>
      {list.map((r, i) => (
        <div key={i} className={`zd-teamchip is-${side}${r.role === 'You' ? ' is-you' : ''}`}>
          <span className="zd-teamchip-stripe" aria-hidden="true" />
          <span className="zd-teamchip-text">
            <span className="zd-teamchip-name zd-ellipsis">{r.name}</span>
            <span className="zd-teamchip-role">{r.role}</span>
          </span>
          <span className="zd-teamchip-held" aria-label={r.held.length ? r.held.map(pieceLabel).join(', ') : 'Holding nothing'}>
            {r.held.map((p, k) => (
              <PieceIcon key={k} piece={p} size="var(--icon-sm)" />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RobotStatePanel({ lift, held, air, holding }: { lift: number; held: HeldPiece[]; air: number | null; holding: string }) {
  return (
    <div className="zd-robotstate" aria-label={`Lift ${Math.round(lift * 100)} percent. ${holding}`}>
      <div className="zd-lift" aria-hidden="true">
        <span className="zd-lift-fill" style={{ transform: `scaleY(${Math.max(0.02, lift)})` }} />
      </div>
      <div className="zd-robotstate-text">
        <span className="zd-label">Lift</span>
        <span className="zd-num zd-robotstate-val">{Math.round(lift * 100)}%</span>
      </div>
      <div className="zd-robotstate-held">
        {held.length ? held.map((p, k) => <PieceIcon key={k} piece={p} />) : <span className="zd-robotstate-empty">Empty</span>}
      </div>
      {air !== null && (
        <div className="zd-robotstate-text">
          <span className="zd-label">Air</span>
          <span className="zd-num zd-robotstate-val">{air}</span>
        </div>
      )}
    </div>
  );
}

export function CameraChip({ name, hint, onClick }: { name: string; hint: KeyHintProps; onClick: () => void }) {
  return (
    <button type="button" className="zd-camchip" onClick={onClick} aria-label={`Camera: ${name}. Cycle camera`}>
      <Icon name="camera" size="var(--icon-sm)" />
      <span>{name}</span>
      <KeyHint {...hint} />
    </button>
  );
}

export function Breakdown({ lines, solo }: { lines: ScoreResult['lines']; solo: boolean }) {
  return (
    <div className="zd-breakdown" role="region" aria-label="Score breakdown">
      <table>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" className="is-red">
              {solo ? 'Points' : 'Red'}
            </th>
            {!solo && (
              <th scope="col" className="is-blue">
                Blue
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <th scope="row">{l.label}</th>
              <td className="zd-num">{l.red}</td>
              {!solo && <td className="zd-num">{l.blue}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 2D view: goal and loader labels drawn over the top-down field like a technical diagram. */
export function FieldLabels({ game, project }: { game: GameDefinition; project: (x: number, y: number) => { x: number; y: number } | null }) {
  const items = [
    ...game.field.goals.map((g) => ({ id: g.id, x: g.x, y: g.y, text: g.kind === 'center' ? 'Center Goal' : g.owner ? `${g.owner === 'red' ? 'Red' : 'Blue'} Goal` : 'Goal' })),
    ...game.field.loaders.map((l) => ({ id: l.id, x: l.x, y: l.y, text: 'Loader' })),
  ];
  return (
    <div className="zd-fieldlabels" aria-hidden="true">
      {items.map((it) => {
        const p = project(it.x, it.y);
        if (!p) return null;
        return (
          <span key={it.id} className="zd-fieldlabel" style={{ left: p.x, top: p.y }}>
            {it.text}
          </span>
        );
      })}
    </div>
  );
}

export function modeDuration(m: ModeDef): string {
  if (m.timing.untimed) return 'Untimed';
  const s = m.timing.autonSec + m.timing.driverSec;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
