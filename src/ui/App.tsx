import { useCallback, useEffect, useState } from 'react';
import type { GameId } from '../shared/types';
import { Footer, GAMES, TAGLINE, Wordmark, navigate } from './chrome';
import { GameHome } from './GameHome';
import { loadSettings, saveSettings, type Settings } from './settings';

type Route = { page: 'home' } | { page: 'game'; game: GameId };

function parse(path: string): Route {
  const p = path.replace(/\/+$/, '').toLowerCase();
  if (p === '/override') return { page: 'game', game: 'override' };
  if (p === '/pinnacle') return { page: 'game', game: 'pinnacle' };
  return { page: 'home' };
}

function Home() {
  return (
    <div className="home">
      <header className="home-head">
        <Wordmark />
        <p className="tagline">{TAGLINE}</p>
      </header>
      <div className="game-cards">
        {GAMES.map((g) => (
          <button key={g.id} className={`game-card ${g.id}`} onClick={() => navigate(`/${g.id}`)}>
            <span className="org">{g.org}</span>
            <span className="name">{g.name}</span>
            <span className="blurb">{g.blurb}</span>
            <span className="go">Play →</span>
          </button>
        ))}
      </div>
      <ul className="features">
        <li>Full 3D field with a driver-station camera, chase cam and a flat 2D overhead view</li>
        <li>Robot builder with a live turntable preview, presets and legality checks</li>
        <li>Matches against partner and opponent bots, skills and solo runs, free drive</li>
        <li>Live scoring, automatic rule calls, replays and local records</li>
        <li>Keyboard or gamepad (V5-style layout)</li>
      </ul>
      <Footer />
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  useEffect(() => {
    const on = () => setRoute(parse(location.pathname));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  useEffect(() => {
    document.title = route.page === 'home' ? 'ZDrive: VEX Driving Simulator' : `ZDrive · ${route.game === 'override' ? 'Override' : 'Pinnacle'}`;
  }, [route]);

  return route.page === 'home' ? <Home /> : <GameHome key={route.game} game={route.game} settings={settings} setSettings={setSettings} />;
}
