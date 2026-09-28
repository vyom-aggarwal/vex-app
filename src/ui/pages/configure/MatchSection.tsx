import type { GameDefinition } from '../../../engine/types';
import type { BotLevel, BotStyle } from '../../../shared/types';
import { Field, Section, Segmented, Switch } from '../../formLegacy';
import type { BotSlot, Settings } from '../../settings';

const STYLES: { value: BotStyle; label: string }[] = [
  { value: 'scorer', label: 'Scorer' },
  { value: 'controller', label: 'Toggle / Roller' },
  { value: 'defender', label: 'Defender' },
  { value: 'mixed', label: 'Mixed' },
];

/** Top-down field map with the legal start spots for the chosen alliance. */
function StartMap({ def, settings, onPick }: { def: GameDefinition; settings: Settings; onPick: (slot: number) => void }) {
  const f = def.field;
  const H = f.size / 2;
  const mode = def.modes.find((m) => !m.solo) ?? def.modes[0];
  const starts = mode.starts.filter((s) => s.alliance === settings.alliance);
  // SVG: x right, y down; field +y (red station) at the bottom when you're red, at the top when blue.
  const flip = settings.alliance === 'red' ? 1 : -1;
  const X = (x: number) => -x * flip * 1;
  const Y = (y: number) => y * flip;
  const color = (a: 'red' | 'blue' | null) => (a === 'red' ? 'var(--red)' : a === 'blue' ? 'var(--blue)' : 'var(--dim)');
  return (
    <svg className="start-map" viewBox={`${-H - 4} ${-H - 4} ${2 * H + 8} ${2 * H + 8}`} role="img" aria-label="Start positions">
      <rect x={-H} y={-H} width={2 * H} height={2 * H} className="tiles" />
      {f.tape.map((t, i) => (
        <line key={i} x1={X(t.a.x)} y1={Y(t.a.y)} x2={X(t.b.x)} y2={Y(t.b.y)} stroke={t.color === 'white' ? '#cfd6de' : color(t.color as 'red' | 'blue')} strokeWidth={t.width} opacity={0.8} />
      ))}
      {f.goals.map((g) => (
        <circle key={g.id} cx={X(g.x)} cy={Y(g.y)} r={g.width / 2 + 0.5} fill={color(g.owner)} opacity={g.owner ? 0.9 : 0.55} />
      ))}
      {f.loaders.map((l) => (
        <rect key={l.id} x={X(l.x) - l.w / 2} y={Y(l.y) - l.d / 2} width={l.w} height={l.d} fill={color(l.alliance)} />
      ))}
      {starts.map((s, i) => {
        const cx = s.x + Math.cos((s.th * Math.PI) / 180) * 9;
        const cy = s.y + Math.sin((s.th * Math.PI) / 180) * 9;
        const on = settings.startSlot % starts.length === i;
        return (
          <g key={i} className={`spot${on ? ' on' : ''}`} onClick={() => onPick(i)} role="button" aria-label={`Start position ${i + 1}`}>
            <rect x={X(cx) - 9} y={Y(cy) - 9} width={18} height={18} rx={2} />
            <text x={X(cx)} y={Y(cy) + 3.5}>{i + 1}</text>
          </g>
        );
      })}
      <text x={0} y={H + 3.2} className="station">
        Your driver station
      </text>
    </svg>
  );
}

function SlotEditor({ title, slot, onChange }: { title: string; slot: BotSlot; onChange: (s: BotSlot) => void }) {
  return (
    <div className="slot">
      <div className="slot-head">
        <b>{title}</b>
        <Segmented
          small
          value={slot.kind}
          onChange={(k) => onChange({ ...slot, kind: k })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'dummy', label: 'Dummy' },
            { value: 'ai', label: 'AI' },
          ]}
        />
      </div>
      {slot.kind === 'ai' && (
        <>
          <Field label="Level">
            <Segmented
              small
              value={slot.level}
              onChange={(l) => onChange({ ...slot, level: l as BotLevel })}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'normal', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
          </Field>
          <Field label="Style">
            <Segmented small value={slot.style} onChange={(v) => onChange({ ...slot, style: v as BotStyle })} options={STYLES} />
          </Field>
        </>
      )}
      {slot.kind !== 'none' && (
        <Field label="Drives a copy of My Robot">
          <Switch checked={slot.mirror} onChange={(v) => onChange({ ...slot, mirror: v })} />
        </Field>
      )}
    </div>
  );
}

export function MatchSection({ def, settings, setSettings }: { def: GameDefinition; settings: Settings; setSettings: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  return (
    <div className="match-page">
      <Section title="Match setup">
        <Field label="Alliance">
          <Segmented
            value={settings.alliance}
            onChange={(v) => set('alliance', v)}
            options={[
              { value: 'red', label: <span className="red">Red</span> },
              { value: 'blue', label: <span className="blue">Blue</span> },
            ]}
          />
        </Field>
        <Field label="Start position" hint="Legal starting spots for your alliance (solo modes use the red station)">
          <StartMap def={def} settings={settings} onPick={(i) => set('startSlot', i)} />
        </Field>
        <p className="ok-line">✓ Legal setup: {def.id === 'override' ? 'touching the perimeter on your side of the Autonomous Line, one robot per Quadrant' : 'touching one of your alliance Loaders'}.</p>
      </Section>
      <Section title="Robots">
        <div className="slots">
          <SlotEditor title="Partner" slot={settings.partner} onChange={(s) => set('partner', s)} />
          <SlotEditor title="Opponent 1" slot={settings.opponent1} onChange={(s) => set('opponent1', s)} />
          <SlotEditor title="Opponent 2" slot={settings.opponent2} onChange={(s) => set('opponent2', s)} />
        </div>
        <p className="hint">Match 2v2 uses all three slots; 1v1 uses Opponent 1. Empty slots leave the field open.</p>
      </Section>
      <Section title="Referee">
        <Field label="Automatic referee" hint="Calls violations with toasts and applies the consequences">
          <Switch checked={settings.autoRef} onChange={(v) => set('autoRef', v)} />
        </Field>
        {def.id === 'override' && (
          <Field label="Worlds-qualifying AWP" hint="7 Pins across 3 Goals instead of 6 across 2">
            <Switch checked={settings.worlds} onChange={(v) => set('worlds', v)} />
          </Field>
        )}
      </Section>
    </div>
  );
}
