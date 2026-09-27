import { useEffect, useMemo, useRef, useState } from 'react';
import { derivedStats } from '../engine/drivetrain';
import { checkLegality } from '../engine/legality';
import type { GameDefinition } from '../engine/types';
import { presetsFor } from '../games/presets';
import { exportRobot, importRobot } from '../shared/robotCodec';
import type { Cartridge, DriveType, EffectorType, IntakeType, LiftType, MotorW, RobotSpec, ToolType, WheelSize } from '../shared/types';
import { attachCanvas, getRenderer } from './host';
import { deleteRobot, listRobots, loadThumbs, newId, saveThumb, upsertRobot } from './robots';
import type { Quality } from './settings';
import type { ZRenderer } from '../render/renderer';

const RATIOS: { v: number; label: string }[] = [
  { v: 36 / 84, label: '36:84 (0.43)' },
  { v: 0.6, label: '36:60 (0.6)' },
  { v: 0.75, label: '36:48 (0.75)' },
  { v: 1, label: 'Direct (1:1)' },
  { v: 48 / 36, label: '48:36 (1.33)' },
  { v: 60 / 36, label: '60:36 (1.67)' },
];

const DRIVES: { id: DriveType; label: string }[] = [
  { id: 'tank', label: 'Tank' },
  { id: 'xdrive', label: 'X-drive' },
  { id: 'mecanum', label: 'Mecanum' },
  { id: 'hdrive', label: 'H-drive' },
];
const INTAKES: { id: IntakeType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'flex', label: 'Flex-wheel roller' },
  { id: 'conveyor', label: 'Chain / roller conveyor' },
  { id: 'floorclaw', label: 'Floor claw' },
];
const LIFTS: { id: LiftType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'arm', label: 'Single arm' },
  { id: 'fourbar', label: '4-bar' },
  { id: 'dr4b', label: 'Double reverse 4-bar' },
  { id: 'sixbar', label: '6-bar' },
  { id: 'chainbar', label: 'Chain bar on an arm' },
  { id: 'cascade', label: 'Cascade / linear' },
];
const EFFECTORS: { id: EffectorType; label: string }[] = [
  { id: 'claw', label: 'Single claw (one piece)' },
  { id: 'dual', label: 'Dual-grip (1 Pin + 1 Cup)' },
  { id: 'stack', label: 'Stack gripper' },
];
const TOOLS: { id: ToolType; label: string }[] = [
  { id: 'none', label: 'None (push with the chassis)' },
  { id: 'wedge', label: 'Arm wedge' },
  { id: 'spinner', label: 'Spinner wheel' },
  { id: 'flipper', label: 'Pneumatic flipper' },
];

/** Motor list editor: count + wattage. */
function Motors({ value, onChange, max = 4, min = 0 }: { value: MotorW[]; onChange: (m: MotorW[]) => void; max?: number; min?: number }) {
  const w = value[0] ?? 11;
  return (
    <span className="motors">
      <select value={value.length} onChange={(e) => onChange(Array(+e.target.value).fill(w))}>
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
          <option key={n} value={n}>
            {n} motor{n === 1 ? '' : 's'}
          </option>
        ))}
      </select>
      <select value={w} onChange={(e) => onChange(value.map(() => +e.target.value as MotorW))} disabled={value.length === 0}>
        <option value={11}>11 W</option>
        <option value={5.5}>5.5 W</option>
      </select>
    </span>
  );
}

function Num({ label, value, min, max, step = 0.5, onChange, unit = '"' }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label>
      {label}{' '}
      <b>
        {value}
        {unit}
      </b>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function Builder({ def, quality, selected, onSelect }: { def: GameDefinition; quality: Quality; selected: RobotSpec; onSelect: (r: RobotSpec) => void }) {
  const [saved, setSaved] = useState<RobotSpec[]>(() => listRobots(def.id));
  const [spec, setSpec] = useState<RobotSpec>(() => (selected.id.startsWith('preset:') ? { ...structuredClone(selected), id: newId(), name: `${selected.name} (copy)` } : structuredClone(selected)));
  const [dirty, setDirty] = useState(false);
  const [previewLift, setPreviewLift] = useState(0);
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const [thumbs, setThumbs] = useState(() => loadThumbs(def.id));
  const host = useRef<HTMLDivElement>(null);
  const rRef = useRef<ZRenderer | null>(null);
  const legal = useMemo(() => checkLegality(spec, def.builder, def.possession), [spec, def]);
  const stats = useMemo(() => derivedStats(spec), [spec]);

  const edit = (fn: (s: RobotSpec) => void) => {
    const next = structuredClone(spec);
    fn(next);
    setSpec(next);
    setDirty(true);
  };

  // Live turntable preview through the shared renderer.
  useEffect(() => {
    let live = true;
    let raf = 0;
    let detach = () => {};
    void getRenderer(quality).then((r) => {
      if (!live || !host.current) return;
      rRef.current = r;
      detach = attachCanvas(r, host.current);
      let last = performance.now();
      const frame = (now: number) => {
        r.renderPreview(Math.min(0.1, (now - last) / 1000));
        last = now;
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      rRef.current?.endPreview();
      detach();
    };
  }, [quality]);

  useEffect(() => {
    const r = rRef.current;
    const show = () => {
      rRef.current?.showPreview(spec, { footprint: def.builder.footprintMax, height: def.builder.heightMax });
      rRef.current?.previewPose(previewLift, 0);
    };
    if (r) show();
    else void getRenderer(quality).then(show);
  }, [spec, def, quality, previewLift]);

  const save = () => {
    const s = { ...spec, game: def.id };
    setSaved(upsertRobot(s));
    if (rRef.current) {
      saveThumb(def.id, s.id, rRef.current.thumbnail());
      setThumbs(loadThumbs(def.id));
    }
    setDirty(false);
    onSelect(s);
    setMsg(`Saved “${s.name}”.`);
  };

  const load = (r: RobotSpec, copy: boolean) => {
    const next = copy ? { ...structuredClone(r), id: newId(), name: copy && r.id.startsWith('preset:') ? r.name : `${r.name} (copy)`, game: def.id } : structuredClone(r);
    setSpec(next);
    setDirty(copy);
    if (!copy) onSelect(r);
  };

  const d = spec.drive;
  const tankLike = d.type === 'tank' || d.type === 'hdrive';

  return (
    <div className="builder">
      <aside className="garage">
        <h3>Saved robots</h3>
        {saved.length === 0 && <p className="hint">Nothing saved yet.</p>}
        <ul>
          {saved.map((r) => (
            <li key={r.id} className={r.id === spec.id ? 'active' : ''}>
              {thumbs[r.id] ? <img src={thumbs[r.id]} alt="" /> : <span className="thumb-empty" />}
              <button className="link" onClick={() => load(r, false)}>
                {r.name}
              </button>
              <span className="row">
                <button title="Duplicate" onClick={() => load(r, true)}>
                  ⧉
                </button>
                <button
                  title="Delete"
                  onClick={() => {
                    if (!confirm(`Delete “${r.name}”?`)) return;
                    setSaved(deleteRobot(def.id, r.id));
                  }}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
        <h3>Presets</h3>
        <ul>
          {presetsFor(def.id).map((p) => (
            <li key={p.id}>
              <button className="link" onClick={() => load(p, true)}>
                {p.name}
              </button>
              <button className="small" onClick={() => onSelect(p)}>
                Use
              </button>
            </li>
          ))}
        </ul>
        <h3>Share</h3>
        <textarea value={io} onChange={(e) => setIo(e.target.value)} placeholder="Paste a ZDRIVE1: robot string" rows={3} />
        <div className="row">
          <button
            onClick={() => {
              setIo(exportRobot(spec));
              void navigator.clipboard?.writeText(exportRobot(spec)).catch(() => {});
              setMsg('Robot string copied.');
            }}
          >
            Export
          </button>
          <button
            onClick={() => {
              const r = importRobot(io);
              if (!r.ok) return setMsg(r.error);
              setSpec({ ...r.spec, id: newId(), game: def.id });
              setDirty(true);
              setMsg(`Imported “${r.spec.name}”. Save to keep it.`);
            }}
          >
            Import
          </button>
        </div>
      </aside>

      <section className="editor">
        <div className="name-row">
          <input value={spec.name} onChange={(e) => edit((s) => (s.name = e.target.value))} aria-label="Robot name" />
          <button className="primary" onClick={save}>
            {dirty ? 'Save robot' : 'Saved'}
          </button>
        </div>
        {msg && <p className="hint">{msg}</p>}

        <fieldset>
          <legend>Chassis (starting size ≤ {def.builder.startMax}")</legend>
          <Num label="Length" value={spec.chassis.length} min={10} max={18} onChange={(v) => edit((s) => (s.chassis.length = v))} />
          <Num label="Width" value={spec.chassis.width} min={10} max={18} onChange={(v) => edit((s) => (s.chassis.width = v))} />
          <Num label="Starting height" value={spec.chassis.height} min={6} max={18} onChange={(v) => edit((s) => (s.chassis.height = v))} />
        </fieldset>

        <fieldset>
          <legend>Drivetrain</legend>
          <label>
            Type
            <select
              value={d.type}
              onChange={(e) =>
                edit((s) => {
                  s.drive.type = e.target.value as DriveType;
                  if (s.drive.type === 'xdrive' || s.drive.type === 'mecanum') {
                    s.drive.wheelsPerSide = 2;
                    s.drive.motorsPerSide = [s.drive.motorsPerSide[0] ?? 11, s.drive.motorsPerSide[0] ?? 11];
                  }
                  if (s.drive.type === 'hdrive' && s.drive.strafeMotors.length === 0) s.drive.strafeMotors = [11];
                })
              }
            >
              {DRIVES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {tankLike && (
            <label>
              Wheels
              <select value={d.wheelsPerSide} onChange={(e) => edit((s) => (s.drive.wheelsPerSide = +e.target.value as 2 | 3 | 4))}>
                <option value={2}>4 wheels</option>
                <option value={3}>6 wheels</option>
                <option value={4}>8 wheels</option>
              </select>
            </label>
          )}
          <label>
            Wheel size
            <select value={d.wheelDia} onChange={(e) => edit((s) => (s.drive.wheelDia = +e.target.value as WheelSize))}>
              <option value={2.75}>2.75"</option>
              <option value={3.25}>3.25"</option>
              <option value={4}>4"</option>
            </select>
          </label>
          {d.type === 'tank' && (
            <div className="omni">
              Omni / traction (front → back):
              {Array.from({ length: d.wheelsPerSide }, (_, i) => (
                <button key={i} className={d.omni[i] ?? true ? 'omni-on' : 'omni-off'} onClick={() => edit((s) => (s.drive.omni[i] = !(s.drive.omni[i] ?? true)))}>
                  {d.omni[i] ?? true ? 'Omni' : 'Traction'}
                </button>
              ))}
            </div>
          )}
          <label>
            Cartridge
            <select value={d.cartridge} onChange={(e) => edit((s) => (s.drive.cartridge = +e.target.value as Cartridge))}>
              <option value={100}>100 rpm (red)</option>
              <option value={200}>200 rpm (green)</option>
              <option value={600}>600 rpm (blue)</option>
            </select>
          </label>
          <label>
            External ratio
            <select value={RATIOS.reduce((b, r) => (Math.abs(r.v - d.ratio) < Math.abs(b.v - d.ratio) ? r : b)).v} onChange={(e) => edit((s) => (s.drive.ratio = +e.target.value))}>
              {RATIOS.map((r) => (
                <option key={r.label} value={r.v}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Motors per side
            <Motors value={d.motorsPerSide} min={1} max={d.type === 'xdrive' || d.type === 'mecanum' ? 2 : 4} onChange={(m) => edit((s) => (s.drive.motorsPerSide = m))} />
          </label>
          {d.type === 'hdrive' && (
            <label>
              Center wheel
              <Motors value={d.strafeMotors} min={1} max={2} onChange={(m) => edit((s) => (s.drive.strafeMotors = m))} />
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>Intake</legend>
          <label>
            Type
            <select value={spec.intake.type} onChange={(e) => edit((s) => (s.intake.type = e.target.value as IntakeType))}>
              {INTAKES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {spec.intake.type !== 'none' && (
            <>
              <label>
                Mount
                <select value={spec.intake.mount} onChange={(e) => edit((s) => (s.intake.mount = e.target.value as RobotSpec['intake']['mount']))}>
                  <option value="front">Front</option>
                  <option value="back">Back</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={spec.intake.upright} onChange={(e) => edit((s) => (s.intake.upright = e.target.checked))} />
                Takes upright pieces
              </label>
              <label className="check">
                <input type="checkbox" checked={spec.intake.lying} onChange={(e) => edit((s) => (s.intake.lying = e.target.checked))} />
                Takes lying pieces
              </label>
              <label>
                Motors
                <Motors value={spec.intake.motors} onChange={(m) => edit((s) => (s.intake.motors = m))} max={2} />
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Lift</legend>
          <label>
            Type
            <select value={spec.lift.type} onChange={(e) => edit((s) => (s.lift.type = e.target.value as LiftType))}>
              {LIFTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {spec.lift.type !== 'none' && (
            <>
              <Num label="Max grip height" value={spec.lift.maxHeight} min={6} max={def.builder.heightMax ? 46 : 60} step={1} onChange={(v) => edit((s) => (s.lift.maxHeight = v))} />
              <label>
                Motors
                <Motors value={spec.lift.motors} onChange={(m) => edit((s) => (s.lift.motors = m))} />
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>End effector</legend>
          <label>
            Type
            <select value={spec.effector.type} onChange={(e) => edit((s) => (s.effector.type = e.target.value as EffectorType))}>
              {EFFECTORS.filter((x) => x.id !== 'stack' || def.builder.allowStackGripper).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Actuation
            <select value={spec.effector.actuation} onChange={(e) => edit((s) => (s.effector.actuation = e.target.value as 'motor' | 'pneumatic'))}>
              <option value="motor">Motor</option>
              <option value="pneumatic">Pneumatic</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={spec.effector.wrist} onChange={(e) => edit((s) => (s.effector.wrist = e.target.checked))} />
            Wrist flip (turns a Cup over)
          </label>
          {spec.effector.actuation === 'motor' && (
            <label>
              Motors
              <Motors value={spec.effector.motors} onChange={(m) => edit((s) => (s.effector.motors = m))} max={2} />
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>{def.id === 'override' ? 'Toggle' : 'Roller'} tool</legend>
          <label>
            Type
            <select value={spec.tool.type} onChange={(e) => edit((s) => (s.tool.type = e.target.value as ToolType))}>
              {TOOLS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {spec.tool.type === 'spinner' && (
            <label>
              Motors
              <Motors value={spec.tool.motors} onChange={(m) => edit((s) => (s.tool.motors = m))} max={1} />
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>Pneumatics (≤ {def.builder.pneumaticPsi} psi)</legend>
          <Num label="Air tanks" value={spec.pneumatics.tanks} min={0} max={4} step={1} unit="" onChange={(v) => edit((s) => (s.pneumatics.tanks = v))} />
          <Num label="Cylinders" value={spec.pneumatics.cylinders} min={0} max={8} step={1} unit="" onChange={(v) => edit((s) => (s.pneumatics.cylinders = v))} />
        </fieldset>
      </section>

      <section className="preview-col">
        <div className="preview" ref={host} />
        <label>
          Preview lift <input type="range" min={0} max={1} step={0.01} value={previewLift} onChange={(e) => setPreviewLift(+e.target.value)} />
        </label>
        <div className="derived">
          <div>
            <b>{stats.topSpeedFps.toFixed(1)}</b>
            <small>ft/s top speed</small>
          </div>
          <div>
            <b>{Math.round(stats.turnDps)}</b>
            <small>°/s turn</small>
          </div>
          <div>
            <b>{stats.pushLbf.toFixed(1)}</b>
            <small>lbf push</small>
          </div>
          <div>
            <b>{(stats.massKg * 2.2046).toFixed(1)}</b>
            <small>lb (est.)</small>
          </div>
          {stats.strafeFps > 0 && (
            <div>
              <b>{stats.strafeFps.toFixed(1)}</b>
              <small>ft/s strafe</small>
            </div>
          )}
        </div>
        <div className={`legality ${legal.ok ? 'ok' : 'bad'}`}>
          <h3>{legal.ok ? `Legal for ${def.name}` : `Not legal for ${def.name}`}</h3>
          <Bar label="Total motor power" value={legal.totalW} cap={def.builder.totalWatts} />
          {def.builder.driveWatts !== null && <Bar label="Drivetrain power" value={legal.driveW} cap={def.builder.driveWatts} />}
          <p>
            Expanded: {legal.maxLength.toFixed(1)}" × {legal.maxWidth.toFixed(1)}" (≤ {def.builder.footprintMax}"), height {legal.maxHeight.toFixed(1)}"
            {def.builder.heightMax ? ` (≤ ${def.builder.heightMax}")` : ' (no limit)'}
          </p>
          <p>{legal.capacity}</p>
          {legal.airActuations > 0 && <p>Air: about {legal.airActuations} actuations (estimate).</p>}
          <ul>
            {legal.errors.map((e) => (
              <li key={e} className="err">
                {e}
              </li>
            ))}
            {legal.warnings.map((w) => (
              <li key={w} className="warnline">
                {w}
              </li>
            ))}
          </ul>
          {!legal.ok && <p className="hint">Illegal robots can still be driven in Free Drive.</p>}
        </div>
      </section>
    </div>
  );
}

function Bar({ label, value, cap }: { label: string; value: number; cap: number }) {
  const pct = Math.min(100, (value / cap) * 100);
  return (
    <div className="bar">
      <span>
        {label}: <b>{value} W</b> / {cap} W
      </span>
      <div className="track">
        <div className={`fill${value > cap ? ' over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
