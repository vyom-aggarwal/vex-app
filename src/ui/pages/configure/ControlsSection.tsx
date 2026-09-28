import { useEffect, useState } from 'react';
import { ACTIONS, DEFAULT_BINDINGS, conflicts, keyLabel, padLabel, type Action, type ActionGroup, type Bindings } from '../../../shared/input/bindings';
import { captureNext, firstGamepad } from '../../../shared/input/input';
import type { DriveMode } from '../../../shared/input/mapping';
import { Field, Section, Segmented, Slider } from '../../components';
import type { Settings } from '../../settings';

const GROUPS: ActionGroup[] = ['Driving', 'Mechanisms', 'Human player', 'Match and view'];

function PadLive() {
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
  if (!s) return <p className="hint">No gamepad detected. Plug one in and press any button.</p>;
  const stick = (x: number, y: number) => (
    <div className="stick">
      <span style={{ left: `${50 + x * 42}%`, top: `${50 + y * 42}%` }} />
    </div>
  );
  return (
    <div className="pad-live">
      <div className="row">
        {stick(s.axes[0] ?? 0, s.axes[1] ?? 0)}
        {stick(s.axes[2] ?? 0, s.axes[3] ?? 0)}
        <div>
          <b>Connected</b>
          <small className="dim"> {s.id.slice(0, 48)}</small>
          <div className="row">{s.buttons.length ? s.buttons.map((b) => <kbd key={b}>{padLabel(b)}</kbd>) : <small className="dim">Press a button…</small>}</div>
        </div>
      </div>
    </div>
  );
}

export function ControlsSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const [capturing, setCapturing] = useState<{ action: Action; kind: 'keys' | 'pad' } | null>(null);
  const [note, setNote] = useState('');
  const b = settings.bindings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const setBindings = (nb: Bindings) => setSettings({ ...settings, bindings: nb });

  useEffect(() => {
    if (!capturing) return;
    const cancel = captureNext((r) => {
      setCapturing(null);
      if (!r) return;
      if (r.kind !== capturing.kind) {
        setNote(capturing.kind === 'keys' ? 'That was a gamepad button; press a keyboard key.' : 'That was a key; press a gamepad button.');
        return;
      }
      const value = r.kind === 'keys' ? r.code : r.button;
      const list = b[r.kind][capturing.action] as (string | number)[];
      if (list.includes(value)) return;
      const clash = conflicts(b, r.kind, value, capturing.action);
      const nb: Bindings = { keys: { ...b.keys }, pad: { ...b.pad } };
      (nb[r.kind] as Record<Action, (string | number)[]>)[capturing.action] = [...list, value];
      setBindings(nb);
      setNote(
        clash.length
          ? `Also bound to: ${clash.map((c) => ACTIONS.find((a) => a.id === c)!.label).join(', ')}. Both will fire.`
          : '',
      );
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
      <div className="binds">
        {list.map((v) => (
          <button key={String(v)} className="bind" title="Remove" onClick={() => remove(action, kind, v)}>
            {kind === 'keys' ? keyLabel(v as string) : padLabel(v as number)}
            <span>×</span>
          </button>
        ))}
        <button className={`bind add${live ? ' live' : ''}`} onClick={() => setCapturing(live ? null : { action, kind })}>
          {live ? (kind === 'keys' ? 'Press a key… (Esc cancels)' : 'Press a button…') : '+'}
        </button>
      </div>
    );
  };

  return (
    <div className="controls-page">
      <Section title="Gamepad sticks">
        <Field label="Drive layout">
          <Segmented
            value={settings.driveMode}
            onChange={(v) => set('driveMode', v as DriveMode)}
            options={[
              { value: 'split', label: 'Split arcade' },
              { value: 'arcade', label: 'Arcade (left stick)' },
              { value: 'tank', label: 'Tank' },
            ]}
          />
        </Field>
        <Field label="Stick deadzone">
          <Slider value={settings.deadzone} min={0} max={0.3} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('deadzone', v)} />
        </Field>
        <Field label="Sensitivity curve" hint="1.0 is linear; higher gives finer control near center">
          <Slider value={settings.curve} min={1} max={3} step={0.1} format={(v) => `${v.toFixed(1)}${v === 1 ? ' · linear' : v >= 3 ? ' · cubic' : ''}`} onChange={(v) => set('curve', v)} />
        </Field>
        <Field label="Trigger threshold">
          <Slider value={settings.triggerThreshold} min={0.05} max={0.95} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('triggerThreshold', v)} />
        </Field>
        <PadLive />
      </Section>

      <Section title="Keyboard driving">
        <Field label="Turn speed" hint="Turning in place; turning while driving uses 60% of this for smoother arcs">
          <Slider value={settings.keyTurn} min={0.3} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('keyTurn', v)} />
        </Field>
      </Section>

      {GROUPS.map((g) => (
        <Section key={g} title={g}>
          <table className="bind-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Keyboard</th>
                <th>Gamepad (V5 names)</th>
              </tr>
            </thead>
            <tbody>
              {ACTIONS.filter((a) => a.group === g).map((a) => (
                <tr key={a.id}>
                  <td>{a.label}</td>
                  <td>{cell(a.id, 'keys')}</td>
                  <td>{a.keyboardOnly ? <small className="dim">Sticks</small> : cell(a.id, 'pad')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
      {note && <p className="warn">{note}</p>}
      <div className="row">
        <button
          onClick={() => {
            if (confirm('Reset all key and button bindings to the defaults?')) setBindings(structuredClone(DEFAULT_BINDINGS));
          }}
        >
          Reset bindings to defaults
        </button>
        <small className="dim">Gamepad names follow the V5 controller: L1/L2 are the left bumper/trigger, R1/R2 the right.</small>
      </div>
    </div>
  );
}
