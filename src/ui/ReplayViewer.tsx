import { useEffect, useRef, useState } from 'react';
import { makeBot } from '../bots';
import { loadPhysics } from '../engine/physics';
import { ReplayPlayer } from '../engine/session';
import type { GameDefinition } from '../engine/types';
import { formatClock, timeRemaining, type Phase } from '../shared/matchTimer';
import { replayFileName, type Replay } from '../shared/replay';
import { TICK_HZ } from '../shared/timestep';
import { CAMERA_LABELS, CAMERA_MODES, type CameraMode, type ZRenderer } from '../render/renderer';
import { Button, IconButton, KeyHint, SegmentedControl, Select } from './components';
import { downloadJson } from './download';
import { attachCanvas, getRenderer } from './host';
import { ScoreBar } from './hud';
import { Icon } from './icons';
import { useBack, useShortcut, useTabSwitch } from './nav';
import { resolveQuality } from './quality';
import type { Settings } from './settings';
import { worldInfoOf } from './world';

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const clockOf = (ticks: number) => {
  const s = Math.max(0, ticks) / TICK_HZ;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

/** Replay viewer: re-simulates the run with a timeline (period + violation markers), speed and cameras. */
export default function ReplayViewer({ game, replay, at, settings, onExit }: { game: GameDefinition; replay: Replay; at?: number; settings: Settings; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayer | null>(null);
  const rendererRef = useRef<ZRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState(0);
  const [cam, setCam] = useState<CameraMode>(settings.view === '2d' ? 'overhead' : settings.camera);
  const [info, setInfo] = useState({ clock: '0:00', phase: 'pre' as Phase, endgame: false, red: 0, blue: 0 });
  const ctl = useRef({ playing: true, speed: 1, focus: 0, seekTo: at ?? -1 });
  ctl.current.playing = playing;
  ctl.current.speed = speed;
  ctl.current.focus = focus;
  const mode = game.modes.find((m) => m.id === replay.mode);

  useEffect(() => {
    let live = true;
    let raf = 0;
    let release = () => {};
    (async () => {
      try {
        await loadPhysics();
        const r = await getRenderer(resolveQuality(settings.quality));
        if (!live || !host.current) return;
        rendererRef.current = r;
        release = attachCanvas(r, host.current);
        const bots = replay.entries.map((e) => (typeof e.driver === 'string' ? null : makeBot(e.driver.style, e.driver.level)));
        const p = new ReplayPlayer(replay, { game, modeId: replay.mode, robots: replay.entries, seed: replay.seed, autoRef: replay.autoRef, worlds: replay.worlds }, bots);
        playerRef.current = p;
        r.alliance = replay.entries[0]?.alliance ?? 'red';
        r.loadGame(game);
        r.setWorld(worldInfoOf(p.sim));
        r.setCamera(cam);
        setReady(true);
        let prev = p.sim.poses();
        let cur = prev;
        let acc = 0;
        let last = performance.now();
        let uiTimer = 0;
        const frame = (now: number) => {
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          const c = ctl.current;
          if (c.seekTo >= 0) {
            p.seek(c.seekTo);
            c.seekTo = -1;
            prev = cur = p.sim.poses();
            acc = 0;
            uiTimer = 0;
          } else if (c.playing) {
            acc += dt * c.speed;
            let n = 0;
            while (acc >= 1 / TICK_HZ && n < 60) {
              prev = cur;
              if (!p.step()) {
                setPlaying(false);
                break;
              }
              cur = p.sim.poses();
              acc -= 1 / TICK_HZ;
              n++;
            }
          }
          if (r.objectCount !== p.sim.state.objects.length || prev.length !== cur.length) {
            r.syncObjects(worldInfoOf(p.sim));
            prev = cur;
          }
          uiTimer -= dt;
          if (uiTimer <= 0) {
            uiTimer = 0.1;
            r.syncObjects(worldInfoOf(p.sim));
            const s = p.sim.score();
            setTick(p.tick);
            setInfo({ clock: formatClock(timeRemaining(p.sim.state.timer, p.sim.mode.timing)), phase: p.sim.phase, endgame: p.sim.endgame, red: s.red, blue: s.blue });
          }
          r.applyPoses(prev, cur, c.playing ? Math.min(1, acc * TICK_HZ) : 1);
          r.render(c.focus, dt);
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      } catch (e) {
        setError((e as Error).message || String(e));
      }
    })();
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      playerRef.current?.dispose();
      playerRef.current = null;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCamera = (c: CameraMode) => {
    setCam(c);
    rendererRef.current?.setCamera(c);
  };
  const cycleCam = () => setCamera(CAMERA_MODES[(CAMERA_MODES.indexOf(cam) + 1) % CAMERA_MODES.length]);
  const seek = (t: number) => {
    const v = Math.max(0, Math.min(replay.ticks, Math.round(t)));
    ctl.current.seekTo = v;
    setTick(v);
  };
  const togglePlay = () => {
    if (!playing && tick >= replay.ticks) seek(0);
    setPlaying(!playing);
  };

  useBack(() => onExit());
  useTabSwitch((d) => setSpeed((s) => SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(s) + d))]));
  useShortcut({ code: 'Space', pad: 2 }, togglePlay);
  useShortcut({ code: 'KeyC', pad: 3 }, cycleCam);

  // Timeline markers: period boundaries (from the mode timing) and rule calls.
  const T = replay.ticks || 1;
  const pct = (t: number) => `${(Math.max(0, Math.min(T, t)) / T) * 100}%`;
  const periods: { t: number; label: string }[] = [];
  if (mode && replay.startTick >= 0 && !mode.timing.untimed) {
    const tm = mode.timing;
    let t = replay.startTick;
    if (tm.autonSec > 0) {
      periods.push({ t, label: 'Autonomous' });
      t += tm.autonSec * TICK_HZ + tm.pauseSec * TICK_HZ;
    }
    periods.push({ t, label: 'Driver control' });
    if (tm.endgameSec > 0) periods.push({ t: t + (tm.driverSec - tm.endgameSec) * TICK_HZ, label: 'Endgame' });
  }
  const calls = replay.calls ?? [];

  return (
    <div className="zd-game zd-replay" data-nav-scope="overlay">
      <div className="zd-game-canvas" ref={host} />
      <div className="zd-replay-top">
        <Button variant="secondary" size="sm" icon="chevronLeft" hint={{ action: 'back' }} onClick={onExit}>
          Close
        </Button>
        <ScoreBar red={info.red} blue={info.blue} clock={info.clock} phase={info.phase} endgame={info.endgame} solo={!!mode?.solo} onClick={() => {}} />
        <span className="zd-replay-title">
          <Icon name="film" size="var(--icon-sm)" />
          Replay · {mode?.label ?? replay.mode}
        </span>
      </div>

      <div className="zd-replay-bar">
        <div className="zd-timeline">
          <div className="zd-timeline-track" aria-hidden="true">
            <span className="zd-timeline-fill" style={{ transform: `scaleX(${Math.min(1, tick / T)})` }} />
            {periods.map((p) => (
              <span key={p.label} className="zd-timeline-period" style={{ left: pct(p.t) }} title={p.label}>
                <span className="zd-timeline-label">{p.label}</span>
              </span>
            ))}
          </div>
          <input
            type="range"
            className="zd-timeline-input"
            min={0}
            max={replay.ticks}
            step={TICK_HZ / 10}
            value={tick}
            aria-label="Replay position"
            aria-valuetext={clockOf(tick - Math.max(0, replay.startTick))}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              seek(tick + d * (e.shiftKey ? 10 : 5) * TICK_HZ);
            }}
            onChange={(e) => seek(+e.target.value)}
          />
          {calls.map(([t, rule, a], i) => (
            <button key={i} type="button" className={`zd-timeline-call is-${a}`} style={{ left: pct(t) }} onClick={() => seek(t - 2 * TICK_HZ)} aria-label={`Jump to ${rule} at ${clockOf(t - Math.max(0, replay.startTick))}`} title={`${rule} · ${a === 'red' ? 'Red' : 'Blue'}`}>
              <Icon name="danger" size="var(--icon-sm)" />
            </button>
          ))}
        </div>
        <div className="zd-replay-controls">
          <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} variant="primary" onClick={togglePlay} data-autofocus />
          <span className="zd-replay-time zd-num">
            {clockOf(tick - Math.max(0, replay.startTick))} <span className="zd-muted">/ {clockOf(replay.ticks - Math.max(0, replay.startTick))}</span>
          </span>
          <span className="zd-row zd-replay-speed">
            <KeyHint action="tabPrev" />
            <SegmentedControl size="sm" label="Playback speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} />
            <KeyHint action="tabNext" />
          </span>
          <span className="zd-replay-spacer" />
          <Select label="Camera" value={cam} onChange={setCamera} options={CAMERA_MODES.map((c) => ({ value: c, label: CAMERA_LABELS[c] }))} />
          <Select
            label="Follow"
            value={focus}
            onChange={setFocus}
            options={replay.entries.map((e, i) => ({ value: i, label: `Robot ${i + 1} · ${e.alliance === 'red' ? 'Red' : 'Blue'}${e.driver === 'player' ? ' · you' : ''}` }))}
          />
          <IconButton icon="download" label="Export replay" onClick={() => downloadJson(replayFileName(replay), replay)} />
        </div>
      </div>

      {!ready && !error && (
        <div className="zd-overlay is-solid" role="status">
          <div className="zd-loading">
            <span className="zd-muted">Rebuilding the run</span>
            <span className="zd-progress zd-progress--indeterminate">
              <span />
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="zd-overlay is-solid" role="alert">
          <div className="zd-menu-card">
            <Icon name="danger" size="var(--icon-lg)" className="zd-danger-icon" />
            <h2>This replay couldn't play</h2>
            <p className="zd-muted">It may come from an older version of ZDrive or a browser without WebGL.</p>
            <p className="zd-muted zd-small">{error}</p>
            <Button variant="primary" onClick={onExit} data-autofocus>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
