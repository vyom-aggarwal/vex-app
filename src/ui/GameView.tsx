import { useEffect, useRef, useState } from 'react';
import { makeBot } from '../bots';
import { checkLegality } from '../engine/legality';
import type { GameDefinition, ModeDef } from '../engine/types';
import { rankingPoints } from '../games/pinnacle/scoring';
import { CAMERA_LABELS, CAMERA_MODES } from '../render/renderer';
import { keyLabel } from '../shared/input/bindings';
import { commitRun, saveReplay } from '../shared/records';
import { replayFileName, type Replay } from '../shared/replay';
import type { RobotEntry } from '../shared/types';
import { phaseLabel } from './chrome';
import { downloadJson } from './download';
import { attachCanvas, getRenderer } from './host';
import { resolveQuality } from './quality';
import { GameRunner, LOAD_LABELS, type FinishInfo, type HudState, type LoadKind } from './runner';
import type { Settings } from './settings';

export interface GameViewProps {
  game: GameDefinition;
  mode: ModeDef;
  entries: RobotEntry[];
  settings: Settings;
  seed: number;
  onExit: () => void;
  onRestart: () => void;
  onWatch: (r: Replay) => void;
}

export default function GameView({ game, mode, entries, settings, seed, onExit, onRestart, onWatch }: GameViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<GameRunner | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [done, setDone] = useState<(FinishInfo & { best: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = entries[0];
  /** Primary key for an action, for on-screen hints. */
  const k = (a: keyof Settings['bindings']['keys']) => (settings.bindings.keys[a][0] ? keyLabel(settings.bindings.keys[a][0]) : '—');

  useEffect(() => {
    let live = true;
    let detach = () => {};
    let runner: GameRunner | null = null;
    (async () => {
      try {
        const q = resolveQuality(settings.quality);
        const r = await getRenderer(q);
        r.setQuality(q);
        if (!live || !host.current) return;
        detach = attachCanvas(r, host.current);
        const controllers = entries.map((e) => (typeof e.driver === 'string' ? null : makeBot(e.driver.style, e.driver.level)));
        runner = await GameRunner.create(r, game, mode.id, entries, settings, controllers, seed);
        if (!live) {
          runner.dispose();
          return;
        }
        runnerRef.current = runner;
        runner.onHud = setHud;
        runner.onReset = onRestart;
        runner.onFinish = (f) => {
          const player = f.redCards.includes(0) ? 0 : f.result[f.playerAlliance];
          const opp = f.result[f.playerAlliance === 'red' ? 'blue' : 'red'];
          const best = commitRun({
            game: game.id,
            mode: mode.id,
            score: player,
            outcome: mode.solo ? null : player > opp ? 'win' : player < opp ? 'loss' : 'tie',
            seconds: f.stats.seconds,
            placed: f.stats.placed,
            loads: f.stats.loads,
            calls: f.calls.filter((c) => c.robot === 0).length,
          });
          saveReplay(f.replay);
          setDone({ ...f, best });
        };
        runner.start();
      } catch (e) {
        setError((e as Error).message || String(e));
      }
    })();
    return () => {
      live = false;
      runner?.dispose();
      runnerRef.current = null;
      detach();
    };
    // The runner lives for the lifetime of this view; restarts remount it with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = (fn: (r: GameRunner) => void) => () => {
    if (runnerRef.current) fn(runnerRef.current);
  };
  const illegal = !checkLegality(me.spec, game.builder, game.possession).ok;
  const solo = mode.solo;

  return (
    <div className="game-view">
      <div className="canvas-host" ref={host} />

      <div className="hud-tl">
        <button onClick={act((r) => (r.paused = true))} title="Menu (Esc)">
          ☰ Menu
        </button>
        <button onClick={onRestart} title={`Restart (${k('reset')})`}>
          ↺ Reset
        </button>
        {hud && (
          <button onClick={act((r) => r.cycleCamera())} title={`Cycle camera (${k('camera')})`}>
            ◉ {hud.camera}
          </button>
        )}
      </div>

      <div className="hud-tr">
        <span className="hud-mode">
          {game.name} · {mode.label}
          {illegal && <em> · illegal build (Free Drive only)</em>}
        </span>
        {hud?.perf && (
          <span className="perf">
            {Math.round(hud.perf.fps)} fps
            {settings.perf === 'detailed' && (
              <>
                {' '}
                · sim {hud.perf.simMs.toFixed(1)} ms · draw {hud.perf.drawMs.toFixed(1)} ms · {hud.perf.calls} calls · {(hud.perf.triangles / 1000).toFixed(0)}k tris · {hud.perf.quality}
              </>
            )}
          </span>
        )}
      </div>

      {hud && (
        <>
          <div className="toasts">
            {hud.toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind} ${t.alliance ?? ''}`}>
                {t.text}
              </div>
            ))}
          </div>

          {hud.anyLoading && (
            <div className="hp-panel">
              <div className="hp-title">
                Human player <small>{hud.canLoad ? `Supply ${hud.supply.pins} Pins · ${hud.supply.cups} Cups` : 'Loading not allowed right now'}</small>
              </div>
              <div className="hp-row">
                {game.field.loaders.map((l, i) =>
                  mode.loaderAccess[me.alliance].includes(l.alliance) ? (
                    <button key={l.id} className={`loader-btn ${l.alliance}${hud.loaderIndex === i ? ' on' : ''}`} onClick={act((r) => r.setLoader(i))} title="Choose Loader ([ / ])">
                      {l.alliance === 'red' ? 'Red' : 'Blue'} {(me.alliance === 'red' ? -l.x : l.x) > 0 ? 'right' : 'left'}
                    </button>
                  ) : null,
                )}
              </div>
              <div className="hp-row">
                {(Object.keys(LOAD_LABELS) as LoadKind[]).map((kind) => (
                  <button
                    key={kind}
                    className={hud.loadKind === kind ? 'on' : ''}
                    onClick={act((r) => {
                      r.loadKind = kind;
                    })}
                  >
                    {LOAD_LABELS[kind]}
                  </button>
                ))}
              </div>
              <button className="primary" disabled={!hud.canLoad} onClick={act((r) => r.queueLoad())}>
                Load ({k('load')})
              </button>
            </div>
          )}

          <div className="hud-bl">
            <div>
              <small>Holding</small> {hud.holding}
            </div>
            {hud.air !== null && (
              <div>
                <small>Air</small> {hud.air} actuations
              </div>
            )}
            <div>
              <small>Input</small> {hud.pad ? 'Gamepad' : 'Keyboard'}
            </div>
          </div>

          {hud.breakdown && (
            <div className="breakdown card">
              <h3>Score breakdown</h3>
              <table>
                <tbody>
                  {hud.lines.map((l) => (
                    <tr key={l.label}>
                      <td>{l.label}</td>
                      <td className="red">{l.red}</td>
                      {!solo && <td className="blue">{l.blue}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <small className="dim">{k('breakdown')} hides this</small>
            </div>
          )}

          <div className={`scorebar${hud.endgame ? ' endgame' : ''}`}>
            {solo ? (
              <div className="sb red">
                <b>{hud.red}</b>
                <small>Score</small>
              </div>
            ) : (
              <div className="sb red">
                <b>{hud.red}</b>
                <small>Red</small>
              </div>
            )}
            <button className="sb clock" onClick={act((r) => (r.breakdown = !r.breakdown))} title="Score breakdown">
              <small>{phaseLabel(hud.phase)}</small>
              <b>{hud.clock}</b>
            </button>
            {!solo && (
              <div className="sb blue">
                <b>{hud.blue}</b>
                <small>Blue</small>
              </div>
            )}
          </div>

          {hud.phase === 'pre' && !done && (
            <div className="overlay center soft">
              <div className="prestart card">
                <span className={`pill ${me.alliance}`}>{me.alliance === 'red' ? 'Red' : 'Blue'} alliance</span>
                <h2>{mode.label}</h2>
                <p>{mode.blurb}</p>
                <button className="primary big" onClick={act((r) => r.go())}>
                  Start ({k('start')})
                </button>
                <p className="hint">
                  Drive {k('forward')} {k('back')} {k('strafeLeft')} {k('strafeRight')} · turn {k('turnLeft')} {k('turnRight')} · lift {k('liftUp')} / {k('liftDown')} · grip {k('gripPin')} / {k('gripCup')} ·
                  intake {k('intakeIn')} · camera {k('camera')} · menu {k('menu')}
                </p>
              </div>
            </div>
          )}

          {hud.paused && !done && (
            <div className="overlay center">
              <div className="menu-card card">
                <h2>Paused</h2>
                <button
                  className="primary"
                  onClick={act((r) => {
                    r.paused = false;
                  })}
                >
                  Resume
                </button>
                <button onClick={onRestart}>Restart</button>
                <div className="cam-grid">
                  {CAMERA_MODES.map((c) => (
                    <button key={c} className={hud.camera === CAMERA_LABELS[c] ? 'on' : ''} onClick={act((r) => r.setCamera(c))}>
                      {CAMERA_LABELS[c]}
                    </button>
                  ))}
                </div>
                <button onClick={onExit}>Quit to menu</button>
              </div>
            </div>
          )}
        </>
      )}
      {!hud && !error && <div className="overlay center">Loading physics…</div>}
      {error && (
        <div className="overlay center">
          <div className="menu-card card">
            <h2>Couldn't start the field</h2>
            <p>{error}</p>
            <p className="hint">If this keeps happening, try Graphics → Low or another browser with WebGL enabled.</p>
            <button onClick={onExit}>Back</button>
          </div>
        </div>
      )}
      {done && <Results info={done} game={game} mode={mode} onAgain={onRestart} onExit={onExit} onWatch={() => onWatch(done.replay)} />}
    </div>
  );
}

function Results({ info, game, mode, onAgain, onExit, onWatch }: { info: FinishInfo & { best: boolean }; game: GameDefinition; mode: ModeDef; onAgain: () => void; onExit: () => void; onWatch: () => void }) {
  const r = info.result;
  const me = info.playerAlliance;
  const carded = info.redCards.includes(0);
  const player = carded ? 0 : r[me];
  const opp = r[me === 'red' ? 'blue' : 'red'];
  const verdict = mode.solo ? 'Final score' : player > opp ? 'Win' : player < opp ? 'Loss' : 'Tie';
  return (
    <div className="overlay results">
      <div className="results-card card">
        <h2>
          {verdict}
          {info.best && <span className="badge">New best</span>}
        </h2>
        <div className="final">
          {mode.solo ? (
            <span className="s red">{player}</span>
          ) : (
            <>
              <span className="s red">{r.red}</span>
              <span className="dash">–</span>
              <span className="s blue">{r.blue}</span>
            </>
          )}
        </div>
        {carded && <p className="warn">Red card: your team's score is 0.</p>}
        <table className="lines">
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td className="red">{l.red}</td>
                {!mode.solo && <td className="blue">{l.blue}</td>}
              </tr>
            ))}
            {r.flags.map((f) => (
              <tr key={f.label}>
                <td>{f.label}</td>
                <td className="red">{f.red ? '✓' : '—'}</td>
                {!mode.solo && <td className="blue">{f.blue ? '✓' : '—'}</td>}
              </tr>
            ))}
            {game.id === 'pinnacle' && !mode.solo && (
              <tr>
                <td>Ranking points</td>
                <td className="red">{rankingPoints(r, 'red')}</td>
                <td className="blue">{rankingPoints(r, 'blue')}</td>
              </tr>
            )}
          </tbody>
        </table>
        <h3>Rule calls</h3>
        {info.calls.length === 0 ? (
          <p className="hint">No violations called.</p>
        ) : (
          <ul className="calls">
            {info.calls.map((c, i) => (
              <li key={i} className={c.alliance}>
                <b>{c.rule}</b> {c.text}{' '}
                <small>
                  ({c.level}
                  {c.auton ? ', Autonomous' : ''}, robot {c.robot + 1}, {(c.tick / 120).toFixed(1)} s)
                </small>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="primary" onClick={onAgain}>
            Play again
          </button>
          <button onClick={onWatch}>Watch replay</button>
          <button onClick={() => downloadJson(replayFileName(info.replay), info.replay)}>Export replay</button>
          <button onClick={onExit}>Back to menu</button>
        </div>
      </div>
    </div>
  );
}
