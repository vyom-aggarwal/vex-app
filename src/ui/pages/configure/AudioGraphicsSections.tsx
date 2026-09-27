import { Field, Section, Segmented, Slider, Switch } from '../../components';
import type { CameraMode, Settings } from '../../settings';
import { play, say, setAudioLevels } from '../../sound';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function AudioSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const test = (s: Settings) => setAudioLevels({ master: s.master, sfx: s.sfx, voice: s.voice });
  return (
    <div>
      <Section title="Audio">
        <Field label="Master">
          <Slider value={settings.master} min={0} max={1} step={0.05} format={pct} onChange={(v) => set('master', v)} />
        </Field>
        <Field label="Game sounds" hint="Buzzers, pickups, placements, rule-call whistle">
          <div className="row">
            <Slider value={settings.sfx} min={0} max={1} step={0.05} format={pct} onChange={(v) => set('sfx', v)} />
            <button
              onClick={() => {
                test(settings);
                play('start');
              }}
            >
              Test
            </button>
          </div>
        </Field>
        <Field label="Voice callouts" hint="Autonomous, Driver Control, Endgame, time warnings">
          <div className="row">
            <Slider value={settings.voice} min={0} max={1} step={0.05} format={pct} onChange={(v) => set('voice', v)} />
            <button
              onClick={() => {
                test(settings);
                say('Driver control');
              }}
            >
              Test
            </button>
          </div>
        </Field>
      </Section>
      <Section title="Visual">
        <Field label="Theme">
          <Segmented
            value={settings.theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Field label="In-match messages" hint="Rule calls and loader messages as toasts">
          <Switch checked={settings.messages} onChange={(v) => set('messages', v)} />
        </Field>
        <Field label="Performance read-out">
          <Segmented
            value={settings.perf}
            onChange={(v) => set('perf', v)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'simple', label: 'Simple', title: 'Frame rate' },
              { value: 'detailed', label: 'Detailed', title: 'Frame, sim and draw times, draw calls, triangles' },
            ]}
          />
        </Field>
      </Section>
    </div>
  );
}

const CAMERAS: { value: CameraMode; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'driverTrack', label: 'Driver (tracking)' },
  { value: 'chase', label: 'Chase' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'audience', label: 'Audience' },
];

export function GraphicsSection({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const ft = Math.floor(settings.driverHeight / 12);
  const inch = Math.round(settings.driverHeight - ft * 12);
  return (
    <div>
      <Section title="View">
        <Field label="Field view" hint="M (or L3) switches in a match">
          <Segmented
            value={settings.view}
            onChange={(v) => set('view', v)}
            options={[
              { value: '3d', label: '3D' },
              { value: '2d', label: '2D top-down' },
            ]}
          />
        </Field>
        <Field label="Camera" hint="C (or R3) cycles in a match. Orbit: drag to rotate, scroll to zoom">
          <Segmented value={settings.camera === 'overhead' ? 'driver' : settings.camera} onChange={(v) => set('camera', v)} options={CAMERAS} />
        </Field>
        <Field label="Your height" hint="Used by the driver-station camera">
          <Slider value={settings.driverHeight} min={48} max={84} step={1} format={() => `${ft}′${inch}″ · ${Math.round(settings.driverHeight * 2.54)} cm`} onChange={(v) => set('driverHeight', v)} />
        </Field>
      </Section>
      <Section title="Quality">
        <Field label="Preset" hint="Auto starts at a tier that suits this device and steps down if a match keeps dropping under 40 fps">
          <Segmented
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
        <ul className="hint tiers">
          <li>Low: no shadows or antialiasing, reduced resolution.</li>
          <li>Medium: shadows, antialiasing, up to 1.25× resolution.</li>
          <li>High: soft shadows, up to 2× resolution.</li>
          <li>Ultra: sharper shadows, up to 2.5× resolution.</li>
        </ul>
      </Section>
    </div>
  );
}
