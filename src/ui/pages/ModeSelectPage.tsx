import { useEffect, useRef, useState } from 'react';
import { derivedStats } from '../../engine/drivetrain';
import { checkLegality } from '../../engine/legality';
import type { GameDefinition, ModeDef } from '../../engine/types';
import { loadRecords } from '../../shared/records';
import type { BotLevel, BotStyle, ModeId } from '../../shared/types';
import { Badge, Button, Card, Field, LinkButton, SegmentedControl, Select, Toggle } from '../components';
import { PageHeader } from '../chrome';
import { Icon } from '../icons';
import { useBack } from '../nav';
import { driveName, loadDraft, loadThumbs, robotSummary } from '../robots';
import type { BotSlot, Settings } from '../settings';

const PRACTICE: ModeId[] = ['free', 'skills', 'solo', 'solocode'];

export function duration(m: ModeDef): string {
  if (m.timing.untimed) return 'Untimed';
  const s = m.timing.autonSec + m.timing.driverSec;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const STYLES: { value: BotStyle; label: string }[] = [
  { value: 'scorer', label: 'Scorer' },
  { value: 'controller', label: 'Toggle / Roller' },
  { value: 'defender', label: 'Defender' },
  { value: 'mixed', label: 'Mixed' },
];

/** Top-down field map with the legal start spots for the chosen alliance (a technical diagram). */
function StartMap({ def, settings, onPick }: { def: GameDefinition; settings: Settings; onPick: (slot: number) => void }) {
  const f = def.field;
  const H = f.size / 2;
  const mode = def.modes.find((m) => !m.solo) ?? def.modes[0];
  const starts = mode.starts.filter((s) => s.alliance === settings.alliance);
  // Your station at the bottom: field +y (red station) is down when you're red.
  const flip = settings.alliance === 'red' ? 1 : -1;
  const X = (x: number) => -x * flip;
  const Y = (y: number) => y * flip;
  const tone = (a: 'red' | 'blue' | null) => (a === 'red' ? 'is-red' : a === 'blue' ? 'is-blue' : 'is-neutral');
  return (
    <svg className="zd-startmap" viewBox={`${-H - 4} ${-H - 4} ${2 * H + 8} ${2 * H + 12}`} role="group" aria-label="Start position">
      <rect x={-H} y={-H} width={2 * H} height={2 * H} className="zd-startmap-field" />
      {f.tape.map((t, i) => (
        <line key={i} x1={X(t.a.x)} y1={Y(t.a.y)} x2={X(t.b.x)} y2={Y(t.b.y)} className={`zd-startmap-tape ${t.color === 'white' ? 'is-white' : tone(t.color as 'red' | 'blue')}`} strokeWidth={t.width} />
      ))}
      {f.goals.map((g) => (
        <circle key={g.id} cx={X(g.x)} cy={Y(g.y)} r={g.width / 2 + 0.5} className={`zd-startmap-goal ${tone(g.owner)}`} />
      ))}
      {f.loaders.map((l) => (
        <rect key={l.id} x={X(l.x) - l.w / 2} y={Y(l.y) - l.d / 2} width={l.w} height={l.d} className={`zd-startmap-loader ${tone(l.alliance)}`} />
      ))}
      {starts.map((s, i) => {
        const cx = s.x + Math.cos((s.th * Math.PI) / 180) * 9;
        const cy = s.y + Math.sin((s.th * Math.PI) / 180) * 9;
        const on = settings.startSlot % starts.length === i;
        return (
          <g
            key={i}
            className={`zd-startmap-spot${on ? ' is-on' : ''}`}
            role="radio"
            aria-checked={on}
            aria-label={`Start position ${i + 1}`}
            tabIndex={0}
            onClick={() => onPick(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(i);
              }
            }}
          >
            <rect x={X(cx) - 9} y={Y(cy) - 9} width={18} height={18} rx={2} />
            <text x={X(cx)} y={Y(cy) + 3.5} fontSize={7}>
              {i + 1}
            </text>
          </g>
        );
      })}
      <text x={0} y={H + 6} fontSize={5} className="zd-startmap-station">
        YOUR DRIVER STATION
      </text>
    </svg>
  );
}

function SlotEditor({ title, slot, onChange }: { title: string; slot: BotSlot; onChange: (s: BotSlot) => void }) {
  return (
    <div className="zd-slot">
      <Field label={title}>
        <SegmentedControl
          size="sm"
          label={`${title} robot`}
          value={slot.kind}
          onChange={(k) => onChange({ ...slot, kind: k })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'dummy', label: 'Still' },
            { value: 'ai', label: 'Bot' },
          ]}
        />
      </Field>
      {slot.kind === 'ai' && (
        <>
          <Field label="Difficulty">
            <SegmentedControl
              size="sm"
              label={`${title} difficulty`}
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
            <Select label={`${title} style`} value={slot.style} onChange={(v) => onChange({ ...slot, style: v })} options={STYLES} />
          </Field>
        </>
      )}
      {slot.kind !== 'none' && (
        <Field label="Drives a copy of My Robot">
          <Toggle label={`${title} drives a copy of My Robot`} checked={slot.mirror} onChange={(v) => onChange({ ...slot, mirror: v })} />
        </Field>
      )}
    </div>
  );
}

/** Mode select: cards per mode; picking one opens the options panel with a single Start button. */
export function ModeSelectPage({
  def,
  settings,
  setSettings,
  initial,
  onLaunch,
}: {
  def: GameDefinition;
  settings: Settings;
  setSettings: (s: Settings) => void;
  initial: ModeId | null;
  onLaunch: (m: ModeId) => void;
}) {
  const [picked, setPicked] = useState<ModeId | null>(initial);
  const robot = loadDraft(def.id);
  const thumb = loadThumbs(def.id)[robot.id];
  const legal = checkLegality(robot, def.builder, def.possession);
  const stats = derivedStats(robot);
  const rec = loadRecords(def.id);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const groups: { title: string; modes: ModeDef[] }[] = [
    { title: 'Practice', modes: def.modes.filter((m) => PRACTICE.includes(m.id)) },
    { title: 'Match', modes: def.modes.filter((m) => !PRACTICE.includes(m.id)) },
  ];
  const locked = (m: ModeDef) => m.id !== 'free' && !legal.ok;
  const mode = def.modes.find((m) => m.id === picked) ?? null;
  // Back closes the panel before leaving the screen.
  useBack(() => setPicked(null), !!mode);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mode) requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }, [mode]);

  const mine = mode?.solo ? 'red' : settings.alliance;
  const theirs = mine === 'red' ? 'blue' : 'red';

  return (
    <div className={`zd-modes${mode ? ' has-panel' : ''}`}>
      <div className="zd-modes-main">
        <PageHeader title="Choose a mode" eyebrow={def.name} parent={`/${def.id}`} />
        {!legal.ok && (
          <div className="zd-inline-alert" role="note">
            <Icon name="danger" />
            <span>
              My Robot isn't legal for {def.name}: {legal.errors[0]} Only Free drive is open until you fix it.
            </span>
            <LinkButton to={`/${def.id}/robot`} size="sm" variant="secondary">
              Fix robot
            </LinkButton>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.title} className="zd-mode-group" aria-label={g.title}>
            <h2 className="zd-label">{g.title}</h2>
            <div className="zd-mode-grid">
              {g.modes.map((m) => {
                const best = rec.best[m.id];
                return (
                  <Card key={m.id} onClick={() => setPicked(m.id)} selected={picked === m.id} disabled={locked(m)} className="zd-mode-card" data-autofocus={m === g.modes[0] && g === groups[0] ? true : undefined}>
                    <span className="zd-mode-card-top">
                      <span className="zd-mode-name">{m.label}</span>
                      <span className="zd-mode-time zd-num">
                        <Icon name="timer" size="var(--icon-sm)" />
                        {duration(m)}
                      </span>
                    </span>
                    <span className="zd-mode-blurb">{m.blurb}</span>
                    <span className="zd-mode-best">
                      {m.id === 'free' ? (
                        <span className="zd-muted">No score kept</span>
                      ) : best ? (
                        <>
                          <span className="zd-muted">Best</span> <b className="zd-num">{best.score}</b>
                        </>
                      ) : (
                        <span className="zd-muted">No best yet</span>
                      )}
                      {locked(m) && <Badge tone="danger" icon="danger">Robot not legal</Badge>}
                    </span>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {mode && (
        <aside ref={panel} className="zd-mode-panel" aria-label={`${mode.label} options`} data-nav-scope="overlay" key={mode.id}>
          <header className="zd-mode-panel-head">
            <div>
              <span className="zd-label">{duration(mode)}</span>
              <h2>{mode.label}</h2>
            </div>
            <Button variant="ghost" size="sm" icon="x" onClick={() => setPicked(null)} aria-label="Close options">
              Close
            </Button>
          </header>
          <div className="zd-mode-panel-body">
            <section className="zd-mode-panel-sec">
              <h3 className="zd-label">Robot</h3>
              <div className="zd-robot-line">
                {thumb ? <img src={thumb} alt="" className="zd-robot-thumb" /> : <span className="zd-robot-thumb is-empty"><Icon name="robot" /></span>}
                <div className="zd-robot-line-text">
                  <b>{robot.name || 'My Robot'}</b>
                  <span className="zd-muted">{driveName(robot)} · {stats.topSpeedFps.toFixed(1)} ft/s</span>
                  <span className="zd-muted">{robotSummary(robot)}</span>
                </div>
                <LinkButton to={`/${def.id}/robot`} size="sm" variant="secondary">
                  Change
                </LinkButton>
              </div>
            </section>
            {!mode.solo && (
              <section className="zd-mode-panel-sec">
                <h3 className="zd-label">Alliance and start</h3>
                <Field label="Alliance">
                  <SegmentedControl
                    label="Alliance"
                    value={settings.alliance}
                    onChange={(v) => set('alliance', v)}
                    options={[
                      { value: 'red', label: 'Red', tone: 'red' },
                      { value: 'blue', label: 'Blue', tone: 'blue' },
                    ]}
                  />
                </Field>
                <StartMap def={def} settings={settings} onPick={(i) => set('startSlot', i)} />
              </section>
            )}
            {!mode.solo && (mode.robots[mine] > 1 || mode.robots[theirs] > 0) && (
              <section className="zd-mode-panel-sec">
                <h3 className="zd-label">Bots</h3>
                {mode.robots[mine] > 1 && <SlotEditor title="Partner" slot={settings.partner} onChange={(s) => set('partner', s)} />}
                {mode.robots[theirs] > 0 && <SlotEditor title={mode.robots[theirs] > 1 ? 'Opponent 1' : 'Opponent'} slot={settings.opponent1} onChange={(s) => set('opponent1', s)} />}
                {mode.robots[theirs] > 1 && <SlotEditor title="Opponent 2" slot={settings.opponent2} onChange={(s) => set('opponent2', s)} />}
              </section>
            )}
            {mode.id !== 'free' && (
              <section className="zd-mode-panel-sec">
                <h3 className="zd-label">Referee</h3>
                <Field label="Automatic referee" description="Calls violations and applies the consequences">
                  <Toggle label="Automatic referee" checked={settings.autoRef} onChange={(v) => set('autoRef', v)} />
                </Field>
                {def.id === 'override' && !mode.solo && (
                  <Field label="Worlds-qualifying AWP" description="7 Pins across 3 Goals instead of 6 across 2">
                    <Toggle label="Worlds-qualifying AWP" checked={settings.worlds} onChange={(v) => set('worlds', v)} />
                  </Field>
                )}
              </section>
            )}
          </div>
          <footer className="zd-mode-panel-foot">
            <Button variant="primary" size="lg" block icon="play" hint={{ action: 'confirm' }} onClick={() => onLaunch(mode.id)} disabled={locked(mode)} data-autofocus>
              Start
            </Button>
          </footer>
        </aside>
      )}
    </div>
  );
}
