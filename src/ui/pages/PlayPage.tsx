import { derivedStats } from '../../engine/drivetrain';
import { checkLegality } from '../../engine/legality';
import type { GameDefinition, ModeDef } from '../../engine/types';
import type { ModeId } from '../../shared/types';
import { Link } from '../chrome';
import { describeSlot } from '../lineup';
import { loadDraft, loadThumbs } from '../robots';
import type { Settings } from '../settings';

const PRACTICE: ModeId[] = ['free', 'skills', 'solo', 'solocode'];

function duration(m: ModeDef): string {
  if (m.timing.untimed) return 'Untimed';
  const s = m.timing.autonSec + m.timing.driverSec;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function PlayPage({ def, settings, onLaunch }: { def: GameDefinition; settings: Settings; onLaunch: (m: ModeId) => void }) {
  const robot = loadDraft(def.id);
  const thumb = loadThumbs(def.id)[robot.id];
  const legal = checkLegality(robot, def.builder, def.possession);
  const stats = derivedStats(robot);
  const groups: { title: string; modes: ModeDef[] }[] = [
    { title: 'Practice', modes: def.modes.filter((m) => PRACTICE.includes(m.id)) },
    { title: 'Match', modes: def.modes.filter((m) => !PRACTICE.includes(m.id)) },
  ];
  const locked = (m: ModeDef) => m.id !== 'free' && !legal.ok;

  return (
    <div className="play-page">
      <div className="play-modes">
        <h1>Pick a mode</h1>
        {groups.map((g) => (
          <section key={g.title} className="mode-group">
            <h2 className="eyebrow">{g.title}</h2>
            <div className="mode-grid">
              {g.modes.map((m) => (
                <button key={m.id} className="mode-card" disabled={locked(m)} onClick={() => onLaunch(m.id)}>
                  <span className="mode-top">
                    <span className="mode-name">{m.label}</span>
                    <span className="mode-time">{duration(m)}</span>
                  </span>
                  <span className="mode-blurb">{m.blurb}</span>
                  {!m.solo && (
                    <span className="mode-lineup">
                      {m.robots[settings.alliance] > 1 && <span>Partner: {describeSlot(settings.partner)}</span>}
                      <span>Opponents: {describeSlot(settings.opponent1)}{m.robots[settings.alliance === 'red' ? 'blue' : 'red'] > 1 ? `, ${describeSlot(settings.opponent2)}` : ''}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!legal.ok && (
          <p className="warn">
            My Robot isn't legal for {def.name}: {legal.errors[0]} Only Free Drive is available until you <Link to={`/${def.id}/configure/robot`}>fix it</Link>.
          </p>
        )}
      </div>
      <aside className="play-side card">
        <div className="robot-summary">
          {thumb ? <img src={thumb} alt="" /> : <div className="thumb-empty">No preview yet</div>}
          <div>
            <b>{robot.name}</b>
            <small>
              {robot.team?.number ? `#${robot.team.number} · ` : ''}
              {robot.drive.type === 'tank' ? `Tank ${robot.drive.wheelsPerSide * 2}-wheel` : robot.drive.type === 'xdrive' ? 'X-drive' : robot.drive.type === 'mecanum' ? 'Mecanum' : 'H-drive'}
            </small>
            <small>
              {stats.topSpeedFps.toFixed(1)} ft/s · {Math.round(stats.turnDps)}°/s
            </small>
          </div>
        </div>
        <Link to={`/${def.id}/configure/robot`} className="btn">
          Edit robot
        </Link>
        <div className="kv">
          <span>Alliance</span>
          <b className={settings.alliance}>{settings.alliance === 'red' ? 'Red' : 'Blue'}</b>
          <span>Referee</span>
          <b>{settings.autoRef ? 'Automatic' : 'Off'}</b>
          <span>Camera</span>
          <b>{settings.view === '2d' ? 'Overhead 2D' : { driver: 'Driver Station', driverTrack: 'Driver (tracking)', chase: 'Chase', orbit: 'Orbit', overhead: 'Overhead 2D', audience: 'Audience' }[settings.camera]}</b>
        </div>
        <Link to={`/${def.id}/configure/match`} className="btn">
          Match setup
        </Link>
        <p className="hint">Enter or Start begins a match. Esc opens the menu. C cycles cameras.</p>
      </aside>
    </div>
  );
}
