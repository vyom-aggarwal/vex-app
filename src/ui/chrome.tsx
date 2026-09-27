import type { Phase } from '../shared/matchTimer';
import type { GameId } from '../shared/types';

export const GAMES: { id: GameId; name: string; org: string; blurb: string }[] = [
  { id: 'override', name: 'Override', org: 'VEX V5RC 2026-27', blurb: 'Nest Pins and Cups on nine goals, flip the Toggles, and fight for the Midfield.' },
  { id: 'pinnacle', name: 'Pinnacle', org: 'RECF Achieve 2026-27', blurb: 'Build stacks on alliance, neutral and center goals, turn the Rollers, and park on a Loader.' },
];

export const TAGLINE = '3D driver practice for VEX Override and RECF Pinnacle';
export const FOOTER = 'ZDrive is an unofficial practice tool. Not affiliated with VEX Robotics, Innovation First, or the RECF.';

export function navigate(to: string): void {
  if (location.pathname !== to) history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Wordmark({ small }: { small?: boolean }) {
  return (
    <a
      className={`wordmark${small ? ' small' : ''}`}
      href="/"
      onClick={(e) => {
        e.preventDefault();
        navigate('/');
      }}
    >
      <span className="z">Z</span>Drive
    </a>
  );
}

export function GameSwitcher({ current }: { current: GameId | null }) {
  return (
    <nav className="switcher" aria-label="Game">
      {GAMES.map((g) => (
        <button key={g.id} className={g.id === current ? 'active' : ''} onClick={() => navigate(`/${g.id}`)}>
          {g.name}
        </button>
      ))}
    </nav>
  );
}

export function Footer() {
  return <footer className="footer">{FOOTER}</footer>;
}


export function phaseLabel(p: Phase): string {
  return { pre: 'Ready', auton: 'Autonomous', pause: 'Pause', driver: 'Driver Control', post: 'Final', free: 'Free Drive' }[p];
}
