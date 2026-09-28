import { useEffect, useRef, useState } from 'react';
import { makeBot } from '../bots';
import { checkLegality } from '../engine/legality';
import type { GameDefinition, ModeDef } from '../engine/types';
import { rankingPoints } from '../games/pinnacle/scoring';
import { CAMERA_LABELS, CAMERA_MODES, type CameraMode, type ZRenderer } from '../render/renderer';
import { ACTIONS, type Action, type ActionGroup } from '../shared/input/bindings';
import { commitRun, saveReplay } from '../shared/records';
import { replayFileName, type Replay } from '../shared/replay';
import { TICK_HZ } from '../shared/timestep';
import type { RobotEntry } from '../shared/types';
import { Badge, Button, Dialog, Field, IconButton, KeyGlyph, KeyHint, PadGlyph, SegmentedControl, Select, Slider, ToastCard, ToastStack, Toggle, type KeyHintProps } from './components';
import { downloadJson } from './download';
import { attachCanvas, getRenderer } from './host';
import { Breakdown, CameraChip, FieldLabels, RobotStatePanel, ScoreBar, TeamChips, modeDuration } from './hud';
import { Icon } from './icons';
import { usePadFamily, useBack } from './nav';
import { resolveQuality } from './quality';
import { GameRunner, LOAD_LABELS, type FinishInfo, type HudState, type LoadKind } from './runner';
import type { Settings } from './settings';

export interface GameViewProps {
  game: GameDefinition;
  mode: ModeDef;
  entries: RobotEntry[];
  settings: Settings;
  setSettings: (s: Settings) => void;
  seed: number;
  /** Leave the match; `to` navigates somewhere else afterwards (Home, the builder). */
  onExit: (to?: string) => void;
  onRestart: () => void;
  /** Watch the replay, optionally starting at a tick. */
  onWatch: (r: Replay, at?: number) => void;
}

type Done = FinishInfo & { best: boolean };

/** Return keyboard focus to the match after a HUD click, so game keys don't re-press the button. */
const blurActive = () => (document.activeElement as HTMLElement | null)?.blur?.();

export default function GameView({ game, mode, entries, settings, setSettings, seed, onExit, onRestart, onWatch }: GameViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<GameRunner | null>(null);
  const rRef = useRef<ZRenderer | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'settings' | 'controls' | null>(null);
  // The human-player panel starts collapsed on narrow screens so it never hides the field.
  const [hpOpen, setHpOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 960);
  const me = entries[0];
  const keyHint = (a: Action): KeyHintProps => ({ code: settings.bindings.keys[a][0], pad: settings.bindings.pad[a][0] });

  useEffect(() => {
    let live = true;
    let release = () => {};
    let runner: GameRunner | null = null;
    (async () => {
      try {
        const q = resolveQuality(settings.quality);
        const r = await getRenderer(q);
        r.setQuality(q);
        if (!live || !host.current) return;
        rRef.current = r;
        release = attachCanvas(r, host.current);
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
            robot: me.spec.name,
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
      release();
    };
    // The runner lives for the lifetime of this view; restarts remount it with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Run something on the runner and refresh the HUD right away. */
  const act = (fn: (r: GameRunner) => void) => () => {
    const r = runnerRef.current;
    if (!r) return;
    fn(r);
    setHud(r.hud());
  };
  const resume = act((r) => {
    r.paused = false;
    setDialog(null);
    blurActive();
  });
  const change = (s: Settings) => {
    setSettings(s);
    if (runnerRef.current) runnerRef.current.settings = s;
  };

  const illegal = !checkLegality(me.spec, game.builder, game.possession).ok;
  const solo = mode.solo;
  const paused = !!hud?.paused && !done;
  const pre = hud?.phase === 'pre' && !done && !paused;
  const clean = settings.cleanHud;

  // Menus own Back (Esc / B): pause resumes, pre-start and results leave.
  useBack(() => (dialog ? setDialog(null) : resume()), paused);
  useBack(() => onExit(), !!pre || !!done || !!error);

  // Keyboard/mouse focus lands on the menu's primary action when a menu opens.
  const overlay = useRef<HTMLDivElement>(null);
  const menuKey = paused ? 'pause' : pre ? 'pre' : done ? 'done' : error ? 'error' : null;
  useEffect(() => {
    if (!menuKey) return;
    requestAnimationFrame(() => overlay.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }, [menuKey]);

  const toasts = (hud?.toasts ?? []).slice(-3).map((t) => {
    const i = t.text.indexOf(': ');
    const call = t.kind === 'call' && i > 0;
    return { id: t.id, spec: { title: call ? t.text.slice(0, i) : undefined, text: call ? t.text.slice(i + 2) : t.text, tone: t.kind === 'call' ? ('danger' as const) : ('warn' as const), alliance: t.alliance } };
  });

  return (
    <div className={`zd-game${clean ? ' is-clean' : ''}`}>
      <div className="zd-game-canvas" ref={host} />

      {hud && !done && (
        <div className="zd-hud">
          {hud.cameraMode === 'overhead' && rRef.current && !clean && <FieldLabels game={game} project={(x, y) => rRef.current!.project(x, y)} />}

          <div className="zd-hud-top">
            <div className="zd-hud-corner is-left">
              <IconButton
                icon="menu"
                label="Pause"
                variant="secondary"
                size="sm"
                className="zd-hud-hide"
                onClick={act((r) => {
                  r.paused = true;
                })}
              />
              {!solo || hud.robots.length > 1 ? <TeamChips robots={hud.robots} side="red" /> : null}
            </div>
            <div className="zd-hud-center">
              <ScoreBar red={hud.red} blue={hud.blue} clock={hud.clock} phase={hud.phase} endgame={hud.endgame} solo={solo} onClick={act((r) => (r.breakdown = !r.breakdown))} />
              {hud.breakdown && <Breakdown lines={hud.lines} solo={solo} />}
            </div>
            <div className="zd-hud-corner is-right">
              {!solo && <TeamChips robots={hud.robots} side="blue" />}
              {hud.perf && (
                <span className="zd-perf zd-num zd-hud-hide">
                  {Math.round(hud.perf.fps)} fps
                  {settings.perf === 'detailed' &&
                    ` · sim ${hud.perf.simMs.toFixed(1)} ms · draw ${hud.perf.drawMs.toFixed(1)} ms · ${hud.perf.calls} calls · ${(hud.perf.triangles / 1000).toFixed(0)}k tris · ${hud.perf.quality}`}
                </span>
              )}
              {illegal && (
                <span className="zd-hud-hide">
                  <Badge tone="danger" icon="danger">
                    Illegal build: Free drive only
                  </Badge>
                </span>
              )}
            </div>
          </div>

          {hud.anyLoading && (
            <section className={`zd-hp zd-hud-hide${hpOpen ? '' : ' is-closed'}`} aria-label="Human player">
              <button type="button" className="zd-hp-head" onClick={() => setHpOpen(!hpOpen)} aria-expanded={hpOpen}>
                <span className="zd-label">Human player</span>
                <span className="zd-hp-sub zd-num">{hud.canLoad ? `${hud.supply.pins} Pins · ${hud.supply.cups} Cups` : 'Loading closed'}</span>
                <Icon name={hpOpen ? 'chevronDown' : 'chevronUp'} size="var(--icon-sm)" />
              </button>
              {hpOpen && (
                <div className="zd-hp-body">
                  <div className="zd-hp-row" role="radiogroup" aria-label="Loader">
                    {game.field.loaders.map((l, i) =>
                      mode.loaderAccess[me.alliance].includes(l.alliance) ? (
                        <button
                          key={l.id}
                          type="button"
                          role="radio"
                          aria-checked={hud.loaderIndex === i}
                          className={`zd-hp-opt is-${l.alliance}`}
                          onClick={() => {
                            act((r) => r.setLoader(i))();
                            blurActive();
                          }}
                        >
                          {l.alliance === 'red' ? 'Red' : 'Blue'} {(me.alliance === 'red' ? -l.x : l.x) > 0 ? 'right' : 'left'}
                        </button>
                      ) : null,
                    )}
                  </div>
                  <div className="zd-hp-row" role="radiogroup" aria-label="Load">
                    {(Object.keys(LOAD_LABELS) as LoadKind[]).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={hud.loadKind === kind}
                        className="zd-hp-opt"
                        onClick={() => {
                          act((r) => {
                            r.loadKind = kind;
                          })();
                          blurActive();
                        }}
                      >
                        {LOAD_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    block
                    disabled={!hud.canLoad}
                    hint={keyHint('load')}
                    onClick={() => {
                      act((r) => r.queueLoad())();
                      blurActive();
                    }}
                  >
                    Load
                  </Button>
                </div>
              )}
            </section>
          )}

          <div className="zd-hud-bottom zd-hud-hide">
            <RobotStatePanel lift={hud.lift} held={hud.held} air={hud.air} holding={hud.holding} />
            <CameraChip
              name={hud.camera}
              hint={keyHint('camera')}
              onClick={() => {
                act((r) => r.cycleCamera())();
                blurActive();
              }}
            />
          </div>

          {!clean && (
            <ToastStack className="zd-hud-toasts">
              {toasts.map((t) => (
                <ToastCard key={t.id} toast={t.spec} />
              ))}
            </ToastStack>
          )}
        </div>
      )}

      {pre && hud && (
        <div className="zd-overlay is-soft" data-nav-scope="overlay" ref={overlay}>
          <div className="zd-menu-card">
            <div className="zd-row">
              {!solo && (
                <Badge tone={me.alliance} icon="flag">
                  {me.alliance === 'red' ? 'Red' : 'Blue'} alliance
                </Badge>
              )}
              <Badge icon="timer">{modeDuration(mode)}</Badge>
              {illegal && (
                <Badge tone="danger" icon="danger">
                  Illegal build
                </Badge>
              )}
            </div>
            <h2>{mode.label}</h2>
            <p className="zd-muted">{mode.blurb}</p>
            <Button variant="primary" size="lg" block icon="play" hint={keyHint('start')} data-autofocus onClick={act((r) => r.go())}>
              Start
            </Button>
            <div className="zd-hints">
              {(
                [
                  ['forward', 'Drive'],
                  ['liftUp', 'Lift'],
                  ['gripPin', 'Grip Pin'],
                  ['gripCup', 'Grip Cup'],
                  ['camera', 'Camera'],
                  ['menu', 'Pause'],
                ] as [Action, string][]
              ).map(([a, label]) => (
                <span key={a} className="zd-keyhint-row">
                  <KeyHint {...keyHint(a === 'menu' ? 'start' : a)} code={settings.bindings.keys[a][0]} />
                  {label}
                </span>
              ))}
            </div>
            <Button variant="ghost" icon="chevronLeft" hint={{ action: 'back' }} onClick={() => onExit()}>
              Back to modes
            </Button>
          </div>
        </div>
      )}

      {paused && (
        <div className="zd-overlay" data-nav-scope="overlay" ref={overlay}>
          <nav className="zd-menu-card zd-pause" aria-label="Paused">
            <span className="zd-label">
              {game.name} · {mode.label}
            </span>
            <h2>Paused</h2>
            <Button variant="primary" size="lg" block icon="play" data-autofocus onClick={resume} hint={{ action: 'back' }}>
              Resume
            </Button>
            <Button size="lg" block icon="restart" onClick={onRestart}>
              Restart
            </Button>
            <Button size="lg" block icon="settings" onClick={() => setDialog('settings')}>
              Settings
            </Button>
            <Button size="lg" block icon="gamepad" onClick={() => setDialog('controls')}>
              Controls
            </Button>
            <Button size="lg" block variant="ghost" icon="home" onClick={() => onExit()}>
              Quit
            </Button>
          </nav>
        </div>
      )}

      <PauseSettings
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        settings={settings}
        onChange={change}
        camera={(hud?.cameraMode ?? 'driver') as CameraMode}
        onCamera={(c) => runnerRef.current?.setCamera(c)}
      />
      <ControlsReference open={dialog === 'controls'} onClose={() => setDialog(null)} settings={settings} />

      {!hud && !error && (
        <div className="zd-overlay is-solid" role="status">
          <div className="zd-loading">
            <span className="zd-muted">Loading physics</span>
            <span className="zd-progress zd-progress--indeterminate">
              <span />
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="zd-overlay is-solid" data-nav-scope="overlay" ref={overlay} role="alert">
          <div className="zd-menu-card">
            <Icon name="danger" size="var(--icon-lg)" className="zd-danger-icon" />
            <h2>The field couldn't start</h2>
            <p className="zd-muted">WebGL may be off or unsupported here. Turn on hardware acceleration, or pick the Low quality preset in Settings, then try again.</p>
            <p className="zd-muted zd-small">{error}</p>
            <Button variant="primary" data-autofocus onClick={() => onExit()}>
              Back to modes
            </Button>
          </div>
        </div>
      )}
      {done && (
        <div ref={overlay} className="zd-overlay is-results" data-nav-scope="overlay">
          <Results
            info={done}
            game={game}
            mode={mode}
            onRestart={onRestart}
            onWatch={(at) => onWatch(done.replay, at)}
            onRobot={() => onExit(`/${game.id}/robot`)}
            onHome={() => onExit(`/${game.id}`)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pause dialogs
// ---------------------------------------------------------------------------------------------

function PauseSettings({
  open,
  onClose,
  settings,
  onChange,
  camera,
  onCamera,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  camera: CameraMode;
  onCamera: (c: CameraMode) => void;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <Dialog open={open} title="Match settings" onClose={onClose} actions={<Button variant="primary" data-autofocus onClick={onClose}>Done</Button>}>
      <div className="zd-dialog-fields">
        <Field label="Camera">
          <Select label="Camera" value={camera} onChange={onCamera} options={CAMERA_MODES.map((c) => ({ value: c, label: CAMERA_LABELS[c] }))} />
        </Field>
        <Field label="Clean HUD" description="Show only the score bar">
          <Toggle label="Clean HUD" checked={settings.cleanHud} onChange={(v) => set('cleanHud', v)} />
        </Field>
        <Field label="Placement guides" description="Goal rim turns green when a release would score">
          <Toggle label="Placement guides" checked={settings.guides} onChange={(v) => set('guides', v)} />
        </Field>
        <Field label="In-match messages" description="Rule calls and Loader messages">
          <Toggle label="In-match messages" checked={settings.messages} onChange={(v) => set('messages', v)} />
        </Field>
        <Field label="Volume">
          <Slider label="Master volume" value={settings.master} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(v) => set('master', v)} />
        </Field>
        <Field label="Mute">
          <Toggle label="Mute" checked={settings.muted} onChange={(v) => set('muted', v)} />
        </Field>
        <Field label="Performance read-out">
          <SegmentedControl
            size="sm"
            label="Performance read-out"
            value={settings.perf}
            onChange={(v) => set('perf', v)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'simple', label: 'Simple' },
              { value: 'detailed', label: 'Detailed' },
            ]}
          />
        </Field>
      </div>
    </Dialog>
  );
}

const GROUPS: ActionGroup[] = ['Driving', 'Mechanisms', 'Human player', 'Match and view'];

function ControlsReference({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: Settings }) {
  const fam = usePadFamily();
  const b = settings.bindings;
  return (
    <Dialog open={open} title="Controls" wide onClose={onClose} actions={<Button variant="primary" data-autofocus onClick={onClose}>Done</Button>}>
      <p>Change bindings in Settings, Controls.</p>
      <div className="zd-controls-ref">
        {GROUPS.map((g) => (
          <section key={g}>
            <h3 className="zd-label">{g}</h3>
            <table className="zd-bind-table is-compact">
              <tbody>
                {ACTIONS.filter((a) => a.group === g).map((a) => (
                  <tr key={a.id}>
                    <th scope="row">{a.label}</th>
                    <td>
                      <span className="zd-binds">
                        {b.keys[a.id].map((k) => (
                          <KeyGlyph key={k} code={k} />
                        ))}
                      </span>
                    </td>
                    <td>
                      <span className="zd-binds">{a.keyboardOnly ? <span className="zd-muted">Sticks</span> : b.pad[a.id].map((p) => <PadGlyph key={p} button={p} family={fam} />)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

const clockOf = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;

function Results({ info, game, mode, onRestart, onWatch, onRobot, onHome }: { info: Done; game: GameDefinition; mode: ModeDef; onRestart: () => void; onWatch: (at?: number) => void; onRobot: () => void; onHome: () => void }) {
  const r = info.result;
  const me = info.playerAlliance;
  const carded = info.redCards.includes(0);
  const player = carded ? 0 : r[me];
  const opp = r[me === 'red' ? 'blue' : 'red'];
  const verdict = mode.solo ? null : player > opp ? 'Win' : player < opp ? 'Loss' : 'Tie';
  const start = info.replay.startTick >= 0 ? info.replay.startTick : 0;
  const sides = mode.solo ? (['red'] as const) : (['red', 'blue'] as const);
  const lead = 2 * TICK_HZ;
  return (
    <div className="zd-results" role="dialog" aria-modal="true" aria-labelledby="zd-results-title">
      <header className="zd-results-head">
        <span className="zd-label">
          {game.name} · {mode.label}
        </span>
        {info.best && (
          <Badge tone="accent" icon="trophy">
            New best
          </Badge>
        )}
      </header>

      <div className="zd-final">
        {verdict ? (
          <h2 id="zd-results-title" className={`zd-verdict is-${verdict === 'Tie' ? 'tie' : verdict === 'Win' ? me : me === 'red' ? 'blue' : 'red'}`}>
            <Icon name={verdict === 'Win' ? 'trophy' : verdict === 'Loss' ? 'xCircle' : 'minus'} size="var(--icon-lg)" />
            {verdict}
          </h2>
        ) : (
          <h2 id="zd-results-title" className="zd-verdict">
            Final score
          </h2>
        )}
        <div className="zd-final-scores">
          {sides.map((a, i) => (
            <div key={a} className={`zd-final-side is-${a}`}>
              {i === 1 && <span className="zd-final-dash" aria-hidden="true">–</span>}
              <span className="zd-final-num zd-num">{mode.solo ? player : r[a]}</span>
              <span className="zd-final-name">
                {mode.solo ? 'Your score' : a === 'red' ? 'Red' : 'Blue'}
                {!mode.solo && a === me ? ' · You' : ''}
              </span>
            </div>
          ))}
        </div>
        {carded && (
          <p className="zd-inline-alert">
            <Icon name="danger" />
            <span>Red card: your team's score is 0.</span>
          </p>
        )}
      </div>

      <section className="zd-results-sec" aria-labelledby="zd-bd">
        <h3 id="zd-bd" className="zd-label">
          Breakdown
        </h3>
        <table className="zd-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              {sides.map((a) => (
                <th key={a} scope="col" colSpan={2} className={`is-${a}`}>
                  {mode.solo ? 'Count · Points' : a === 'red' ? 'Red count · points' : 'Blue count · points'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.label}>
                <th scope="row">{l.label}</th>
                {sides.map((a) => [
                  <td key={`${a}c`} className="zd-num is-count">
                    {l.count ? l.count[a] : '—'}
                  </td>,
                  <td key={`${a}p`} className="zd-num">
                    {l[a]}
                  </td>,
                ])}
              </tr>
            ))}
            <tr className="is-total">
              <th scope="row">Total</th>
              {sides.map((a) => [
                <td key={`${a}c`} />,
                <td key={`${a}p`} className="zd-num">
                  {mode.solo ? player : r[a]}
                </td>,
              ])}
            </tr>
          </tbody>
        </table>
      </section>

      {(r.flags.length > 0 || (game.id === 'pinnacle' && !mode.solo)) && (
        <section className="zd-results-sec" aria-labelledby="zd-ach">
          <h3 id="zd-ach" className="zd-label">
            Achievements
          </h3>
          <ul className="zd-achievements">
            {r.flags.map((f) =>
              sides.map((a) => (
                <li key={`${f.label}${a}`} className={f[a] ? 'is-ok' : 'is-miss'}>
                  <Icon name={f[a] ? 'checkCircle' : 'xCircle'} />
                  <span className="zd-ach-text">
                    <b>{f.label}</b>
                    {!mode.solo && <Badge tone={a}>{a === 'red' ? 'Red' : 'Blue'}</Badge>}
                    <span className="zd-muted">{f[a] ? 'Earned' : (f.why?.[a] ?? 'Not earned')}</span>
                  </span>
                </li>
              )),
            )}
            {game.id === 'pinnacle' && !mode.solo && (
              <li className="is-ok">
                <Icon name="trophy" />
                <span className="zd-ach-text">
                  <b>Ranking points</b>
                  <span className="zd-num">
                    Red {rankingPoints(r, 'red')} · Blue {rankingPoints(r, 'blue')}
                  </span>
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="zd-results-sec" aria-labelledby="zd-calls">
        <h3 id="zd-calls" className="zd-label">
          Violations
        </h3>
        {info.calls.length === 0 ? (
          <p className="zd-muted">No violations called.</p>
        ) : (
          <ul className="zd-calls">
            {info.calls.map((c, i) => (
              <li key={i}>
                <button type="button" className="zd-call" onClick={() => onWatch(Math.max(0, c.tick - lead))} aria-label={`Watch ${c.rule} at ${clockOf(Math.max(0, c.tick - start) / TICK_HZ)}`}>
                  <span className="zd-call-time zd-num">{clockOf(Math.max(0, c.tick - start) / TICK_HZ)}</span>
                  <Icon name="danger" size="var(--icon-sm)" className="zd-danger-icon" />
                  <b>{c.rule}</b>
                  <span className="zd-call-text">{c.text}</span>
                  <Badge tone={c.alliance}>
                    {c.alliance === 'red' ? 'Red' : 'Blue'} · robot {c.robot + 1}
                  </Badge>
                  <span className="zd-muted">
                    {c.level}
                    {c.auton ? ', Autonomous' : ''}
                  </span>
                  <Icon name="film" size="var(--icon-sm)" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="zd-results-actions">
        <Button variant="primary" size="lg" icon="restart" data-autofocus onClick={onRestart}>
          Restart
        </Button>
        <Button size="lg" icon="film" onClick={() => onWatch()}>
          Watch replay
        </Button>
        <Button size="lg" icon="wrench" onClick={onRobot}>
          Change robot
        </Button>
        <Button size="lg" icon="home" onClick={onHome}>
          Home
        </Button>
        <Button variant="ghost" icon="download" onClick={() => downloadJson(replayFileName(info.replay), info.replay)}>
          Export replay
        </Button>
      </footer>
    </div>
  );
}
