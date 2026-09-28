import { useEffect, useMemo, useRef, useState } from 'react';
import { derivedStats } from '../../engine/drivetrain';
import { checkLegality } from '../../engine/legality';
import { liftRate } from '../../engine/mechanism';
import type { GameDefinition } from '../../engine/types';
import { presetsFor } from '../../games/presets';
import type { ZRenderer } from '../../render/renderer';
import { exportRobot, importRobot } from '../../shared/robotCodec';
import type { Cartridge, DriveType, EffectorType, IntakeType, LiftType, MotorW, RobotSpec, ToolType, WheelSize } from '../../shared/types';
import {
  Badge,
  Button,
  ChoiceList,
  Dialog,
  Field,
  Group,
  IconButton,
  Panel,
  ProgressBar,
  SegmentedControl,
  Slider,
  StatRow,
  Stepper,
  Swatches,
  TextInput,
  Toggle,
  useToast,
} from '../components';
import { PageHeader } from '../chrome';
import { attachCanvas, getRenderer } from '../host';
import { Icon } from '../icons';
import { resolveQuality } from '../quality';
import { EFFECTOR_NAME, LIFT_NAME, deleteRobot, driveName, listRobots, loadDraft, loadThumbs, newId, saveDraft, saveThumb, upsertRobot } from '../robots';
import type { Settings } from '../settings';

const RATIOS: { v: number; label: string }[] = [
  { v: 36 / 84, label: '36:84' },
  { v: 0.6, label: '36:60' },
  { v: 0.75, label: '36:48' },
  { v: 1, label: '1:1' },
  { v: 48 / 36, label: '48:36' },
  { v: 60 / 36, label: '60:36' },
];

// Robot paint choices (robot data, not UI colors).
const CHASSIS_COLORS = [0x9aa3ad, 0x5d646d, 0x2b2f36, 0xd9dde2, 0x1f4e79, 0x6b3fa0, 0x2e7d4f, 0xb35c1e];
const ACCENTS = [0xd9303a, 0x2f6fdc, 0xf2c230, 0x2aa36b, 0xe86a1c, 0x8e44ad, 0xffffff, 0x111214];

type Part = 'chassis' | 'drive' | 'intake' | 'lift' | 'effector' | 'tool' | 'pneumatics';

const INTAKE_NAME: Record<IntakeType, string> = { none: 'None', flex: 'Flex-wheel roller', conveyor: 'Conveyor', floorclaw: 'Floor claw' };
const TOOL_NAME: Record<ToolType, string> = { none: 'None', wedge: 'Arm wedge', spinner: 'Spinner wheel', flipper: 'Pneumatic flipper' };
const motorsText = (m: MotorW[]) => (m.length ? `${m.length} × ${m[0]} W` : 'no motors');

/** Motor count and wattage for one mechanism. */
function Motors({ value, onChange, min = 0, max = 4, label }: { value: MotorW[]; onChange: (m: MotorW[]) => void; min?: number; max?: number; label: string }) {
  const w = value[0] ?? 11;
  return (
    <div className="zd-row">
      <Stepper label={label} value={value.length} min={min} max={max} onChange={(n) => onChange(Array(n).fill(w))} unit={(n) => (n === 1 ? 'motor' : 'motors')} />
      <SegmentedControl
        size="sm"
        label={`${label} wattage`}
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

/** Power bar: value against a cap, with the numbers beside it. */
function PowerBar({ label, value, cap }: { label: string; value: number; cap: number }) {
  const over = value > cap;
  return (
    <div className={`zd-power${over ? ' is-over' : ''}`}>
      <div className="zd-power-row">
        <span>{label}</span>
        <span className="zd-num">
          <b>{value}</b> / {cap} W
        </span>
      </div>
      <ProgressBar value={Math.min(1, value / cap)} thick label={`${label}: ${value} of ${cap} watts`} />
    </div>
  );
}

const same = (a: RobotSpec, b: RobotSpec) => JSON.stringify({ ...a, id: '', name: '', game: '' }) === JSON.stringify({ ...b, id: '', name: '', game: '' });

/** Robot builder: turntable preview (left) and configuration groups with a pinned legality panel (right). */
export function RobotPage({ def, settings }: { def: GameDefinition; settings: Settings }) {
  const toast = useToast();
  const [spec, setSpec] = useState<RobotSpec>(() => loadDraft(def.id));
  const [origin, setOrigin] = useState<string | null>(null);
  const [saved, setSaved] = useState<RobotSpec[]>(() => listRobots(def.id));
  const [thumbs, setThumbs] = useState(() => loadThumbs(def.id));
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [previewLift, setPreviewLift] = useState(0);
  const [open, setOpen] = useState<Part | null>('drive');
  const [hover, setHover] = useState<Part | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'load'; robot: RobotSpec } | { kind: 'delete'; robot: RobotSpec } | null>(null);
  const [share, setShare] = useState(false);
  const [io, setIo] = useState('');
  const [ioError, setIoError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const rRef = useRef<ZRenderer | null>(null);
  const legal = useMemo(() => checkLegality(spec, def.builder, def.possession), [spec, def]);
  const stats = useMemo(() => derivedStats(spec), [spec]);
  const presets = useMemo(() => presetsFor(def.id), [def.id]);
  const liftTime = spec.lift.type === 'none' || spec.lift.motors.length === 0 ? null : 1 / liftRate(spec);

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
    let release = () => {};
    void getRenderer(resolveQuality(settings.quality)).then((r) => {
      if (!live || !host.current) return;
      rRef.current = r;
      release = attachCanvas(r, host.current);
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
      release();
    };
  }, [settings.quality]);

  useEffect(() => {
    const show = (r: ZRenderer) => {
      r.showPreview(spec, { footprint: def.builder.footprintMax, height: def.builder.heightMax }, settings.alliance);
      r.setPreview2d(view === '2d');
      r.previewPose(previewLift, 0);
      r.highlightPart(hover);
    };
    if (rRef.current) show(rRef.current);
    else void getRenderer(resolveQuality(settings.quality)).then(show);
    // Refresh My Robot's thumbnail shortly after edits settle.
    const t = setTimeout(() => {
      if (!rRef.current) return;
      rRef.current.highlightPart(null);
      saveThumb(def.id, spec.id, rRef.current.thumbnail(128));
      rRef.current.highlightPart(hover);
      setThumbs(loadThumbs(def.id));
    }, 900);
    return () => clearTimeout(t);
    // Hover is applied separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, def, view, previewLift, settings.alliance, settings.quality]);

  useEffect(() => {
    rRef.current?.highlightPart(hover);
  }, [hover]);

  const isKept = (s: RobotSpec) => saved.some((r) => same(r, s)) || presets.some((p) => same(p, s));

  const loadInto = (r: RobotSpec) => {
    const preset = r.id.startsWith('preset:');
    const next: RobotSpec = { ...structuredClone(r), id: 'draft', game: def.id, name: preset ? `${r.name} copy` : r.name };
    setSpec(next);
    saveDraft(next);
    setOrigin(preset ? null : r.id);
    toast({ tone: 'ok', text: preset ? `Loaded a copy of the ${r.name} preset. Edits change My Robot, not the preset.` : `Loaded “${r.name}”.` });
  };
  const requestLoad = (r: RobotSpec) => (isKept(spec) ? loadInto(r) : setConfirm({ kind: 'load', robot: r }));

  const saveRobot = (asNew: boolean) => {
    const id = !asNew && origin && saved.some((r) => r.id === origin) ? origin : newId();
    const copy: RobotSpec = { ...structuredClone(spec), id };
    setSaved(upsertRobot(copy));
    setOrigin(id);
    if (rRef.current) {
      rRef.current.highlightPart(null);
      saveThumb(def.id, id, rRef.current.thumbnail(128));
    }
    setThumbs(loadThumbs(def.id));
    toast({ tone: 'ok', text: id === origin && !asNew ? `Updated “${copy.name}”.` : `Saved “${copy.name}”.` });
  };

  const rename = (r: RobotSpec, name: string) => {
    const n = name.trim().slice(0, 32);
    setRenaming(null);
    if (!n || n === r.name) return;
    setSaved(upsertRobot({ ...r, name: n }));
    if (origin === r.id) edit((s) => (s.name = n));
  };

  const d = spec.drive;
  const tankLike = d.type === 'tank' || d.type === 'hdrive';
  const holo = d.type !== 'tank' && d.type !== 'hdrive';
  const status = !legal.ok ? 'bad' : legal.warnings.length ? 'warn' : 'ok';
  const hov = (p: Part) => (on: boolean) => setHover(on ? p : hover === p ? null : hover);
  const group = (p: Part) => ({ open: open === p, onToggle: (o: boolean) => setOpen(o ? p : null), onHover: hov(p) });

  return (
    <div className="zd-builder">
      <PageHeader
        title="Robot"
        eyebrow={def.name}
        parent={`/${def.id}`}
        actions={
          <>
            <Button icon="copy" variant="ghost" onClick={() => setShare(true)}>
              Share
            </Button>
            <Button variant="secondary" onClick={() => saveRobot(true)}>
              Save as new
            </Button>
            <Button variant="primary" icon="check" onClick={() => saveRobot(false)}>
              {origin && saved.some((r) => r.id === origin) ? 'Save' : 'Save robot'}
            </Button>
          </>
        }
      />

      <section className="zd-strip" aria-label="Robots">
        <div className="zd-strip-card is-current">
          {thumbs[spec.id] ? <img src={thumbs[spec.id]} alt="" /> : <span className="zd-strip-thumb"><Icon name="robot" /></span>}
          <span className="zd-strip-name">{spec.name || 'My Robot'}</span>
          <Badge tone="accent">Editing</Badge>
        </div>
        {saved.map((r) => (
          <div key={r.id} className="zd-strip-card">
            <button type="button" className="zd-strip-hit" onClick={() => requestLoad(r)} aria-label={`Load ${r.name}`} />
            {thumbs[r.id] ? <img src={thumbs[r.id]} alt="" /> : <span className="zd-strip-thumb"><Icon name="robot" /></span>}
            {renaming === r.id ? (
              <TextInput
                aria-label={`Rename ${r.name}`}
                defaultValue={r.name}
                maxLength={32}
                autoFocus
                className="zd-strip-rename"
                onBlur={(e) => rename(r, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename(r, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    e.preventDefault();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <span className="zd-strip-name">{r.name}</span>
            )}
            <span className="zd-strip-foot">
              <Badge>{def.name}</Badge>
              <span className="zd-strip-actions">
                <IconButton icon="pencil" label={`Rename ${r.name}`} size="sm" onClick={() => setRenaming(r.id)} />
                <IconButton icon="trash" label={`Delete ${r.name}`} size="sm" onClick={() => setConfirm({ kind: 'delete', robot: r })} />
              </span>
            </span>
          </div>
        ))}
        {presets.map((p) => (
          <div key={p.id} className="zd-strip-card is-preset">
            <button type="button" className="zd-strip-hit" onClick={() => requestLoad(p)} aria-label={`Load a copy of the ${p.name} preset`} />
            <span className="zd-strip-thumb">
              <Icon name="layers" />
            </span>
            <span className="zd-strip-name">{p.name}</span>
            <span className="zd-strip-foot">
              <Badge>Preset</Badge>
            </span>
          </div>
        ))}
      </section>

      <div className="zd-builder-grid">
        <div className="zd-builder-left">
          <div className="zd-preview">
            <div className="zd-preview-canvas" ref={host} />
            <div className="zd-preview-top">
              <SegmentedControl
                size="sm"
                label="Preview view"
                value={view}
                onChange={setView}
                options={[
                  { value: '3d', label: '3D' },
                  { value: '2d', label: 'Top' },
                ]}
              />
              <span className="zd-preview-name">{spec.name || 'My Robot'}</span>
            </div>
            <div className="zd-preview-bottom">
              <Slider label="Preview lift" value={previewLift} min={0} max={1} step={0.05} scale={100} unit="%" onChange={setPreviewLift} />
            </div>
          </div>
          <div className="zd-builder-stats" aria-label="Derived stats">
            <StatRow big label="Top speed" value={stats.topSpeedFps} decimals={1} unit="ft/s" />
            <StatRow big label="Push force" value={stats.pushLbf} decimals={0} unit="lbf" />
            <StatRow big label="Turn rate" value={stats.turnDps} decimals={0} unit="°/s" />
            <StatRow big label="Lift time" value={liftTime === null ? '—' : liftTime} decimals={2} unit={liftTime === null ? undefined : 's'} />
            <StatRow big label="Mass" value={stats.massKg * 2.2046} decimals={1} unit="lb" />
            <StatRow big label="Wheel speed" value={stats.wheelRpm} decimals={0} unit="rpm" />
          </div>
        </div>

        <div className="zd-builder-right">
          <div className="zd-config">
            <Group title="Chassis" summary={`${spec.chassis.length} × ${spec.chassis.width} × ${spec.chassis.height} in · ${(stats.massKg * 2.2046).toFixed(1)} lb`} {...group('chassis')}>
              <Field label="Robot name" htmlFor="rb-name">
                <TextInput id="rb-name" value={spec.name} maxLength={32} onChange={(e) => edit((s) => (s.name = e.target.value))} />
              </Field>
              <Field label="Team" description="Name and number on the license plates">
                <TextInput aria-label="Team name" placeholder="Team name" value={spec.team?.name ?? ''} maxLength={32} onChange={(e) => edit((s) => (s.team = { name: e.target.value, number: s.team?.number ?? '' }))} />
                <TextInput
                  aria-label="Team number"
                  placeholder="Number"
                  className="zd-input-short"
                  value={spec.team?.number ?? ''}
                  maxLength={8}
                  onChange={(e) => edit((s) => (s.team = { name: s.team?.name ?? '', number: e.target.value.toUpperCase() }))}
                />
              </Field>
              <Field label="Length" description={`Starting size must be ${def.builder.startMax} in or less`}>
                <Slider label="Length" value={spec.chassis.length} min={10} max={18} step={0.5} unit="in" onChange={(v) => edit((s) => (s.chassis.length = v))} />
              </Field>
              <Field label="Width">
                <Slider label="Width" value={spec.chassis.width} min={10} max={18} step={0.5} unit="in" onChange={(v) => edit((s) => (s.chassis.width = v))} />
              </Field>
              <Field label="Starting height">
                <Slider label="Starting height" value={spec.chassis.height} min={6} max={18} step={0.5} unit="in" onChange={(v) => edit((s) => (s.chassis.height = v))} />
              </Field>
              <Field label="Frame color" stack>
                <Swatches label="Frame color" value={spec.look?.chassis ?? CHASSIS_COLORS[0]} colors={CHASSIS_COLORS} onChange={(v) => edit((s) => (s.look = { chassis: v ?? CHASSIS_COLORS[0], accent: s.look?.accent ?? null }))} />
              </Field>
              <Field label="Bumpers and plates" description="Alliance uses your match alliance color" stack>
                <Swatches label="Bumper color" autoLabel="Alliance" value={spec.look?.accent ?? null} colors={ACCENTS} onChange={(v) => edit((s) => (s.look = { chassis: s.look?.chassis ?? CHASSIS_COLORS[0], accent: v }))} />
              </Field>
            </Group>

            <Group title="Drivetrain" summary={`${driveName(spec)} · ${d.wheelDia} in · ${Math.round(stats.wheelRpm)} rpm · ${motorsText(d.motorsPerSide)} per side`} {...group('drive')}>
              <Field label="Type" stack>
                <SegmentedControl
                  label="Drivetrain type"
                  block
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
                  <SegmentedControl label="Wheel count" value={d.wheelsPerSide} onChange={(v) => edit((s) => (s.drive.wheelsPerSide = v as 2 | 3 | 4))} options={[2, 3, 4].map((n) => ({ value: n, label: `${n * 2}` }))} />
                </Field>
              )}
              <Field label="Wheel size">
                <SegmentedControl label="Wheel size" value={d.wheelDia} onChange={(v) => edit((s) => (s.drive.wheelDia = v as WheelSize))} options={[2.75, 3.25, 4].map((n) => ({ value: n, label: `${n} in` }))} />
              </Field>
              {d.type === 'tank' && (
                <Field label="Omni or traction" description="Front to back. Traction resists pushing but scrubs in turns" stack>
                  <div className="zd-row">
                    {Array.from({ length: d.wheelsPerSide }, (_, i) => (
                      <SegmentedControl
                        key={i}
                        size="sm"
                        label={`Wheel pair ${i + 1}`}
                        value={(d.omni[i] ?? true) ? 'omni' : 'traction'}
                        onChange={(v) => edit((s) => (s.drive.omni[i] = v === 'omni'))}
                        options={[
                          { value: 'omni', label: 'Omni' },
                          { value: 'traction', label: 'Traction' },
                        ]}
                      />
                    ))}
                  </div>
                </Field>
              )}
              <Field label="Cartridge">
                <SegmentedControl
                  label="Cartridge"
                  value={d.cartridge}
                  onChange={(v) => edit((s) => (s.drive.cartridge = v as Cartridge))}
                  options={[
                    { value: 100, label: '100 rpm' },
                    { value: 200, label: '200 rpm' },
                    { value: 600, label: '600 rpm' },
                  ]}
                />
              </Field>
              <Field label="External ratio" description={`Wheels spin at ${Math.round(stats.wheelRpm)} rpm`} stack>
                <SegmentedControl
                  size="sm"
                  label="External ratio"
                  value={RATIOS.reduce((b, r) => (Math.abs(r.v - d.ratio) < Math.abs(b.v - d.ratio) ? r : b)).v}
                  onChange={(v) => edit((s) => (s.drive.ratio = v))}
                  options={RATIOS.map((r) => ({ value: r.v, label: r.label }))}
                />
              </Field>
              <Field label={holo ? 'Motors (one per wheel)' : 'Motors per side'} stack>
                <Motors label="Drive motors" value={d.motorsPerSide} min={holo ? 2 : 1} max={holo ? 2 : 4} onChange={(m) => edit((s) => (s.drive.motorsPerSide = m))} />
              </Field>
              {d.type === 'hdrive' && (
                <Field label="Center wheel" stack>
                  <Motors label="Center wheel motors" value={d.strafeMotors} min={1} max={2} onChange={(m) => edit((s) => (s.drive.strafeMotors = m))} />
                </Field>
              )}
            </Group>

            <Group title="Intake" summary={spec.intake.type === 'none' ? 'None' : `${INTAKE_NAME[spec.intake.type]} · ${spec.intake.mount} · ${motorsText(spec.intake.motors)}`} {...group('intake')}>
              <ChoiceList
                label="Intake type"
                value={spec.intake.type}
                onChange={(v) => edit((s) => (s.intake.type = v as IntakeType))}
                options={[
                  { value: 'none', title: 'None', desc: 'Pick pieces up with the claw only.' },
                  { value: 'flex', title: 'Flex-wheel roller', desc: 'Pulls one floor piece into the robot.' },
                  { value: 'conveyor', title: 'Conveyor', desc: 'Stores two pieces and feeds them to the claw.' },
                  { value: 'floorclaw', title: 'Floor claw', desc: 'Scoops one piece, including lying pieces.' },
                ]}
              />
              {spec.intake.type !== 'none' && (
                <>
                  <Field label="Mount">
                    <SegmentedControl
                      label="Intake mount"
                      value={spec.intake.mount}
                      onChange={(v) => edit((s) => (s.intake.mount = v))}
                      options={[
                        { value: 'front', label: 'Front' },
                        { value: 'back', label: 'Back' },
                        { value: 'both', label: 'Both' },
                      ]}
                    />
                  </Field>
                  <Field label="Takes upright pieces">
                    <Toggle label="Takes upright pieces" checked={spec.intake.upright} onChange={(v) => edit((s) => (s.intake.upright = v))} />
                  </Field>
                  <Field label="Takes lying pieces" description="Righted on the way in: the end pointing away ends up on top">
                    <Toggle label="Takes lying pieces" checked={spec.intake.lying} onChange={(v) => edit((s) => (s.intake.lying = v))} />
                  </Field>
                  <Field label="Motors" stack>
                    <Motors label="Intake motors" value={spec.intake.motors} max={2} onChange={(m) => edit((s) => (s.intake.motors = m))} />
                  </Field>
                </>
              )}
            </Group>

            <Group title="Lift" summary={spec.lift.type === 'none' ? 'None' : `${LIFT_NAME[spec.lift.type]} · ${spec.lift.maxHeight} in · ${motorsText(spec.lift.motors)}`} {...group('lift')}>
              <ChoiceList
                label="Lift type"
                value={spec.lift.type}
                onChange={(v) => edit((s) => (s.lift.type = v as LiftType))}
                options={[
                  { value: 'none', title: 'None', desc: 'Claw fixed at floor height.' },
                  { value: 'arm', title: 'Single arm', desc: 'Fast and simple; the claw swings forward as it rises.' },
                  { value: 'fourbar', title: '4-bar', desc: 'Keeps the claw level on an arc.' },
                  { value: 'dr4b', title: 'Double reverse 4-bar', desc: 'Straight up, compact when down.' },
                  { value: 'sixbar', title: '6-bar', desc: 'Tall vertical reach, a little slower.' },
                  { value: 'chainbar', title: 'Chain bar on an arm', desc: 'Reaches out over Goals.' },
                  { value: 'cascade', title: 'Cascade', desc: 'Very tall, straight up.' },
                ]}
              />
              {spec.lift.type !== 'none' && (
                <>
                  <Field label="Max grip height" description="Height of a held piece's center at full lift">
                    <Slider label="Max grip height" value={spec.lift.maxHeight} min={6} max={def.builder.heightMax ? 46 : 60} step={1} unit="in" onChange={(v) => edit((s) => (s.lift.maxHeight = v))} />
                  </Field>
                  <Field label="Motors" stack>
                    <Motors label="Lift motors" value={spec.lift.motors} onChange={(m) => edit((s) => (s.lift.motors = m))} />
                  </Field>
                </>
              )}
            </Group>

            <Group title="End effector" summary={`${EFFECTOR_NAME[spec.effector.type]} · ${spec.effector.actuation}${spec.effector.wrist ? ' · wrist' : ''}`} {...group('effector')}>
              <ChoiceList
                label="End effector type"
                value={spec.effector.type}
                onChange={(v) => edit((s) => (s.effector.type = v as EffectorType))}
                options={[
                  { value: 'claw', title: 'Single claw', desc: 'Holds one Pin or one Cup.' },
                  { value: 'dual', title: 'Dual grip', desc: 'Holds one Pin and one Cup at once.' },
                  { value: 'stack', title: 'Stack gripper', desc: 'Carries a whole stack.', disabled: !def.builder.allowStackGripper, badge: def.builder.allowStackGripper ? undefined : 'Pinnacle only' },
                ]}
              />
              <Field label="Actuation">
                <SegmentedControl
                  label="Actuation"
                  value={spec.effector.actuation}
                  onChange={(v) => edit((s) => (s.effector.actuation = v))}
                  options={[
                    { value: 'motor', label: 'Motor' },
                    { value: 'pneumatic', label: 'Pneumatic' },
                  ]}
                />
              </Field>
              <Field label="Wrist flip" description="Turns a held Cup over, which decides which half hides a Pin">
                <Toggle label="Wrist flip" checked={spec.effector.wrist} onChange={(v) => edit((s) => (s.effector.wrist = v))} />
              </Field>
              {spec.effector.actuation === 'motor' && (
                <Field label="Motors" stack>
                  <Motors label="End effector motors" value={spec.effector.motors} max={2} onChange={(m) => edit((s) => (s.effector.motors = m))} />
                </Field>
              )}
            </Group>

            <Group title="Tools" summary={`${def.id === 'override' ? 'Toggle' : 'Roller'} tool: ${TOOL_NAME[spec.tool.type]}`} {...group('tool')}>
              <ChoiceList
                label={def.id === 'override' ? 'Toggle tool' : 'Roller tool'}
                value={spec.tool.type}
                onChange={(v) => edit((s) => (s.tool.type = v as ToolType))}
                options={[
                  { value: 'none', title: 'None', desc: 'Push it with the robot (slow, must touch).' },
                  { value: 'wedge', title: 'Arm wedge', desc: 'Reaches about 4 in.' },
                  { value: 'spinner', title: 'Spinner wheel', desc: 'Quick, reaches about 3 in. Needs a motor.' },
                  { value: 'flipper', title: 'Pneumatic flipper', desc: 'Fastest, reaches about 6 in. Uses air.' },
                ]}
              />
              {spec.tool.type === 'spinner' && (
                <Field label="Motors" stack>
                  <Motors label="Tool motors" value={spec.tool.motors} max={1} onChange={(m) => edit((s) => (s.tool.motors = m))} />
                </Field>
              )}
            </Group>

            <Group title="Pneumatics" summary={`${spec.pneumatics.tanks} tank${spec.pneumatics.tanks === 1 ? '' : 's'} · ${spec.pneumatics.cylinders} cylinder${spec.pneumatics.cylinders === 1 ? '' : 's'}`} {...group('pneumatics')}>
              <Field label="Air tanks" description={def.builder.maxTanks ? `At most ${def.builder.maxTanks}` : `${def.builder.pneumaticPsi} psi or less, no compressor`}>
                <Stepper label="Air tanks" value={spec.pneumatics.tanks} min={0} max={4} onChange={(v) => edit((s) => (s.pneumatics.tanks = v))} />
              </Field>
              <Field label="Cylinders">
                <Stepper label="Cylinders" value={spec.pneumatics.cylinders} min={0} max={8} onChange={(v) => edit((s) => (s.pneumatics.cylinders = v))} />
              </Field>
            </Group>
          </div>

          <section className={`zd-legality is-${status}`} aria-labelledby="zd-legal-title" aria-live="polite">
            <header className="zd-legality-head">
              <Icon name={status === 'ok' ? 'checkCircle' : status === 'warn' ? 'warning' : 'danger'} />
              <h2 id="zd-legal-title">{status === 'bad' ? `Not legal for ${def.name}` : status === 'warn' ? `Legal for ${def.name}, with warnings` : `Legal for ${def.name}`}</h2>
            </header>
            {def.builder.driveWatts !== null && <PowerBar label="Drivetrain" value={legal.driveW} cap={def.builder.driveWatts} />}
            <PowerBar label="All motors" value={legal.totalW} cap={def.builder.totalWatts} />
            <div className="zd-legality-facts">
              <StatRow label="Expanded size" value={`${legal.maxLength.toFixed(1)} × ${legal.maxWidth.toFixed(1)}`} unit={`in (max ${def.builder.footprintMax})`} tween={false} />
              <StatRow label="Raised height" value={legal.maxHeight.toFixed(1)} unit={def.builder.heightMax ? `in (max ${def.builder.heightMax})` : 'in (no limit)'} tween={false} />
              {legal.airActuations > 0 && <StatRow label="Air" value={legal.airActuations} unit="actuations" tween={false} />}
            </div>
            <p className="zd-legality-cap">{legal.capacity}</p>
            {(legal.errors.length > 0 || legal.warnings.length > 0) && (
              <ul className="zd-legality-list">
                {legal.errors.map((e) => (
                  <li key={e} className="is-bad">
                    <Icon name="danger" size="var(--icon-sm)" />
                    <span>{e}</span>
                  </li>
                ))}
                {legal.warnings.map((w) => (
                  <li key={w} className="is-warn">
                    <Icon name="warning" size="var(--icon-sm)" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {!legal.ok && <p className="zd-muted">Illegal robots can still drive in Free drive.</p>}
          </section>
        </div>
      </div>

      <Dialog
        open={confirm?.kind === 'load'}
        title="Replace My Robot?"
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                saveRobot(true);
                if (confirm) loadInto(confirm.robot);
                setConfirm(null);
              }}
            >
              Save, then load
            </Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                if (confirm) loadInto(confirm.robot);
                setConfirm(null);
              }}
            >
              Replace
            </Button>
          </>
        }
      >
        {spec.name || 'My Robot'} has changes that aren't saved. Loading {confirm?.robot.name} replaces them.
      </Dialog>
      <Dialog
        open={confirm?.kind === 'delete'}
        title={`Delete “${confirm?.robot.name ?? ''}”?`}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={() => {
                if (confirm) {
                  setSaved(deleteRobot(def.id, confirm.robot.id));
                  if (origin === confirm.robot.id) setOrigin(null);
                }
                setConfirm(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        The saved robot is removed from this browser. My Robot is not affected.
      </Dialog>
      <Dialog
        open={share}
        title="Share a robot"
        wide
        onClose={() => {
          setShare(false);
          setIoError('');
        }}
      >
        <div className="zd-share">
          <Field label="Export My Robot" description="A ZDRIVE1 string anyone can import" stack>
            <div className="zd-row">
              <Button
                icon="copy"
                onClick={() => {
                  const s = exportRobot(spec);
                  setIo(s);
                  void navigator.clipboard?.writeText(s).then(
                    () => toast({ tone: 'ok', text: 'Robot string copied.' }),
                    () => toast({ text: 'Robot string is in the box below.' }),
                  );
                }}
              >
                Copy robot string
              </Button>
            </div>
          </Field>
          <Field label="Import" description="Paste a ZDRIVE1 string; it loads into My Robot" stack>
            <textarea className="zd-input" rows={3} value={io} onChange={(e) => setIo(e.target.value)} placeholder="ZDRIVE1:…" aria-label="Robot string" />
          </Field>
          {ioError && (
            <div className="zd-inline-alert" role="alert">
              <Icon name="danger" />
              <span>{ioError}</span>
            </div>
          )}
          <div className="zd-dialog-actions">
            <Button
              variant="primary"
              icon="upload"
              disabled={!io.trim()}
              onClick={() => {
                const r = importRobot(io);
                if (!r.ok) return setIoError(`${r.error} Check that the whole string was pasted.`);
                setIoError('');
                setShare(false);
                loadInto({ ...r.spec, id: newId(), game: def.id });
              }}
            >
              Import into My Robot
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

