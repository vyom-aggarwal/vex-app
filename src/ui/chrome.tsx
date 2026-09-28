import type { ReactNode } from 'react';
import type { Phase } from '../shared/matchTimer';
import type { GameId } from '../shared/types';
import { Button, IconButton, SegmentedControl } from './components';
import { Icon } from './icons';
import { useBack, useDevice } from './nav';
import { back, navigate } from './router';

export { navigate } from './router';

export const GAMES: { id: GameId; name: string; org: string; blurb: string }[] = [
  { id: 'override', name: 'Override', org: 'VEX V5RC 2026-27', blurb: 'Nest Pins and Cups on nine Goals, flip the Toggles, and fight for the Midfield.' },
  { id: 'pinnacle', name: 'Pinnacle', org: 'RECF Achieve 2026-27', blurb: 'Build stacks on alliance, neutral and center Goals, turn the Rollers, and park on a Loader.' },
];

export const TAGLINE = '3D driver practice for VEX Override and RECF Pinnacle';
export const FOOTER = 'ZDrive is an unofficial practice tool. Not affiliated with VEX Robotics, Innovation First, or the RECF.';

export type Page = 'home' | 'play' | 'robot' | 'records' | 'settings';
export type SettingsSection = 'controls' | 'driving' | 'assists' | 'graphics' | 'audio' | 'accessibility' | 'data';

export function Link({ to, className, children, title }: { to: string; className?: string; children: ReactNode; title?: string }) {
  return (
    <a
      href={to}
      className={className}
      title={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="zd-wordmark" title="ZDrive home">
      <span className="zd-wordmark-z" aria-hidden="true">
        Z
      </span>
      Drive
    </Link>
  );
}

export function GameSwitcher({ current, path }: { current: GameId; path: string }) {
  return (
    <SegmentedControl
      label="Game"
      value={current}
      onChange={(g) => navigate(`/${g}${path}`)}
      options={GAMES.map((g) => ({ value: g.id, label: g.name }))}
    />
  );
}

const DEVICE_LABEL = { keyboard: 'Keyboard', mouse: 'Mouse', xbox: 'Xbox controller', playstation: 'PlayStation controller' } as const;

function DeviceIndicator() {
  const d = useDevice();
  return (
    <span className="zd-device" title={`Input: ${DEVICE_LABEL[d]}`} aria-label={`Input device: ${DEVICE_LABEL[d]}`} role="status">
      <Icon name={d === 'keyboard' ? 'keyboard' : d === 'mouse' ? 'mouse' : 'gamepad'} />
      <span className="zd-device-label">{DEVICE_LABEL[d]}</span>
    </span>
  );
}

export function TopBar({ game, path, muted, onMute }: { game: GameId; path: string; muted: boolean; onMute: () => void }) {
  return (
    <header className="zd-topbar">
      <div className="zd-topbar-left">
        <Wordmark to={`/${game}`} />
      </div>
      <div className="zd-topbar-center">
        <GameSwitcher current={game} path={path} />
      </div>
      <div className="zd-topbar-right">
        <DeviceIndicator />
        <IconButton icon={muted ? 'volumeOff' : 'volume'} label={muted ? 'Unmute sounds' : 'Mute sounds'} pressed={muted} onClick={onMute} />
        <IconButton icon="settings" label="Settings" onClick={() => navigate(`/${game}/settings/controls`)} />
      </div>
    </header>
  );
}

export function Footer() {
  return <footer className="zd-footer">{FOOTER}</footer>;
}

/** Screen header with a Back button (Esc / B) that returns to `parent` (or the previous screen). */
export function PageHeader({ title, eyebrow, parent, actions }: { title: string; eyebrow?: string; parent: string; actions?: ReactNode }) {
  useBack(() => back(parent));
  return (
    <div className="zd-pagehead">
      <Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => back(parent)} hint={{ action: 'back' }}>
        Back
      </Button>
      <div className="zd-pagehead-row">
        <div className="zd-pagehead-titles">
          {eyebrow && <span className="zd-label">{eyebrow}</span>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="zd-pagehead-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function phaseLabel(p: Phase): string {
  return { pre: 'Ready', auton: 'Autonomous', pause: 'Pause', driver: 'Driver control', post: 'Final', free: 'Free drive' }[p];
}

/** Short uppercase phase tag for the score bar. */
export function phaseTag(p: Phase, endgame: boolean): string {
  if (p === 'driver' && endgame) return 'Endgame';
  return { pre: 'Ready', auton: 'Auto', pause: 'Pause', driver: 'Driver', post: 'Final', free: 'Free drive' }[p];
}
