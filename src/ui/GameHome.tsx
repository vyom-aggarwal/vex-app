import { Suspense, lazy, useEffect, useState } from 'react';
import { checkLegality } from '../engine/legality';
import type { GameDefinition, ModeDef } from '../engine/types';
import type { Replay } from '../shared/replay';
import type { BotLevel, BotStyle, GameId, ModeId, RobotSpec } from '../shared/types';
import { Footer, GameSwitcher, Wordmark } from './chrome';
import { Builder } from './Builder';
import { useGame } from './host';
import { lineup } from './lineup';
import { Records } from './Records';
import { listRobots, loadThumbs, selectRobot, selectedRobot } from './robots';
import { SettingsPanel } from './SettingsPanel';
import type { Settings } from './settings';
import { presetsFor } from '../games/presets';

const GameView = lazy(() => import('./GameView'));
const ReplayViewer = lazy(() => import('./ReplayViewer'));

type Tab = 'play' | 'configure' | 'records';
const TABS: { id: Tab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'configure', label: 'Configure' },
  { id: 'records', label: 'Records' },
];

export interface Props {
  game: GameId;
  settings: Settings;
  setSettings: (s: Settings) => void;
}

export function GameHome({ game, settings, setSettings }: Props) {
  const def = useGame(game);
  const [tab, setTab] = useState<Tab>(() => (['play', 'configure', 'records'].includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'play'));
  const [launch, setLaunch] = useState<{ mode: ModeId; seed: number } | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [robot, setRobot] = useState<RobotSpec>(() => selectedRobot(game));

  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}#${tab}`);
  }, [tab]);

  if (!def) return <div className="loading">Loading…</div>;

  if (launch) {
    const mode = def.modes.find((m) => m.id === launch.mode)!;
    return (
      <Suspense fallback={<div className="loading">Loading field…</div>}>
        <GameView
          key={launch.seed}
          game={def}
          mode={mode}
          entries={lineup(def, mode, robot, settings)}
          settings={settings}
          seed={launch.seed}
          onExit={() => setLaunch(null)}
          onRestart={() => setLaunch({ mode: launch.mode, seed: Date.now() & 0x7fffffff })}
          onWatch={(r) => {
            setLaunch(null);
            setReplay(r);
          }}
        />
      </Suspense>
    );
  }
  if (replay) {
    return (
      <Suspense fallback={<div className="loading">Loading replay…</div>}>
        <ReplayViewer game={def} replay={replay} settings={settings} onExit={() => setReplay(null)} />
      </Suspense>
    );
  }

  return (
    <div className="game-home">
      <header className="top">
        <Wordmark small />
        <GameSwitcher current={game} />
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {tab === 'play' && (
          <Play
            def={def}
            robot={robot}
            setRobot={(r) => {
              setRobot(r);
              selectRobot(game, r.id);
            }}
            settings={settings}
            setSettings={setSettings}
            onLaunch={(mode) => setLaunch({ mode, seed: Date.now() & 0x7fffffff })}
          />
        )}
        {tab === 'configure' && <Configure def={def} settings={settings} setSettings={setSettings} onSelect={setRobot} selected={robot} />}
        {tab === 'records' && <Records game={def} onWatch={setReplay} />}
      </main>
      <Footer />
    </div>
  );
}

function Configure({ def, settings, setSettings, onSelect, selected }: { def: GameDefinition; settings: Settings; setSettings: (s: Settings) => void; onSelect: (r: RobotSpec) => void; selected: RobotSpec }) {
  const [sub, setSub] = useState<'robot' | 'settings'>('robot');
  return (
    <div className="configure">
      <div className="subtabs">
        <button className={sub === 'robot' ? 'active' : ''} onClick={() => setSub('robot')}>
          Robot builder
        </button>
        <button className={sub === 'settings' ? 'active' : ''} onClick={() => setSub('settings')}>
          Settings &amp; controls
        </button>
      </div>
      {sub === 'robot' ? (
        <Builder
          def={def}
          quality={settings.quality}
          selected={selected}
          onSelect={(r) => {
            onSelect(r);
            selectRobot(def.id, r.id);
          }}
        />
      ) : (
        <SettingsPanel settings={settings} setSettings={setSettings} />
      )}
    </div>
  );
}

const STYLES: { id: BotStyle; label: string }[] = [
  { id: 'scorer', label: 'Scorer' },
  { id: 'controller', label: 'Toggle / Roller controller' },
  { id: 'defender', label: 'Defender' },
  { id: 'mixed', label: 'Mixed' },
];
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

function Play({
  def,
  robot,
  setRobot,
  settings,
  setSettings,
  onLaunch,
}: {
  def: GameDefinition;
  robot: RobotSpec;
  setRobot: (r: RobotSpec) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  onLaunch: (m: ModeId) => void;
}) {
  const saved = listRobots(def.id);
  const presets = presetsFor(def.id);
  const thumbs = loadThumbs(def.id);
  const legal = checkLegality(robot, def.builder, def.possession);
  const hasBots = def.modes.some((m) => !m.solo);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const disabled = (m: ModeDef) => m.id !== 'free' && !legal.ok;
  return (
    <div className="play">
      <section className="modes">
        <h2>Modes</h2>
        <div className="mode-grid">
          {def.modes.map((m) => (
            <button key={m.id} className="mode-card" disabled={disabled(m)} onClick={() => onLaunch(m.id)}>
              <span className="mode-name">{m.label}</span>
              <span className="mode-blurb">{m.blurb}</span>
              <span className="mode-time">{m.timing.untimed ? 'Untimed' : `${Math.floor((m.timing.autonSec + m.timing.driverSec) / 60)}:${String((m.timing.autonSec + m.timing.driverSec) % 60).padStart(2, '0')}`}</span>
            </button>
          ))}
        </div>
        {!legal.ok && <p className="warn">This robot isn't legal for {def.name} ({legal.errors[0]}). Only Free Drive is available; fix it in Configure.</p>}
      </section>
      <aside className="play-side">
        <h2>Your robot</h2>
        <div className="robot-pick">
          {thumbs[robot.id] ? <img src={thumbs[robot.id]} alt="" /> : <div className="thumb-empty">No preview</div>}
          <select value={robot.id} onChange={(e) => setRobot([...saved, ...presets].find((r) => r.id === e.target.value)!)}>
            {saved.length > 0 && (
              <optgroup label="Saved">
                {saved.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Presets">
              {presets.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        {hasBots && (
          <>
            <h2>Match options</h2>
            <label>
              Alliance
              <select value={settings.alliance} onChange={(e) => set('alliance', e.target.value as Settings['alliance'])}>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
              </select>
            </label>
            <label>
              Bot difficulty
              <select value={settings.botLevel} onChange={(e) => set('botLevel', e.target.value as BotLevel)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Partner style
              <select value={settings.partnerStyle} onChange={(e) => set('partnerStyle', e.target.value as BotStyle)}>
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Opponent style
              <select value={settings.opponentStyle} onChange={(e) => set('opponentStyle', e.target.value as BotStyle)}>
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.botsUseMyRobot} onChange={(e) => set('botsUseMyRobot', e.target.checked)} />
              Bots drive a copy of my robot
            </label>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={settings.autoRef} onChange={(e) => set('autoRef', e.target.checked)} />
          Automatic referee
        </label>
        {def.id === 'override' && (
          <label className="check">
            <input type="checkbox" checked={settings.worlds} onChange={(e) => set('worlds', e.target.checked)} />
            Worlds-qualifying AWP thresholds
          </label>
        )}
        <p className="hint">Enter / Start begins a match. C cycles cameras, M toggles the 2D view, Esc pauses.</p>
      </aside>
    </div>
  );
}
