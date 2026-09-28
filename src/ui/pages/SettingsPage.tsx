import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ACTIONS, DEFAULT_BINDINGS, conflicts, type Action, type ActionGroup, type Bindings } from '../../shared/input/bindings';
import { captureNext, firstGamepad } from '../../shared/input/input';
import type { DriveMode } from '../../shared/input/mapping';
import { clearAll, exportAll, importAll, usageBytes } from '../../shared/storage';
import type { GameId } from '../../shared/types';
import { Badge, Button, Dialog, Field, KeyGlyph, PadGlyph, Panel, SegmentedControl, Slider, StatRow, Toggle } from '../components';
import { tokenMs } from '../appearance';
import { PageHeader, navigate, type SettingsSection } from '../chrome';
import { downloadJson } from '../download';
import { Icon, type IconName } from '../icons';
import { usePadFamily, useTabSwitch } from '../nav';
import type { CameraMode, Settings } from '../settings';
import { play, say, setAudioLevels } from '../sound';

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string; icon: IconName; desc: string }[] = [
  { id: 'controls', label: 'Controls', icon: 'gamepad', desc: 'Stick layout and key and button bindings' },
  { id: 'driving', label: 'Driving', icon: 'steering', desc: 'Deadzone, sensitivity, speed and drive style' },
  { id: 'assists', label: 'Assists', icon: 'sparkle', desc: 'Guides and automatic helpers' },
  { id: 'graphics', label: 'Graphics', icon: 'monitor', desc: 'View, camera, quality and theme' },
  { id: 'audio', label: 'Audio', icon: 'volume', desc: 'Sounds, voice and menu ticks' },
  { id: 'accessibility', label: 'Accessibility', icon: 'accessibility', desc: 'Scale, motion, colors and HUD' },
  { id: 'data', label: 'Data', icon: 'database', desc: 'Export, import and clear' },
];

type SectionProps = { settings: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; setAll: (s: Settings) => void };

// ---------------------------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------------------------

const GROUPS: ActionGroup[] = ['Driving', 'Mechanisms', 'Human player', 'Match and view'];

function PadLive() {
  const fam = usePadFamily();
  const [s, setS] = useState<{ id: string; axes: number[]; buttons: number[] } | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = firstGamepad();
      setS(p ? { id: p.id, axes: [...p.axes].slice(0, 4), buttons: p.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0) } : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!s)
    return (
      <p className="zd-muted zd-row">
        <Icon name="gamepad" /> No gamepad detected. Connect one and press any button.
      </p>
    );
  const stick = (x: number, y: number, label: string) => (
    <span className="zd-stick" role="img" aria-label={`${label} stick`}>
      <span style={{ left: `${50 + x * 42}%`, top: `${50 + y * 42}%` }} />
    </span>
  );
  return (
    <div className="zd-padlive">
      {stick(s.axes[0] ?? 0, s.axes[1] ?? 0, 'Left')}
      {stick(s.axes[2] ?? 0, s.axes[3] ?? 0, 'Right')}
      <div className="zd-padlive-text">
        <b>Connected</b>
        <span className="zd-muted zd-ellipsis">{s.id}</span>
        <span className="zd-row">{s.buttons.length ? s.buttons.map((b) => <PadGlyph key={b} button={b} family={fam} />) : <span className="zd-muted">Press a button to test it.</span>}</span>
      </div>
    </div>
  );
}

function ControlsSection({ settings, set, setAll }: SectionProps) {
  const fam = usePadFamily();
  const [capturing, setCapturing] = useState<{ action: Action; kind: 'keys' | 'pad' } | null>(null);
  const [note, setNote] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const b = settings.bindings;
  const setBindings = (nb: Bindings) => setAll({ ...settings, bindings: nb });
  const labelOf = (a: Action) => ACTIONS.find((x) => x.id === a)!.label;

  useEffect(() => {
    if (!capturing) return;
    const cancel = captureNext((r) => {
      setCapturing(null);
      if (!r) return;
      if (r.kind !== capturing.kind) {
        setNote(capturing.kind === 'keys' ? 'That was a gamepad button. Press a keyboard key.' : 'That was a key. Press a gamepad button.');
        return;
      }
      const value = r.kind === 'keys' ? r.code : r.button;
      const list = b[r.kind][capturing.action] as (string | number)[];
      if (list.includes(value)) return;
      const clash = conflicts(b, r.kind, value, capturing.action);
      const nb: Bindings = { keys: { ...b.keys }, pad: { ...b.pad } };
      (nb[r.kind] as Record<Action, (string | number)[]>)[capturing.action] = [...list, value];
      setBindings(nb);
      setNote(clash.length ? `Also bound to ${clash.map(labelOf).join(', ')}. Both actions will fire.` : '');
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const remove = (action: Action, kind: 'keys' | 'pad', value: string | number) => {
    const nb: Bindings = { keys: { ...b.keys }, pad: { ...b.pad } };
    (nb[kind] as Record<Action, (string | number)[]>)[action] = (b[kind][action] as (string | number)[]).filter((v) => v !== value);
    setBindings(nb);
  };

  const cell = (action: Action, kind: 'keys' | 'pad') => {
    const list = b[kind][action] as (string | number)[];
    const live = capturing?.action === action && capturing.kind === kind;
    return (
      <div className="zd-binds">
        {list.map((v) => {
          const clash = conflicts(b, kind, v, action);
          return (
            <button
              key={String(v)}
              type="button"
              className={`zd-bind${clash.length ? ' is-conflict' : ''}`}
              aria-label={`Remove this binding from ${labelOf(action)}${clash.length ? `; also used by ${clash.map(labelOf).join(', ')}` : ''}`}
              title={clash.length ? `Also used by ${clash.map(labelOf).join(', ')}` : 'Remove'}
              onClick={() => remove(action, kind, v)}
            >
              {kind === 'keys' ? <KeyGlyph code={v as string} /> : <PadGlyph button={v as number} family={fam} />}
              {clash.length > 0 && <Icon name="warning" size="var(--icon-sm)" />}
              <Icon name="x" size="var(--icon-sm)" className="zd-bind-x" />
            </button>
          );
        })}
        <button type="button" className={`zd-bind is-add${live ? ' is-live' : ''}`} onClick={() => setCapturing(live ? null : { action, kind })} aria-label={`Add a ${kind === 'keys' ? 'key' : 'button'} for ${labelOf(action)}`}>
          {live ? (kind === 'keys' ? 'Press a key (Esc cancels)' : 'Press a button') : <Icon name="plus" size="var(--icon-sm)" />}
        </button>
      </div>
    );
  };

  return (
    <>
      <Panel title="Gamepad sticks">
        <Field label="Drive layout" description="Which sticks drive the robot">
          <SegmentedControl
            label="Drive layout"
            value={settings.driveMode}
            onChange={(v) => set('driveMode', v as DriveMode)}
            options={[
              { value: 'split', label: 'Split arcade' },
              { value: 'arcade', label: 'Arcade' },
              { value: 'tank', label: 'Tank' },
            ]}
          />
        </Field>
        <PadLive />
      </Panel>
      {GROUPS.map((g) => (
        <Panel key={g} title={g} flush>
          <table className="zd-bind-table">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Keyboard</th>
                <th scope="col">Gamepad</th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.filter((a) => a.group === g).map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.label}</th>
                  <td>{cell(a.id, 'keys')}</td>
                  <td>{a.keyboardOnly ? <span className="zd-muted">Sticks</span> : cell(a.id, 'pad')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
      {note && (
        <p className="zd-inline-alert is-warn" role="status">
          <Icon name="warning" />
          <span>{note}</span>
        </p>
      )}
      <div className="zd-row">
        <Button icon="restart" onClick={() => setConfirmReset(true)}>
          Reset to defaults
        </Button>
        <span className="zd-muted">Bindings with a warning icon are shared by two actions.</span>
      </div>
      <Dialog
        open={confirmReset}
        title="Reset all bindings?"
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={() => {
                setBindings(structuredClone(DEFAULT_BINDINGS));
                setConfirmReset(false);
              }}
            >
              Reset bindings
            </Button>
          </>
        }
      >
        Every key and button goes back to its default. Other settings stay as they are.
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Driving, assists, graphics, audio, accessibility
// ---------------------------------------------------------------------------------------------

function DrivingSection({ settings, set }: SectionProps) {
  const ft = Math.floor(settings.driverHeight / 12);
  const inch = Math.round(settings.driverHeight - ft * 12);
  return (
    <>
      <Panel title="Sticks and triggers">
        <Field label="Stick deadzone" description="Stick movement near center that is ignored">
          <Slider label="Stick deadzone" value={settings.deadzone} min={0} max={0.3} step={0.01} scale={100} unit="%" onChange={(v) => set('deadzone', v)} />
        </Field>
        <Field label="Sensitivity curve" description="1.0 is linear; higher gives finer control near center">
          <Slider label="Sensitivity curve" value={settings.curve} min={1} max={3} step={0.1} onChange={(v) => set('curve', v)} />
        </Field>
        <Field label="Trigger threshold" description="How far a trigger travels before it counts as pressed">
          <Slider label="Trigger threshold" value={settings.triggerThreshold} min={0.05} max={0.95} step={0.05} scale={100} unit="%" onChange={(v) => set('triggerThreshold', v)} />
        </Field>
      </Panel>
      <Panel title="Robot">
        <Field label="Speed cap" description="Scales every drive command">
          <Slider label="Speed cap" value={settings.maxSpeed} min={0.3} max={1} step={0.05} scale={100} unit="%" onChange={(v) => set('maxSpeed', v)} />
        </Field>
        <Field label="Keyboard turn speed" description="Turning in place; turning while driving uses 60% of this">
          <Slider label="Keyboard turn speed" value={settings.keyTurn} min={0.3} max={1} step={0.05} scale={100} unit="%" onChange={(v) => set('keyTurn', v)} />
        </Field>
        <Field label="Drive style" description="Field-centric works on X-drive, mecanum and H-drive: stick up always moves away from you">
          <SegmentedControl
            label="Drive style"
            value={settings.fieldCentric ? 'field' : 'robot'}
            onChange={(v) => set('fieldCentric', v === 'field')}
            options={[
              { value: 'robot', label: 'Robot-centric' },
              { value: 'field', label: 'Field-centric' },
            ]}
          />
        </Field>
        <Field label="Your height" description="Sets the eye level of the driver station camera">
          <Slider label="Your height" value={settings.driverHeight} min={48} max={84} step={1} format={() => `${ft}′ ${inch}″ · ${Math.round(settings.driverHeight * 2.54)} cm`} onChange={(v) => set('driverHeight', v)} />
        </Field>
      </Panel>
    </>
  );
}

function AssistsSection({ settings, set }: SectionProps) {
  const row = (k: 'guides' | 'assistAlign' | 'assistLift' | 'assistGrab' | 'assistPlace' | 'assistTool', label: string, desc: string) => (
    <Field label={label} description={desc}>
      <Toggle label={label} checked={settings[k]} onChange={(v) => set(k, v)} />
    </Field>
  );
  return (
    <Panel title="Assists">
      {row('guides', 'Placement guides', 'The Goal rim turns green when releasing now would score; the piece your claw would grab is ringed')}
      {row('assistAlign', 'Goal auto-align', 'Hold the align button to line the claw up with the nearest Goal or piece')}
      {row('assistLift', 'Auto lift height', 'Near a Goal the lift rises to drop height; near a loose piece it lowers to grab')}
      {row('assistGrab', 'Auto-grab', 'Close the claw when a piece is in reach')}
      {row('assistPlace', 'Auto-place', 'Release when a held piece is aligned over a Goal and the robot is stopped')}
      {row('assistTool', 'Toggle and Roller helper', 'Swing the tool when a Toggle or Roller is in reach')}
    </Panel>
  );
}

const CAMERAS: { value: CameraMode; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'driverTrack', label: 'Tracking' },
  { value: 'chase', label: 'Chase' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'audience', label: 'Audience' },
];

function GraphicsSection({ settings, set }: SectionProps) {
  return (
    <>
      <Panel title="View">
        <Field label="Field view" description="M or L3 switches during a match">
          <SegmentedControl
            label="Field view"
            value={settings.view}
            onChange={(v) => set('view', v)}
            options={[
              { value: '3d', label: '3D' },
              { value: '2d', label: '2D top-down' },
            ]}
          />
        </Field>
        <Field label="Starting camera" description="C or R3 cycles during a match. Orbit: drag to rotate, scroll to zoom" stack>
          <SegmentedControl label="Starting camera" value={settings.camera === 'overhead' ? 'driver' : settings.camera} onChange={(v) => set('camera', v)} options={CAMERAS} />
        </Field>
        <Field label="Theme" description="Dark is the default">
          <SegmentedControl
            label="Theme"
            value={settings.theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </Field>
      </Panel>
      <Panel title="Quality">
        <Field label="Preset" description="Auto picks a tier for this device and steps down if a match stays under 40 fps" stack>
          <SegmentedControl
            label="Quality preset"
            value={settings.quality}
            onChange={(v) => set('quality', v)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'ultra', label: 'Ultra' },
            ]}
          />
        </Field>
        <div className="zd-tiers">
          <StatRow label="Low" value="No shadows, reduced resolution" />
          <StatRow label="Medium" value="Shadows, antialiasing, 1.25× resolution" />
          <StatRow label="High" value="Soft shadows, 2× resolution" />
          <StatRow label="Ultra" value="Sharper shadows, 2.5× resolution" />
        </div>
        <Field label="Performance read-out" description="Frame rate, or frame, sim and draw times">
          <SegmentedControl
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
      </Panel>
    </>
  );
}

function AudioSection({ settings, set }: SectionProps) {
  const test = () => setAudioLevels({ master: settings.master, sfx: settings.sfx, voice: settings.voice });
  return (
    <Panel title="Audio">
      <Field label="Mute" description="Silences everything without changing the levels">
        <Toggle label="Mute" checked={settings.muted} onChange={(v) => set('muted', v)} />
      </Field>
      <Field label="Master volume">
        <Slider label="Master volume" value={settings.master} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(v) => set('master', v)} />
      </Field>
      <Field label="Game sounds" description="Match start and end tones, pickups, placements, rule calls">
        <Slider label="Game sounds" value={settings.sfx} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(v) => set('sfx', v)} />
        <Button
          size="sm"
          icon="play"
          onClick={() => {
            test();
            play('start');
          }}
        >
          Test
        </Button>
      </Field>
      <Field label="Voice callouts" description="Autonomous, Driver control, Endgame and time warnings">
        <Slider label="Voice callouts" value={settings.voice} min={0} max={1} step={0.05} scale={100} unit="%" onChange={(v) => set('voice', v)} />
        <Button
          size="sm"
          icon="play"
          onClick={() => {
            test();
            say('Driver control');
          }}
        >
          Test
        </Button>
      </Field>
      <Field label="Menu sounds" description="Quiet ticks when focus moves and when you select">
        <Toggle label="Menu sounds" checked={settings.uiSounds} onChange={(v) => set('uiSounds', v)} />
      </Field>
    </Panel>
  );
}

function AccessibilitySection({ settings, set }: SectionProps) {
  return (
    <Panel title="Accessibility">
      <Field label="Interface scale" description="Scales text and spacing across ZDrive">
        <Slider label="Interface scale" value={settings.uiScale} min={0.9} max={1.3} step={0.05} scale={100} unit="%" onChange={(v) => set('uiScale', v)} />
      </Field>
      <Field label="Motion" description="Reduce cuts movement to simple fades and stops the menu field from orbiting">
        <SegmentedControl
          label="Motion"
          value={settings.motion}
          onChange={(v) => set('motion', v)}
          options={[
            { value: 'system', label: 'System' },
            { value: 'reduce', label: 'Reduce' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </Field>
      <Field label="Colorblind palette" description="Alliance red becomes vermillion, blue becomes sky blue; labels and icons stay">
        <Toggle label="Colorblind palette" checked={settings.palette === 'colorblind'} onChange={(v) => set('palette', v ? 'colorblind' : 'standard')} />
      </Field>
      <Field label="Clean HUD" description="In a match, show only the score bar">
        <Toggle label="Clean HUD" checked={settings.cleanHud} onChange={(v) => set('cleanHud', v)} />
      </Field>
      <Field label="In-match messages" description="Rule calls and Loader messages as toasts">
        <Toggle label="In-match messages" checked={settings.messages} onChange={(v) => set('messages', v)} />
      </Field>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------

function DataSection() {
  const [bytes, setBytes] = useState(() => usageBytes());
  const [pending, setPending] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const exportData = () => downloadJson(`zdrive-data-${new Date().toISOString().slice(0, 10)}.json`, { zdrive: 1, data: exportAll() });
  const read = async (f: File) => {
    setError('');
    try {
      const j = JSON.parse(await f.text()) as { zdrive?: number; data?: Record<string, unknown> };
      if (j.zdrive !== 1 || !j.data || typeof j.data !== 'object' || Object.values(j.data).some((v) => typeof v !== 'string')) throw new Error('bad');
      setPending(j.data as Record<string, string>);
    } catch {
      setError('That file is not a ZDrive data export.');
    }
  };
  return (
    <>
      <Panel title="Stored in this browser">
        <StatRow label="ZDrive data" value={bytes / 1024} decimals={1} unit="KB" />
        <p className="zd-muted">Robots, records, replays and settings live only in this browser. Export them to move to another device.</p>
      </Panel>
      <Panel title="Export and import">
        <Field label="Export all data" description="Downloads one JSON file with everything ZDrive stores">
          <Button icon="download" onClick={exportData}>
            Export
          </Button>
        </Field>
        <Field label="Import data" description="Replaces everything here with an exported file">
          <Button icon="upload" onClick={() => file.current?.click()}>
            Import
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="zd-sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void read(f);
            }}
          />
        </Field>
        {error && (
          <div className="zd-inline-alert" role="alert">
            <Icon name="danger" />
            <span>{error}</span>
            <Button size="sm" onClick={() => file.current?.click()}>
              Choose another file
            </Button>
          </div>
        )}
      </Panel>
      <Panel title="Clear">
        <Field label="Clear all data" description="Removes robots, records, replays and settings from this browser">
          <Button variant="danger" icon="trash" onClick={() => setConfirmClear(true)}>
            Clear data
          </Button>
        </Field>
      </Panel>
      <Dialog
        open={!!pending}
        title="Replace all ZDrive data?"
        onClose={() => setPending(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                const ok = importAll(pending!);
                setPending(null);
                if (!ok) {
                  setError('Storage is full, so part of the file could not be imported.');
                  setBytes(usageBytes());
                  return;
                }
                location.reload();
              }}
            >
              Import and reload
            </Button>
          </>
        }
      >
        Robots, records, replays and settings here are replaced by the file's {pending ? Object.keys(pending).length : 0} items.
      </Dialog>
      <Dialog
        open={confirmClear}
        title="Clear all ZDrive data?"
        onClose={() => setConfirmClear(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={() => {
                clearAll();
                setConfirmClear(false);
                location.reload();
              }}
            >
              Clear data
            </Button>
          </>
        }
      >
        This removes robots, records, replays and settings from this browser. It can't be undone.
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export function SettingsPage({ game, section, settings, setSettings }: { game: GameId; section: SettingsSection; settings: Settings; setSettings: (s: Settings) => void }) {
  const [savedAt, setSavedAt] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    setNow(savedAt);
    const t = setTimeout(() => setNow(0), tokenMs('--dur-saved', 1600));
    return () => clearTimeout(t);
  }, [savedAt]);
  const setAll = (s: Settings) => {
    setSettings(s);
    setSavedAt(Date.now());
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setAll({ ...settings, [k]: v });
  const go = (s: SettingsSection) => navigate(`/${game}/settings/${s}`, { replace: true });
  const idx = SETTINGS_SECTIONS.findIndex((s) => s.id === section);
  useTabSwitch((d) => go(SETTINGS_SECTIONS[(idx + d + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length].id));
  const meta = SETTINGS_SECTIONS[idx];
  const props: SectionProps = { settings, set, setAll };
  const body: Record<SettingsSection, ReactNode> = {
    controls: <ControlsSection {...props} />,
    driving: <DrivingSection {...props} />,
    assists: <AssistsSection {...props} />,
    graphics: <GraphicsSection {...props} />,
    audio: <AudioSection {...props} />,
    accessibility: <AccessibilitySection {...props} />,
    data: <DataSection />,
  };
  return (
    <div className="zd-settings">
      <PageHeader title="Settings" parent={`/${game}`} />
      <div className="zd-settings-body">
        <nav className="zd-settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((s) => (
            <button key={s.id} type="button" className="zd-settings-link" aria-current={s.id === section ? 'page' : undefined} onClick={() => go(s.id)}>
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
        <section className="zd-settings-content" aria-labelledby="zd-settings-title" key={section}>
          <header className="zd-settings-head">
            <div>
              <h2 id="zd-settings-title">{meta.label}</h2>
              <p className="zd-muted">{meta.desc}</p>
            </div>
            <span className={`zd-saved${now ? ' is-on' : ''}`} role="status" aria-live="polite">
              {now ? (
                <Badge tone="ok" icon="check">
                  Saved
                </Badge>
              ) : null}
            </span>
          </header>
          {body[section]}
        </section>
      </div>
    </div>
  );
}
