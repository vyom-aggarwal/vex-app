import { useEffect, useRef, useState } from 'react';
import { makeBot } from '../bots';
import { checkLegality } from '../engine/legality';
import type { GameDefinition, ModeDef } from '../engine/types';
import { rankingPoints } from '../games/pinnacle/scoring';
import { commitRun, saveReplay } from '../shared/records';
import { replayFileName, type Replay } from '../shared/replay';
import type { RobotEntry } from '../shared/types';
import { Wordmark, phaseLabel } from './chrome';
import { downloadJson } from './download';
import { attachCanvas, getRenderer } from './host';
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

  useEffect(() => {
    let live = true;
    let detach = () => {};
    let runner: GameRunner | null = null;
    (async () => {
      try {
        const r = await getRenderer(settings.quality);
        r.setQuality(settings.quality);
        if (!live || !host.current) return;
        detach = attachCanvas(r, host.current);
        const controllers = entries.map((e) => (e.driver === 'player' ? null : makeBot(e.driver.style, e.driver.level)));
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
        setError((e as Error).message);
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

  return (
    <div className="game-view">
      <div className="canvas-host" ref={host} />
      <div className="hud-top">
        <Wordmark small />
        {hud && (
          <div className={`scoreboard${hud.endgame ? ' endgame' : ''}`}>
            {!mode.solo && <span className="s red">{hud.red}</span>}
            <span className="clock">
              <b>{hud.clock}</b>
              <small>{phaseLabel(hud.phase)}</small>
            </span>
            {!mode.solo ? <span className="s blue">{hud.blue}</span> : <span className="s red">{hud.red}</span>}
          </div>
        )}
        <div className="hud-mode">
          {game.name} · {mode.label}
          {!checkLegality(entries[0].spec, game.builder, game.possession).ok && <span className="warn"> · illegal build (Free Drive only)</span>}
        </div>
      </div>
      {hud && (
        <>
          <div className="hud-left">
            <div>
              <small>Camera</small> {hud.camera}
            </div>
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
            <ul className="breakdown">
              {hud.lines.map((l) => (
                <li key={l.label}>
                  <span>{l.label}</span>
                  <b className="red">{l.red}</b>
                  {!mode.solo && <b className="blue">{l.blue}</b>}
                </li>
              ))}
            </ul>
          </div>
          <div className="hud-right">
            <div className="hp-title">Human player {hud.canLoad ? '' : '(not now)'}</div>
            <div className="hp-row">
              {game.field.loaders.map((l, i) =>
                mode.loaderAccess[entries[0].alliance].includes(l.alliance) ? (
                  <button key={l.id} className={`loader-btn ${l.alliance}${hud.loaderIndex === i ? ' active' : ''}`} onClick={act((r) => r.setLoader(i))}>
                    {l.x > 0 ? 'R' : 'L'}
                  </button>
                ) : null,
              )}
            </div>
            <div className="hp-row kinds">
              {(Object.keys(LOAD_LABELS) as LoadKind[]).map((k) => (
                <button
                  key={k}
                  className={hud.loadKind === k ? 'active' : ''}
                  onClick={act((r) => {
                    r.loadKind = k;
                  })}
                >
                  {LOAD_LABELS[k]}
                </button>
              ))}
            </div>
            <button className="primary" disabled={!hud.canLoad} onClick={act((r) => r.queueLoad())}>
              Load (G)
            </button>
            <div className="hp-supply">
              Supply: {hud.supply.pins} Pins · {hud.supply.cups} Cups
            </div>
          </div>
          <div className="toasts">
            {hud.toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind} ${t.alliance ?? ''}`}>
                {t.text}
              </div>
            ))}
          </div>
          {hud.phase === 'pre' && !done && (
            <div className="overlay center">
              <h2>{mode.label}</h2>
              <p>{mode.blurb}</p>
              <button className="primary big" onClick={act((r) => r.go())}>
                Start (Enter)
              </button>
              <p className="hint">W A S D / sticks to drive · R F lift · J K grip · Space intake · C camera</p>
            </div>
          )}
          {hud.paused && !done && (
            <div className="overlay center">
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
              <button onClick={onExit}>Quit to menu</button>
            </div>
          )}
        </>
      )}
      {!hud && !error && <div className="overlay center">Loading physics…</div>}
      {error && (
        <div className="overlay center">
          <h2>Couldn't start</h2>
          <p>{error}</p>
          <button onClick={onExit}>Back</button>
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
              <b>{c.rule}</b> {c.text} <small>({c.level}{c.auton ? ', Autonomous' : ''}, robot {c.robot + 1}, {(c.tick / 120).toFixed(1)} s)</small>
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
  );
}
