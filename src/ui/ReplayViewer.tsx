import { useEffect, useRef, useState } from 'react';
import { makeBot } from '../bots';
import { loadPhysics } from '../engine/physics';
import { ReplayPlayer } from '../engine/session';
import type { GameDefinition } from '../engine/types';
import { formatClock, timeRemaining } from '../shared/matchTimer';
import { replayFileName, type Replay } from '../shared/replay';
import { TICK_HZ } from '../shared/timestep';
import { CAMERA_LABELS, CAMERA_MODES, type CameraMode, type ZRenderer } from '../render/renderer';
import { Wordmark, phaseLabel } from './chrome';
import { downloadJson } from './download';
import { attachCanvas, getRenderer } from './host';
import { resolveQuality } from './quality';
import type { Settings } from './settings';

/** Replay viewer: re-simulates the run with scrubbing (snapshots every 10 s), speed and camera switching. */
export default function ReplayViewer({ game, replay, settings, onExit }: { game: GameDefinition; replay: Replay; settings: Settings; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReplayPlayer | null>(null);
  const rendererRef = useRef<ZRenderer | null>(null);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState(0);
  const [cam, setCam] = useState<CameraMode>(settings.view === '2d' ? 'overhead' : settings.camera);
  const [info, setInfo] = useState({ clock: '0:00', phase: 'pre' as ReturnType<typeof phaseLabel> | string, red: 0, blue: 0 });
  const ctl = useRef({ playing: true, speed: 1, focus: 0, seekTo: -1 });
  ctl.current.playing = playing;
  ctl.current.speed = speed;
  ctl.current.focus = focus;

  useEffect(() => {
    let live = true;
    let raf = 0;
    let detach = () => {};
    (async () => {
      await loadPhysics();
      const r = await getRenderer(resolveQuality(settings.quality));
      if (!live || !host.current) return;
      rendererRef.current = r;
      detach = attachCanvas(r, host.current);
      const bots = replay.entries.map((e) => (typeof e.driver === 'string' ? null : makeBot(e.driver.style, e.driver.level)));
      const p = new ReplayPlayer(replay, { game, modeId: replay.mode, robots: replay.entries, seed: replay.seed, autoRef: replay.autoRef, worlds: replay.worlds }, bots);
      playerRef.current = p;
      r.alliance = replay.entries[0]?.alliance ?? 'red';
      r.loadGame(game);
      const world = () => ({
        objects: p.sim.state.objects.map((o) => ({ kind: o.kind, pin: o.pin, hidden: o.loc === 'supply' || (o.loc === 'loader' && !p.sim.state.loaders.some((l) => l.presented === o.id) && o.base < 0) })),
        robots: p.sim.state.robots.map((x) => ({ spec: p.sim.specs[x.index], alliance: x.alliance })),
      });
      r.setWorld(world());
      r.setCamera(cam);
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
          r.syncObjects(world());
          prev = cur;
        }
        uiTimer -= dt;
        if (uiTimer <= 0) {
          uiTimer = 0.1;
          r.syncObjects(world());
          const s = p.sim.score();
          setTick(p.tick);
          setInfo({ clock: formatClock(timeRemaining(p.sim.state.timer, p.sim.mode.timing)), phase: phaseLabel(p.sim.phase), red: s.red, blue: s.blue });
        }
        r.applyPoses(prev, cur, c.playing ? Math.min(1, acc * TICK_HZ) : 1);
        r.render(c.focus, dt);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      playerRef.current?.dispose();
      playerRef.current = null;
      detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleCam = () => {
    const next = CAMERA_MODES[(CAMERA_MODES.indexOf(cam) + 1) % CAMERA_MODES.length];
    setCam(next);
    rendererRef.current?.setCamera(next);
  };

  return (
    <div className="game-view replay">
      <div className="canvas-host" ref={host} />
      <div className="hud-top">
        <Wordmark small />
        <div className="scoreboard">
          <span className="s red">{info.red}</span>
          <span className="clock">
            <b>{info.clock}</b>
            <small>{info.phase}</small>
          </span>
          <span className="s blue">{info.blue}</span>
        </div>
        <div className="hud-mode">Replay · {game.modes.find((m) => m.id === replay.mode)?.label}</div>
      </div>
      <div className="replay-bar">
        <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
        <input
          type="range"
          min={0}
          max={replay.ticks}
          value={tick}
          onChange={(e) => {
            ctl.current.seekTo = +e.target.value;
            setTick(+e.target.value);
          }}
        />
        <span className="time">
          {(tick / TICK_HZ).toFixed(1)} / {(replay.ticks / TICK_HZ).toFixed(1)} s
        </span>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)}>
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button onClick={cycleCam}>{CAMERA_LABELS[cam]}</button>
        <select value={focus} onChange={(e) => setFocus(+e.target.value)}>
          {replay.entries.map((e, i) => (
            <option key={i} value={i}>
              Follow robot {i + 1} ({e.alliance}
              {e.driver === 'player' ? ', you' : ''})
            </option>
          ))}
        </select>
        <button onClick={() => downloadJson(replayFileName(replay), replay)}>Export</button>
        <button onClick={onExit}>Close</button>
      </div>
    </div>
  );
}
