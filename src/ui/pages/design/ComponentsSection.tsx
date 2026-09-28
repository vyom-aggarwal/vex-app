import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  Divider,
  EmptyState,
  Field,
  Group,
  IconButton,
  KeyHint,
  Panel,
  ProgressBar,
  RadioGroup,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Spinner,
  StatRow,
  Tabs,
  TextInput,
  ToastCard,
  Toggle,
  Tooltip,
  useToast,
  type ButtonVariant,
  type HintAction,
} from '../../components';

/** Style guide: every component in every state. Forced hover/pressed/focus use the .is-* classes. */

const STATES = ['default', 'hover', 'pressed', 'focus', 'disabled', 'loading'] as const;
const stateClass = (s: (typeof STATES)[number]) => (s === 'hover' ? 'is-hover' : s === 'pressed' ? 'is-press' : s === 'focus' ? 'is-focus' : undefined);

function Demo({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="dg-block">
      <h3 className="zd-label">{title}</h3>
      {note && <p className="dg-note">{note}</p>}
      <div className="dg-surface">{children}</div>
    </div>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dg-state">
      {children}
      <code>{label}</code>
    </div>
  );
}

export function ComponentsSection() {
  const toast = useToast();
  const [seg, setSeg] = useState<'override' | 'pinnacle'>('override');
  const [drive, setDrive] = useState<'split' | 'arcade' | 'tank'>('split');
  const [alliance, setAlliance] = useState<'red' | 'blue'>('red');
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [tab2, setTab2] = useState<'controls' | 'driving' | 'assists'>('controls');
  const [on, setOn] = useState(true);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [pct, setPct] = useState(0.35);
  const [inch, setInch] = useState(68);
  const [sel, setSel] = useState('driver');
  const [chip, setChip] = useState(true);
  const [chips, setChips] = useState(['Pin', 'Cup', 'Toggle']);
  const [dialog, setDialog] = useState(false);
  const [stat, setStat] = useState(4.6);
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState(1);

  return (
    <>
      <section className="dg-section" aria-labelledby="dg-buttons">
        <h2 id="dg-buttons" className="dg-h">
          Buttons
        </h2>
        {(['primary', 'secondary', 'ghost', 'danger'] as ButtonVariant[]).map((v) => (
          <Demo key={v} title={`Button · ${v}`}>
            <div className="dg-states">
              {STATES.map((s) => (
                <State key={s} label={s}>
                  <Button variant={v} className={stateClass(s)} disabled={s === 'disabled'} loading={s === 'loading'} icon={v === 'primary' ? 'play' : v === 'danger' ? 'trash' : undefined}>
                    {v === 'danger' ? 'Delete' : v === 'primary' ? 'Play' : 'Build robot'}
                  </Button>
                </State>
              ))}
            </div>
          </Demo>
        ))}
        <Demo title="Sizes, key hints, loading" note="Hints follow the last input device: keyboard, Xbox or PlayStation.">
          <div className="dg-row">
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary">Medium</Button>
            <Button variant="primary" size="lg" hint={{ action: 'confirm' }}>
              Large with hint
            </Button>
            <Button variant="secondary" hint={{ action: 'back' }} icon="chevronLeft">
              Back
            </Button>
            <Button
              variant="secondary"
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1500);
              }}
            >
              Save (spinner after 300 ms)
            </Button>
          </div>
        </Demo>
        <Demo title="IconButton" note="Icon-only buttons always carry an aria-label.">
          <div className="dg-states">
            {STATES.filter((s) => s !== 'loading').map((s) => (
              <State key={s} label={s}>
                <div className="dg-row">
                  <IconButton icon="settings" label="Settings" className={stateClass(s)} disabled={s === 'disabled'} />
                  <IconButton icon="volume" label="Mute" variant="secondary" className={stateClass(s)} disabled={s === 'disabled'} />
                  <IconButton icon="x" label="Close" size="sm" className={stateClass(s)} disabled={s === 'disabled'} />
                </div>
              </State>
            ))}
            <State label="pressed (toggle)">
              <IconButton icon="eyeOff" label="Clean HUD" pressed />
            </State>
          </div>
        </Demo>
      </section>

      <section className="dg-section" aria-labelledby="dg-selection">
        <h2 id="dg-selection" className="dg-h">
          Selection
        </h2>
        <Demo title="SegmentedControl" note="Arrow keys or D-pad move the selection. Alliance tones are for alliance pickers only.">
          <div className="dg-states">
            <State label="default">
              <SegmentedControl label="Game" value={seg} onChange={setSeg} options={[{ value: 'override', label: 'Override' }, { value: 'pinnacle', label: 'Pinnacle' }]} />
            </State>
            <State label="small, disabled option">
              <SegmentedControl
                size="sm"
                label="Drive"
                value={drive}
                onChange={setDrive}
                options={[
                  { value: 'split', label: 'Split' },
                  { value: 'arcade', label: 'Arcade' },
                  { value: 'tank', label: 'Tank', disabled: true },
                ]}
              />
            </State>
            <State label="alliance">
              <SegmentedControl
                label="Alliance"
                value={alliance}
                onChange={setAlliance}
                options={[
                  { value: 'red', label: 'Red', tone: 'red' },
                  { value: 'blue', label: 'Blue', tone: 'blue' },
                ]}
              />
            </State>
            <State label="hover (2nd)">
              <div className="zd-seg" role="radiogroup" aria-label="Hover demo">
                <button type="button" role="radio" aria-checked="true">
                  Driver
                </button>
                <button type="button" role="radio" aria-checked="false" className="is-hover">
                  Chase
                </button>
              </div>
            </State>
          </div>
        </Demo>
        <Demo title="Tabs" note="Global tabs also switch with LB / RB ( [ and ] on a keyboard).">
          <div className="dg-block">
            <Tabs label="Demo tabs" value={tab} onChange={setTab} tabs={[{ value: 'a', label: 'Chassis' }, { value: 'b', label: 'Drivetrain' }, { value: 'c', label: 'Lift', disabled: true }]} />
            <Tabs global label="Global tabs" value={tab2} onChange={setTab2} tabs={[{ value: 'controls', label: 'Controls' }, { value: 'driving', label: 'Driving' }, { value: 'assists', label: 'Assists' }]} />
          </div>
        </Demo>
        <Demo title="Toggle, Checkbox, Radio">
          <div className="dg-states">
            <State label="toggle on">
              <Toggle label="Demo on" checked={on} onChange={setOn} />
            </State>
            <State label="toggle off">
              <Toggle label="Demo off" checked={!on} onChange={(v) => setOn(!v)} />
            </State>
            <State label="hover">
              <span className="is-hover">
                <Toggle label="Hover" checked={false} onChange={() => {}} />
              </span>
            </State>
            <State label="pressed">
              <span className="is-press">
                <Toggle label="Pressed" checked={false} onChange={() => {}} />
              </span>
            </State>
            <State label="focus">
              <span className="is-focus" style={{ borderRadius: 'var(--radius-pill)' }}>
                <Toggle label="Focus" checked onChange={() => {}} />
              </span>
            </State>
            <State label="disabled">
              <Toggle label="Disabled" checked disabled onChange={() => {}} />
            </State>
            <State label="checkbox">
              <Checkbox checked={check} onChange={setCheck}>
                Include replays
              </Checkbox>
            </State>
            <State label="checkbox disabled">
              <Checkbox checked={false} disabled onChange={() => {}}>
                Unavailable
              </Checkbox>
            </State>
          </div>
          <RadioGroup
            label="Difficulty"
            value={radio}
            onChange={setRadio}
            options={[
              { value: 'easy', label: 'Easy' },
              { value: 'normal', label: 'Medium' },
              { value: 'hard', label: 'Hard', disabled: true },
            ]}
          />
        </Demo>
      </section>

      <section className="dg-section" aria-labelledby="dg-inputs">
        <h2 id="dg-inputs" className="dg-h">
          Inputs
        </h2>
        <Demo title="Slider" note="The number box accepts typed values. Arrow keys and the D-pad step; Shift steps ×10.">
          <div className="dg-block">
            <Field label="Stick deadzone" description="Ignore small stick movements near center">
              <Slider label="Stick deadzone" value={pct} min={0} max={0.4} step={0.01} scale={100} unit="%" onChange={setPct} />
            </Field>
            <Field label="Your height" description="Read-only formatted value">
              <Slider label="Your height" value={inch} min={48} max={84} step={1} onChange={setInch} format={(v) => `${Math.floor(v / 12)}′${v % 12}″`} />
            </Field>
            <Field label="Disabled">
              <Slider label="Disabled" value={0.5} min={0} max={1} step={0.05} scale={100} unit="%" disabled onChange={() => {}} />
            </Field>
          </div>
        </Demo>
        <Demo title="Select" note="Type letters to jump; arrows, Enter and Esc work inside the list.">
          <div className="dg-states">
            <State label="default">
              <Select
                label="Camera"
                value={sel}
                onChange={setSel}
                options={[
                  { value: 'driver', label: 'Driver station' },
                  { value: 'track', label: 'Driver station (tracking)' },
                  { value: 'chase', label: 'Chase' },
                  { value: 'orbit', label: 'Orbit' },
                  { value: 'audience', label: 'Audience', disabled: true },
                ]}
              />
            </State>
            <State label="hover">
              <div className="zd-select">
                <button type="button" className="zd-select-trigger is-hover">
                  <span>Chase</span>
                </button>
              </div>
            </State>
            <State label="disabled">
              <Select label="Disabled" value="a" disabled onChange={() => {}} options={[{ value: 'a', label: 'Unavailable' }]} />
            </State>
          </div>
        </Demo>
        <Demo title="Text input">
          <div className="dg-states">
            <State label="default">
              <TextInput aria-label="Robot name" defaultValue="My Robot" />
            </State>
            <State label="placeholder">
              <TextInput aria-label="Team number" placeholder="Team number" />
            </State>
            <State label="hover">
              <TextInput aria-label="Hover" className="is-hover" defaultValue="Hover" />
            </State>
            <State label="focus">
              <TextInput aria-label="Focus" className="is-focus" defaultValue="Focus" />
            </State>
            <State label="disabled">
              <TextInput aria-label="Disabled" disabled defaultValue="Disabled" />
            </State>
          </div>
        </Demo>
      </section>

      <section className="dg-section" aria-labelledby="dg-surfaces">
        <h2 id="dg-surfaces" className="dg-h">
          Surfaces
        </h2>
        <Demo title="Card">
          <div className="dg-grid">
            <Card>
              <span className="zd-label">Static</span>
              <p>Borders do the work; no shadows.</p>
            </Card>
            {[1, 2].map((i) => (
              <Card key={i} onClick={() => setCard(i)} selected={card === i}>
                <span className="zd-label">{card === i ? 'Selected' : 'Interactive'}</span>
                <p>Click to select.</p>
              </Card>
            ))}
            <Card onClick={() => {}} className="is-hover">
              <span className="zd-label">Hover</span>
            </Card>
            <Card onClick={() => {}} className="is-press">
              <span className="zd-label">Pressed</span>
            </Card>
            <Card onClick={() => {}} className="is-focus">
              <span className="zd-label">Focus</span>
            </Card>
            <Card onClick={() => {}} disabled>
              <span className="zd-label">Disabled</span>
            </Card>
            <Card compact>
              <span className="zd-label">Compact</span>
            </Card>
          </div>
        </Demo>
        <Demo title="Panel, Divider, StatRow">
          <div className="dg-grid">
            <Panel title="Derived stats" actions={<Button size="sm" onClick={() => setStat((s) => +(s + 0.7).toFixed(1))}>Tween</Button>}>
              <div>
                <StatRow label="Top speed" value={stat} decimals={1} unit="ft/s" />
                <StatRow label="Push force" value={31} unit="lbf" />
                <StatRow label="Turn rate" value={412} unit="°/s" />
                <StatRow label="Drive" value="Tank 6-wheel" />
              </div>
            </Panel>
            <Panel title="Career">
              <div className="dg-row">
                <StatRow big label="Runs" value={128} />
                <Divider vertical />
                <StatRow big label="Points" value={9480} />
              </div>
              <Divider />
              <p className="dg-note">Dividers separate groups inside a panel.</p>
            </Panel>
          </div>
        </Demo>
        <Demo title="Badge and Chip">
          <div className="dg-block">
            <div className="dg-row">
              <Badge>Preset</Badge>
              <Badge tone="accent">New best</Badge>
              <Badge tone="ok" icon="checkCircle">
                Legal
              </Badge>
              <Badge tone="warn" icon="warning">
                Warning
              </Badge>
              <Badge tone="danger" icon="danger">
                Violation
              </Badge>
              <Badge tone="red">Red</Badge>
              <Badge tone="blue">Blue</Badge>
            </div>
            <div className="dg-row">
              <Chip icon="pinPiece">Static</Chip>
              <Chip pressed={chip} onClick={() => setChip(!chip)}>
                Toggle {chip ? 'on' : 'off'}
              </Chip>
              {chips.map((c) => (
                <Chip key={c} onRemove={() => setChips(chips.filter((x) => x !== c))}>
                  {c}
                </Chip>
              ))}
              <Chip onClick={() => {}} disabled>
                Disabled
              </Chip>
            </div>
          </div>
        </Demo>
        <Demo title="Collapsible group and setting row">
          <div className="zd-panel">
            <Group title="Drivetrain" summary="Tank 6-wheel · 4 × 11 W · 450 rpm" defaultOpen>
              <Field label="Field-centric drive" description="Stick up always moves away from your station">
                <Toggle label="Field-centric drive" checked={on} onChange={setOn} />
              </Field>
            </Group>
            <Group title="Lift" summary="DR4B · 2 × 11 W · 38 in">
              <p className="dg-note">Collapsed groups keep their summary visible.</p>
            </Group>
          </div>
        </Demo>
      </section>

      <section className="dg-section" aria-labelledby="dg-feedback">
        <h2 id="dg-feedback" className="dg-h">
          Feedback
        </h2>
        <Demo title="Tooltip" note="Appears after 400 ms beside the control, never over it.">
          <div className="dg-row">
            <Tooltip label="Cycle the camera">
              <Button icon="camera">Hover or focus me</Button>
            </Tooltip>
            <Tooltip label="Opens below near the top of the screen" placement="bottom">
              <IconButton icon="info" label="More information" />
            </Tooltip>
          </div>
        </Demo>
        <Demo title="Dialog" note="Focus is trapped inside; Esc or B closes and returns focus.">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Dialog
            open={dialog}
            title="Clear all ZDrive data?"
            onClose={() => setDialog(false)}
            actions={
              <>
                <Button variant="ghost" onClick={() => setDialog(false)}>
                  Cancel
                </Button>
                <Button variant="danger" data-autofocus onClick={() => setDialog(false)}>
                  Clear data
                </Button>
              </>
            }
          >
            This removes robots, records, replays and settings from this browser.
          </Dialog>
        </Demo>
        <Demo title="Toast" note="Bottom center, at most three at once, dismissed after 4 s. Hover or focus pauses the timer.">
          <div className="dg-block">
            <div className="dg-row">
              <Button onClick={() => toast({ text: 'Robot saved.', tone: 'ok' })}>Success</Button>
              <Button onClick={() => toast({ text: 'Storage is almost full.', tone: 'warn', action: { label: 'Manage', onClick: () => {} } })}>Warning</Button>
              <Button onClick={() => toast({ title: 'SG9', text: 'Holding more than one Cup.', tone: 'danger', alliance: 'red' })}>Rule call</Button>
              <Button onClick={() => toast({ text: 'Replay exported.' })}>Info</Button>
            </div>
            <ToastCard toast={{ text: 'Robot saved.', tone: 'ok' }} />
            <ToastCard toast={{ title: 'SG9', text: 'Holding more than one Cup.', tone: 'danger', alliance: 'blue' }} />
          </div>
        </Demo>
        <Demo title="KeyHint" note="The live row follows your last input; the rows below force each device.">
          <div className="dg-block">
            {(['live', 'keyboard', 'xbox', 'playstation'] as const).map((d) => (
              <div key={d} className="dg-row">
                <code>{d}</code>
                {(['confirm', 'back', 'menu', 'tabPrev', 'tabNext', 'alt', 'option'] as HintAction[]).map((a) => (
                  <KeyHint key={a} action={a} device={d === 'live' ? undefined : d} />
                ))}
              </div>
            ))}
          </div>
        </Demo>
        <Demo title="Progress, spinner, skeleton" note="Skeletons match the size of what they replace. The spinner waits 300 ms before it shows.">
          <div className="dg-block">
            <ProgressBar value={0} label="Empty" />
            <ProgressBar value={0.4} label="40 percent" />
            <ProgressBar value={1} label="Done" />
            <ProgressBar value={null} label="Loading" />
            <ProgressBar value={0.66} thick label="Drivetrain power" />
            <div className="dg-row">
              <Spinner /> <code>delayed</code>
              <Spinner immediate /> <code>immediate</code>
            </div>
            <div className="dg-grid">
              <Card compact>
                <StatRow label="Top speed" value={4.6} decimals={1} unit="ft/s" tween={false} />
              </Card>
              <Card compact>
                <div className="zd-stat">
                  <Skeleton width="40%" height="var(--fs-14)" />
                  <Skeleton width="20%" height="var(--fs-16)" />
                </div>
              </Card>
            </div>
          </div>
        </Demo>
        <Demo title="Empty state">
          <EmptyState icon="film" text="Finish a run to save a replay." action={<Button variant="primary">Play</Button>} />
        </Demo>
      </section>
    </>
  );
}
