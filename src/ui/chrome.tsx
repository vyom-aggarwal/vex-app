import type { ReactNode } from 'react';
import type { Phase } from '../shared/matchTimer';
import type { GameId } from '../shared/types';

export const GAMES: { id: GameId; name: string; org: string; blurb: string }[] = [
  { id: 'override', name: 'Override', org: 'VEX V5RC 2026-27', blurb: 'Nest Pins and Cups on nine goals, flip the Toggles, and fight for the Midfield.' },
  { id: 'pinnacle', name: 'Pinnacle', org: 'RECF Achieve 2026-27', blurb: 'Build stacks on alliance, neutral and center goals, turn the Rollers, and park on a Loader.' },
];

export const TAGLINE = '3D driver practice for VEX Override and RECF Pinnacle';
export const FOOTER = 'ZDrive is an unofficial practice tool. Not affiliated with VEX Robotics, Innovation First, or the RECF.';

export type Page = 'home' | 'play' | 'configure' | 'records';
export type ConfigSection = 'robot' | 'controls' | 'match' | 'audio' | 'graphics';

export const CONFIG_SECTIONS: { id: ConfigSection; label: string; sub: string }[] = [
  { id: 'robot', label: 'Robot', sub: 'Presets, build, look' },
  { id: 'controls', label: 'Controls', sub: 'Keyboard & gamepad' },
  { id: 'match', label: 'Match', sub: 'Alliance, start, bots' },
  { id: 'audio', label: 'Audio and visual', sub: 'Sounds, voice, theme' },
  { id: 'graphics', label: 'Graphics', sub: 'View, camera, quality' },
];

export function navigate(to: string): void {
  if (location.pathname + location.search !== to) history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

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

export function Wordmark({ small, to = '/' }: { small?: boolean; to?: string }) {
  return (
    <Link to={to} className={`wordmark${small ? ' small' : ''}`}>
      <span className="z">Z</span>Drive
    </Link>
  );
}

export function GameSwitcher({ current, page = 'home' }: { current: GameId; page?: string }) {
  return (
    <nav className="switcher" aria-label="Game">
      {GAMES.map((g) => (
        <button key={g.id} className={g.id === current ? 'active' : ''} onClick={() => navigate(page === 'home' ? `/${g.id}` : `/${g.id}/${page}`)}>
          {g.name}
        </button>
      ))}
    </nav>
  );
}

export function Footer() {
  return <footer className="footer">{FOOTER}</footer>;
}

const NAV: { id: Page; label: string; sub: string }[] = [
  { id: 'home', label: 'Home', sub: 'Main menu' },
  { id: 'play', label: 'Play', sub: 'Practice & matches' },
  { id: 'configure', label: 'Configure', sub: 'Robot & match setup' },
  { id: 'records', label: 'Records', sub: 'Best scores & replays' },
];

export function Shell({ game, page, children }: { game: GameId; page: Page; children: ReactNode }) {
  const name = GAMES.find((g) => g.id === game)!.name;
  return (
    <div className="shell">
      <header className="topbar">
        <Wordmark small to={`/${game}`} />
        <span className="crumb">{name}</span>
        <div className="grow" />
        <GameSwitcher current={game} page={page === 'home' ? 'home' : page === 'configure' ? `configure/${location.pathname.split('/')[3] ?? 'robot'}` : page} />
      </header>
      <div className="shell-body">
        <nav className="sidebar" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.id} to={n.id === 'home' ? `/${game}` : `/${game}/${n.id}`} className={`nav-item${n.id === page ? ' active' : ''}`}>
              <b>{n.label}</b>
              <small>{n.sub}</small>
            </Link>
          ))}
        </nav>
        <main className="page">{children}</main>
      </div>
      <Footer />
    </div>
  );
}

export function phaseLabel(p: Phase): string {
  return { pre: 'Ready', auton: 'Autonomous', pause: 'Pause', driver: 'Driver Control', post: 'Final', free: 'Free Drive' }[p];
}
