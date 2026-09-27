import { CONTROLS } from '../shared/input/input';
import type { Curve, DriveMode } from '../shared/input/mapping';
import type { CameraMode, Quality, Settings } from './settings';

const CAMERAS: { id: CameraMode; label: string }[] = [
  { id: 'driver', label: 'Driver Station' },
  { id: 'driverTrack', label: 'Driver Station (tracking)' },
  { id: 'chase', label: 'Chase' },
  { id: 'overhead', label: 'Overhead 2D' },
  { id: 'audience', label: 'Audience' },
];

export function SettingsPanel({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const check = (k: keyof Settings, label: string, hint?: string) => (
    <label className="check">
      <input type="checkbox" checked={settings[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} />
      {label}
      {hint && <small>{hint}</small>}
    </label>
  );
  return (
    <div className="settings">
      <section>
        <h2>Driving</h2>
        <label>
          Drive mode
          <select value={settings.driveMode} onChange={(e) => set('driveMode', e.target.value as DriveMode)}>
            <option value="split">Split arcade (left stick drive, right stick turn)</option>
            <option value="arcade">Arcade (left stick)</option>
            <option value="tank">Tank (two sticks)</option>
          </select>
        </label>
        <label>
          Stick deadzone <b>{settings.deadzone.toFixed(2)}</b>
          <input type="range" min={0} max={0.3} step={0.01} value={settings.deadzone} onChange={(e) => set('deadzone', +e.target.value)} />
        </label>
        <label>
          Response curve
          <select value={settings.curve} onChange={(e) => set('curve', e.target.value as Curve)}>
            <option value="linear">Linear</option>
            <option value="cubic">Cubic (fine control near center)</option>
          </select>
        </label>
        <label>
          Max speed <b>{Math.round(settings.maxSpeed * 100)}%</b>
          <input type="range" min={0.3} max={1} step={0.05} value={settings.maxSpeed} onChange={(e) => set('maxSpeed', +e.target.value)} />
        </label>
        {check('fieldCentric', 'Field-centric drive', 'Holonomic drives: stick up always moves away from your station')}
      </section>
      <section>
        <h2>Driver assists</h2>
        {check('assistAlign', 'Goal auto-align', 'Hold V / D-pad down to line the claw up with the nearest goal or piece')}
        {check('assistGrab', 'Auto-grab', 'Close the grip when a piece is in reach')}
        {check('assistPlace', 'Auto-place when aligned', 'Release over a goal opening at the right height')}
        {check('assistTool', 'Toggle / roller helper', 'Use the tool automatically near a toggle or roller')}
      </section>
      <section>
        <h2>View &amp; referee</h2>
        <label>
          Graphics
          <select value={settings.quality} onChange={(e) => set('quality', e.target.value as Quality)}>
            <option value="low">Low (no shadows, no antialiasing)</option>
            <option value="medium">Medium</option>
            <option value="high">High (soft shadows, full resolution)</option>
          </select>
        </label>
        <label>
          Starting camera
          <select value={settings.camera} onChange={(e) => set('camera', e.target.value as CameraMode)}>
            {CAMERAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {check('autoRef', 'Automatic referee', 'Call violations and apply consequences')}
        {check('showToasts', 'Show rule-call toasts')}
        {check('worlds', 'Override: Worlds-qualifying AWP thresholds (7 Pins, 3 Goals)')}
      </section>
      <section className="wide">
        <h2>Controls</h2>
        <table className="controls">
          <thead>
            <tr>
              <th>Action</th>
              <th>Keyboard</th>
              <th>Gamepad (V5 layout)</th>
            </tr>
          </thead>
          <tbody>
            {CONTROLS.map((c) => (
              <tr key={c.action}>
                <td>{c.action}</td>
                <td>
                  <kbd>{c.keys}</kbd>
                </td>
                <td>{c.pad}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Gamepad: L1/L2 are the left bumper/trigger, R1/R2 the right bumper/trigger, like a V5 controller.</p>
      </section>
    </div>
  );
}
