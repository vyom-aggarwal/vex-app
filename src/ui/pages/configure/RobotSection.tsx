import { useEffect, useMemo, useRef, useState } from 'react';
import { derivedStats } from '../../../engine/drivetrain';
import { checkLegality } from '../../../engine/legality';
import type { GameDefinition } from '../../../engine/types';
import { presetsFor } from '../../../games/presets';
import type { ZRenderer } from '../../../render/renderer';
import { exportRobot, importRobot } from '../../../shared/robotCodec';
import type { Cartridge, DriveType, EffectorType, IntakeType, LiftType, MotorW, RobotSpec, ToolType, WheelSize } from '../../../shared/types';
import { Field, OptionCards, Section, Segmented, Slider, Stat, Stepper, Swatches, Switch } from '../../formLegacy';
import { attachCanvas, getRenderer } from '../../host';
import { deleteRobot, listRobots, loadDraft, loadThumbs, newId, saveDraft, saveThumb, upsertRobot } from '../../robots';
import type { Settings } from '../../settings';
import { resolveQuality } from '../../quality';

const RATIOS: { v: number; label: string }[] = [
  { v: 36 / 84, label: '36:84' },
  { v: 0.6, label: '36:60' },
  { v: 0.75, label: '36:48' },
  { v: 1, label: '1:1' },
  { v: 48 / 36, label: '48:36' },
  { v: 60 / 36, label: '60:36' },
];

const CHASSIS_COLORS = [0x9aa3ad, 0x5d646d, 0x2b2f36, 0xd9dde2, 0x1f4e79, 0x6b3fa0, 0x2e7d4f, 0xb35c1e];
const ACCENTS = [0xd9303a, 0x2f6fdc, 0xf2c230, 0x2aa36b, 0xe86a1c, 0x8e44ad, 0xffffff, 0x111214];

const driveName = (s: RobotSpec): string =>
  s.drive.type === 'tank' ? `Tank ${s.drive.wheelsPerSide * 2}-wheel` : s.drive.type === 'xdrive' ? 'X-drive' : s.drive.type === 'mecanum' ? 'Mecanum' : 'H-drive';
const liftName: Record<LiftType, string> = { none: 'No lift', arm: 'Arm', fourbar: '4-bar', dr4b: 'DR4B', sixbar: '6-bar', chainbar: 'Chain bar', cascade: 'Cascade' };
const effName: Record<EffectorType, string> = { claw: 'Claw', dual: 'Dual-grip', stack: 'Stack gripper' };
export const summary = (s: RobotSpec): string => `${driveName(s)} · ${liftName[s.lift.type]} · ${effName[s.effector.type]}${s.intake.type !== 'none' ? ' · intake' : ''}`;

function Motors({ value, onChange, min = 0, max = 4 }: { value: MotorW[]; onChange: (m: MotorW[]) => void; min?: number; max?: number }) {
  const w = value[0] ?? 11;
  return (
    <div className="row">
      <Stepper value={value.length} min={min} max={max} onChange={(n) => onChange(Array(n).fill(w))} suffix={value.length === 1 ? ' motor' : ' motors'} />
      <Segmented
        small
        value={w}
        onChange={(v) => onChange(value.map(() => v as MotorW))}
        options={[
          { value: 11, label: '11 W', disabled: value.length === 0 },
          { value: 5.5, label: '5.5 W', disabled: value.length === 0 },
        ]}
      />
    </div>
  );
}

export function RobotSection({ def, settings, setSettings }: { def: GameDefinition; settings: Settings; setSettings: (s: Settings) => void }) {
  const [spec, setSpec] = useState<RobotSpec>(() => loadDraft(def.id));
  const [saved, setSaved] = useState<RobotSpec[]>(() => listRobots(def.id));
  const [thumbs, setThumbs] = useState(() => loadThumbs(def.id));
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [previewLift, setPreviewLift] = useState(0);
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const rRef = useRef<ZRenderer | null>(null);
  const legal = useMemo(() => checkLegality(spec, def.builder, def.possession), [spec, def]);
  const stats = useMemo(() => derivedStats(spec), [spec]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });

  // Every change is kept in My Robot.
  const edit = (fn: (s: RobotSpec) => void) => {
    const next = structuredClone(spec);
    fn(next);
    setSpec(next);
    saveDraft(next);
  };

  // Shared renderer turntable.
  useEffect(() => {
    let live = true;
    let raf = 0;
    let detach = () => {};
    void getRenderer(resolveQuality(settings.quality)).then((r) => {
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
  }, [settings.quality]);

  useEffect(() => {
    const show = (r: ZRenderer) => {
      r.showPreview(spec, { footprint: def.builder.footprintMax, height: def.builder.heightMax }, settings.alliance);
      r.setPreview2d(view === '2d');
      r.previewPose(previewLift, 0);
    };
    if (rRef.current) show(rRef.current);
    else void getRenderer(resolveQuality(settings.quality)).then(show);
    // Refresh My Robot's thumbnail shortly after edits settle.
    const t = setTimeout(() => {
      if (!rRef.current) return;
      saveThumb(def.id, spec.id, rRef.current.thumbnail(128));
      setThumbs(loadThumbs(def.id));
    }, 900);
    return () => clearTimeout(t);
  }, [spec, def, view, previewLift, settings.alliance, settings.quality]);

  const loadInto = (r: RobotSpec) => {
    const next: RobotSpec = { ...structuredClone(r), id: 'draft', game: def.id, name: r.id.startsWith('preset:') ? 'My Robot' : r.name };
    setSpec(next);
    saveDraft(next);
    setMsg(`Loaded “${r.name}” into My Robot.`);
  };

  const saveCopy = () => {
    const copy: RobotSpec = { ...structuredClone(spec), id: newId() };
    setSaved(upsertRobot(copy));
    if (rRef.current) saveThumb(def.id, copy.id, rRef.current.thumbnail(128));
    setThumbs(loadThumbs(def.id));
    setMsg(`Saved “${copy.name}”.`);
  };

  const d = spec.drive;
  const tankLike = d.type === 'tank' || d.type === 'hdrive';
  const holo = d.type !== 'tank';

  return (
    <div className="robot-page">
      <div className="robot-main">
        <section className="card robot-head">
          <div className="head-left">
            <div className="preview-wrap">
              <div className="preview" ref={host} />
              <Segmented small value={view} onChange={setView} options={[{ value: '3d', label: '3D' }, { value: '2d', label: '2D' }]} />
            </div>
            <section className={`legality ${legal.ok ? 'ok' : 'bad'}`}>
              <h3>{legal.ok ? `✓ Legal for ${def.name}` : `✕ Not legal for ${def.name}`}</h3>
              <Bar label="Total motor power" value={legal.totalW} cap={def.builder.totalWatts} />
              {def.builder.driveWatts !== null && <Bar label="Drivetrain power" value={legal.driveW} cap={def.builder.driveWatts} />}
              <p>
                Expanded {legal.maxLength.toFixed(1)}" × {legal.maxWidth.toFixed(1)}" (≤ {def.builder.footprintMax}"), height {legal.maxHeight.toFixed(1)}"
                {def.builder.heightMax ? ` (≤ ${def.builder.heightMax}")` : ' (no limit)'}
              </p>
              <p className="dim">{legal.capacity}</p>
              {legal.airActuations > 0 && <p className="dim">Air: about {legal.airActuations} actuations.</p>}
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
              {!legal.ok && <p className="hint">Illegal robots can still drive in Free Drive.</p>}
            </section>
          </div>
          <div className="robot-head-info">
            <h2>{spec.name || 'My Robot'}</h2>
            <p className="dim">{summary(spec)}</p>
            <div className="stats">
              <Stat label="Top speed" value={Math.round(stats.topSpeedFps * 12)} unit=" in/s" />
              <Stat label="Accel" value={Math.round(stats.accelIps2)} unit=" in/s²" />
              <Stat label="Turn" value={stats.turnRads.toFixed(1)} unit=" rad/s" />
              <Stat label="Turn accel" value={Math.round(stats.turnAccel)} unit=" rad/s²" />
              <Stat label="Mass" value={(stats.massKg * 2.2046).toFixed(1)} unit=" lb" />
              <Stat label="W × L" value={`${spec.chassis.width} × ${spec.chassis.length}`} unit=" in" />
            </div>
            <label className="inline">
              Preview lift <input type="range" min={0} max={1} step={0.01} value={previewLift} onChange={(e) => setPreviewLift(+e.target.value)} />
            </label>
          </div>
        </section>

        <Section title="Start from">
          <div className="start-cards">
            {presetsFor(def.id).map((p) => (
              <button key={p.id} className="start-card" onClick={() => loadInto(p)}>
                <b>{p.name}</b>
                <small>{summary(p)}</small>
              </button>
            ))}
            {saved.map((r) => (
              <div key={r.id} className="start-card saved">
                <button className="link" onClick={() => loadInto(r)}>
                  {thumbs[r.id] ? <img src={thumbs[r.id]} alt="" /> : null}
                  <b>{r.name}</b>
                  <small>{summary(r)}</small>
                </button>
                <button
                  className="x"
                  title={`Delete ${r.name}`}
                  onClick={() => {
                    if (confirm(`Delete saved robot “${r.name}”?`)) setSaved(deleteRobot(def.id, r.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Build" right={<button onClick={saveCopy}>Save this robot</button>}>
          {msg && <p className="hint">{msg}</p>}
          <div className="grid3">
            <Field label="Robot name">
              <input value={spec.name} maxLength={32} onChange={(e) => edit((s) => (s.name = e.target.value))} />
            </Field>
            <Field label="Team name">
              <input value={spec.team?.name ?? ''} maxLength={32} onChange={(e) => edit((s) => (s.team = { name: e.target.value, number: s.team?.number ?? '' }))} />
            </Field>
            <Field label="Team #">
              <input value={spec.team?.number ?? ''} maxLength={8} onChange={(e) => edit((s) => (s.team = { name: s.team?.name ?? '', number: e.target.value.toUpperCase() }))} />
            </Field>
          </div>
        </Section>

        <Section title="Drivetrain">
          <Field label="Type">
            <Segmented
              value={d.type}
              onChange={(v) =>
                edit((s) => {
                  s.drive.type = v as DriveType;
                  if (v === 'xdrive' || v === 'mecanum') {
                    s.drive.wheelsPerSide = 2;
                    const w = s.drive.motorsPerSide[0] ?? 11;
                    s.drive.motorsPerSide = [w, w];
                  }
                  if (v === 'hdrive' && s.drive.strafeMotors.length === 0) s.drive.strafeMotors = [11];
                })
              }
              options={[
                { value: 'tank', label: 'Tank' },
                { value: 'xdrive', label: 'X-drive' },
                { value: 'mecanum', label: 'Mecanum' },
                { value: 'hdrive', label: 'H-drive' },
              ]}
            />
          </Field>
          {tankLike && (
            <Field label="Wheels">
              <Segmented value={d.wheelsPerSide} onChange={(v) => edit((s) => (s.drive.wheelsPerSide = v as 2 | 3 | 4))} options={[2, 3, 4].map((n) => ({ value: n, label: `${n * 2}` }))} />
            </Field>
          )}
          <Field label="Wheel size">
            <Segmented value={d.wheelDia} onChange={(v) => edit((s) => (s.drive.wheelDia = v as WheelSize))} options={[2.75, 3.25, 4].map((n) => ({ value: n, label: `${n}"` }))} />
          </Field>
          {d.type === 'tank' && (
            <Field label="Omni / traction" hint="Front to back. Traction wheels resist pushing but scrub in turns.">
              <div className="row">
                {Array.from({ length: d.wheelsPerSide }, (_, i) => (
                  <button key={i} className={`chip${d.omni[i] ?? true ? ' omni' : ' traction'}`} onClick={() => edit((s) => (s.drive.omni[i] = !(s.drive.omni[i] ?? true)))}>
                    {d.omni[i] ?? true ? 'Omni' : 'Traction'}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Cartridge">
            <Segmented
              value={d.cartridge}
              onChange={(v) => edit((s) => (s.drive.cartridge = v as Cartridge))}
              options={[
                { value: 100, label: '100 rpm' },
                { value: 200, label: '200 rpm' },
                { value: 600, label: '600 rpm' },
              ]}
            />
          </Field>
          <Field label="External ratio" hint={`Wheels spin at ${Math.round(stats.wheelRpm)} rpm`}>
            <Segmented
              small
              value={RATIOS.reduce((b, r) => (Math.abs(r.v - d.ratio) < Math.abs(b.v - d.ratio) ? r : b)).v}
              onChange={(v) => edit((s) => (s.drive.ratio = v))}
              options={RATIOS.map((r) => ({ value: r.v, label: r.label }))}
            />
          </Field>
          <Field label={holo && d.type !== 'hdrive' ? 'Motors (one per wheel)' : 'Motors per side'}>
            <Motors value={d.motorsPerSide} min={holo && d.type !== 'hdrive' ? 2 : 1} max={holo && d.type !== 'hdrive' ? 2 : 4} onChange={(m) => edit((s) => (s.drive.motorsPerSide = m))} />
          </Field>
          {d.type === 'hdrive' && (
            <Field label="Center (strafe) wheel">
              <Motors value={d.strafeMotors} min={1} max={2} onChange={(m) => edit((s) => (s.drive.strafeMotors = m))} />
            </Field>
          )}
        </Section>

        <Section title="Frame">
          <Field label="Length" hint={`Starting size ≤ ${def.builder.startMax}"`}>
            <Slider value={spec.chassis.length} min={10} max={18} step={0.5} format={(v) => `${v}"`} onChange={(v) => edit((s) => (s.chassis.length = v))} />
          </Field>
          <Field label="Width">
            <Slider value={spec.chassis.width} min={10} max={18} step={0.5} format={(v) => `${v}"`} onChange={(v) => edit((s) => (s.chassis.width = v))} />
          </Field>
          <Field label="Starting height">
            <Slider value={spec.chassis.height} min={6} max={18} step={0.5} format={(v) => `${v}"`} onChange={(v) => edit((s) => (s.chassis.height = v))} />
          </Field>
          <Field label="Mass" hint="Estimated from the parts you picked">
            <output className="big-out">{(stats.massKg * 2.2046).toFixed(1)} lb</output>
          </Field>
        </Section>

        <Section title="Intake">
          <OptionCards
            value={spec.intake.type}
            onChange={(v) => edit((s) => (s.intake.type = v as IntakeType))}
            options={[
              { value: 'none', title: 'None', desc: 'Pick pieces up with the claw only.' },
              { value: 'flex', title: 'Flex-wheel roller', desc: 'Pulls one floor piece into the robot.' },
              { value: 'conveyor', title: 'Chain / roller conveyor', desc: 'Stores two pieces and feeds them to the claw.' },
              { value: 'floorclaw', title: 'Floor claw', desc: 'Scoops one piece, including lying pieces.' },
            ]}
          />
          {spec.intake.type !== 'none' && (
            <>
              <Field label="Mount">
                <Segmented
                  value={spec.intake.mount}
                  onChange={(v) => edit((s) => (s.intake.mount = v))}
                  options={[
                    { value: 'front', label: 'Front' },
                    { value: 'back', label: 'Back' },
                    { value: 'both', label: 'Front + back' },
                  ]}
                />
              </Field>
              <Field label="Takes upright pieces">
                <Switch checked={spec.intake.upright} onChange={(v) => edit((s) => (s.intake.upright = v))} />
              </Field>
              <Field label="Takes lying pieces" hint="Righted as they come in: the end pointing away from the robot ends up on top">
                <Switch checked={spec.intake.lying} onChange={(v) => edit((s) => (s.intake.lying = v))} />
              </Field>
              <Field label="Motors">
                <Motors value={spec.intake.motors} max={2} onChange={(m) => edit((s) => (s.intake.motors = m))} />
              </Field>
            </>
          )}
        </Section>

        <Section title="Lift">
          <OptionCards
            value={spec.lift.type}
            onChange={(v) => edit((s) => (s.lift.type = v as LiftType))}
            options={[
              { value: 'none', title: 'None', desc: 'Claw fixed at floor height.' },
              { value: 'arm', title: 'Single arm', desc: 'Fast and simple; the claw swings forward as it rises.' },
              { value: 'fourbar', title: '4-bar', desc: 'Keeps the claw level on an arc.' },
              { value: 'dr4b', title: 'Double reverse 4-bar', desc: 'Straight up, compact when down.' },
              { value: 'sixbar', title: '6-bar', desc: 'Tall vertical reach, a little slower.' },
              { value: 'chainbar', title: 'Chain bar on an arm', desc: 'Reaches out over goals.' },
              { value: 'cascade', title: 'Cascade / linear', desc: 'Very tall, straight up.' },
            ]}
          />
          {spec.lift.type !== 'none' && (
            <>
              <Field label="Max grip height" hint="Height of a held piece's center at full lift">
                <Slider value={spec.lift.maxHeight} min={6} max={def.builder.heightMax ? 46 : 60} step={1} format={(v) => `${v}"`} onChange={(v) => edit((s) => (s.lift.maxHeight = v))} />
              </Field>
              <Field label="Motors">
                <Motors value={spec.lift.motors} onChange={(m) => edit((s) => (s.lift.motors = m))} />
              </Field>
            </>
          )}
        </Section>

        <Section title="End effector">
          <OptionCards
            value={spec.effector.type}
            onChange={(v) => edit((s) => (s.effector.type = v as EffectorType))}
            options={[
              { value: 'claw', title: 'Single claw', desc: 'Holds one Pin or one Cup.' },
              { value: 'dual', title: 'Dual-grip', desc: 'Holds one Pin and one Cup at once.' },
              { value: 'stack', title: 'Stack gripper', desc: 'Carries a whole stack (Pinnacle).', disabled: !def.builder.allowStackGripper, badge: def.builder.allowStackGripper ? undefined : 'Pinnacle only' },
            ]}
          />
          <Field label="Actuation">
            <Segmented
              value={spec.effector.actuation}
              onChange={(v) => edit((s) => (s.effector.actuation = v))}
              options={[
                { value: 'motor', label: 'Motor' },
                { value: 'pneumatic', label: 'Pneumatic' },
              ]}
            />
          </Field>
          <Field label="Wrist flip" hint="Turns a held Cup over, which decides which half hides a Pin">
            <Switch checked={spec.effector.wrist} onChange={(v) => edit((s) => (s.effector.wrist = v))} />
          </Field>
          {spec.effector.actuation === 'motor' && (
            <Field label="Motors">
              <Motors value={spec.effector.motors} max={2} onChange={(m) => edit((s) => (s.effector.motors = m))} />
            </Field>
          )}
        </Section>

        <Section title={def.id === 'override' ? 'Toggle tool' : 'Roller tool'}>
          <OptionCards
            value={spec.tool.type}
            onChange={(v) => edit((s) => (s.tool.type = v as ToolType))}
            options={[
              { value: 'none', title: 'None', desc: 'Push it with the robot (slow, must touch).' },
              { value: 'wedge', title: 'Arm wedge', desc: 'Reaches about 4".' },
              { value: 'spinner', title: 'Spinner wheel', desc: 'Quick, reaches about 3". Needs a motor.' },
              { value: 'flipper', title: 'Pneumatic flipper', desc: 'Fastest, reaches about 6". Uses air.' },
            ]}
          />
          {spec.tool.type === 'spinner' && (
            <Field label="Motors">
              <Motors value={spec.tool.motors} max={1} onChange={(m) => edit((s) => (s.tool.motors = m))} />
            </Field>
          )}
        </Section>

        <Section title="Pneumatics">
          <Field label="Air tanks" hint={def.builder.maxTanks ? `At most ${def.builder.maxTanks}` : `≤ ${def.builder.pneumaticPsi} psi, no compressor`}>
            <Stepper value={spec.pneumatics.tanks} min={0} max={4} onChange={(v) => edit((s) => (s.pneumatics.tanks = v))} />
          </Field>
          <Field label="Cylinders">
            <Stepper value={spec.pneumatics.cylinders} min={0} max={8} onChange={(v) => edit((s) => (s.pneumatics.cylinders = v))} />
          </Field>
        </Section>

        <Section title="Look">
          <Field label="Chassis colour">
            <Swatches value={spec.look?.chassis ?? CHASSIS_COLORS[0]} colors={CHASSIS_COLORS} onChange={(v) => edit((s) => (s.look = { chassis: v ?? CHASSIS_COLORS[0], accent: s.look?.accent ?? null }))} />
          </Field>
          <Field label="Accent (bumpers & plates)">
            <Swatches allowAuto autoLabel="Alliance" value={spec.look?.accent ?? null} colors={ACCENTS} onChange={(v) => edit((s) => (s.look = { chassis: s.look?.chassis ?? CHASSIS_COLORS[0], accent: v }))} />
          </Field>
        </Section>

        <Section title="Driving">
          <Field label="Drive style" hint="Field-centric works on holonomic drives: stick up always moves away from your station">
            <Segmented
              value={settings.fieldCentric ? 'field' : 'robot'}
              onChange={(v) => set('fieldCentric', v === 'field')}
              options={[
                { value: 'robot', label: 'Robot-centric' },
                { value: 'field', label: 'Field-centric', disabled: !holo },
              ]}
            />
          </Field>
          <Field label="Speed cap">
            <Slider value={settings.maxSpeed} min={0.3} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('maxSpeed', v)} />
          </Field>
          <Field label="Goal auto-align" hint="Hold the align button to line the claw up with the nearest goal or piece">
            <Switch checked={settings.assistAlign} onChange={(v) => set('assistAlign', v)} />
          </Field>
          <Field label="Auto lift height" hint="Near a goal the lift rises to drop height; near a loose piece it lowers to grab">
            <Switch checked={settings.assistLift} onChange={(v) => set('assistLift', v)} />
          </Field>
          <Field label="Auto-grab">
            <Switch checked={settings.assistGrab} onChange={(v) => set('assistGrab', v)} />
          </Field>
          <Field label="Auto-place when aligned">
            <Switch checked={settings.assistPlace} onChange={(v) => set('assistPlace', v)} />
          </Field>
          <Field label={def.id === 'override' ? 'Toggle helper' : 'Roller helper'}>
            <Switch checked={settings.assistTool} onChange={(v) => set('assistTool', v)} />
          </Field>
        </Section>

        <Section title="Share">
          <textarea value={io} onChange={(e) => setIo(e.target.value)} placeholder="Paste a ZDRIVE1: robot string" rows={3} />
          <div className="row">
            <button
              onClick={() => {
                const s = exportRobot(spec);
                setIo(s);
                void navigator.clipboard?.writeText(s).then(
                  () => setMsg('Robot string copied to the clipboard.'),
                  () => setMsg('Robot string is in the box above.'),
                );
              }}
            >
              Export
            </button>
            <button
              onClick={() => {
                const r = importRobot(io);
                if (!r.ok) return setMsg(r.error);
                loadInto({ ...r.spec, game: def.id });
              }}
            >
              Import into My Robot
            </button>
          </div>
        </Section>
      </div>

    </div>
  );
}

function Bar({ label, value, cap }: { label: string; value: number; cap: number }) {
  return (
    <div className="bar">
      <span>
        {label}: <b>{value} W</b> / {cap} W
      </span>
      <div className="track">
        <div className={`fill${value > cap ? ' over' : ''}`} style={{ width: `${Math.min(100, (value / cap) * 100)}%` }} />
      </div>
    </div>
  );
}
