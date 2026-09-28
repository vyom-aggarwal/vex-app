import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { Replay } from '../shared/replay';
import { loadJson, saveJson } from '../shared/storage';
import type { GameId, ModeId } from '../shared/types';
import { CONFIG_SECTIONS, Footer, GAMES, GameSwitcher, Link, Shell, TAGLINE, Wordmark, navigate, type ConfigSection, type Page } from './chrome';
import { useGame } from './host';
import { lineup } from './lineup';
import { ConfigurePage } from './pages/ConfigurePage';
import { PlayPage } from './pages/PlayPage';
import { RecordsPage } from './pages/RecordsPage';
import { loadDraft } from './robots';
import { loadSettings, saveSettings, type Settings } from './settings';
import { setAudioLevels, setMuted } from './sound';
import { applyAppearance } from './appearance';
import { setUiSounds, startNav } from './nav';
import { DesignPage } from './pages/design/DesignPage';

const GameView = lazy(() => import('./GameView'));
const ReplayViewer = lazy(() => import('./ReplayViewer'));

type Route = { game: GameId | null; page: Page; section: ConfigSection };

function parse(path: string): Route {
  const parts = path.toLowerCase().split('/').filter(Boolean);
  const game = parts[0] === 'override' || parts[0] === 'pinnacle' ? (parts[0] as GameId) : null;
  const page = (['play', 'configure', 'records'] as const).find((p) => p === parts[1]) ?? 'home';
  const section = CONFIG_SECTIONS.find((s) => s.id === parts[2])?.id ?? 'robot';
  return { game, page: game ? page : 'home', section };
}


function Home({ game }: { game: GameId }) {
  return (
    <div className="home">
      <div className="home-hero">
        <Wordmark />
        <p className="tagline">{TAGLINE}</p>
        <GameSwitcher current={game} />
        <p className="game-blurb">
          <b>{GAMES.find((g) => g.id === game)!.org}</b> · {GAMES.find((g) => g.id === game)!.blurb}
        </p>
      </div>
      <nav className="menu" aria-label="Main menu">
        <Link to={`/${game}/play`} className="menu-btn primary">
          <b>Play</b>
          <small>Practice &amp; matches</small>
        </Link>
        <Link to={`/${game}/configure/robot`} className="menu-btn">
          <b>Configure</b>
          <small>Robot &amp; match setup</small>
        </Link>
        <Link to={`/${game}/records`} className="menu-btn">
          <b>Records</b>
          <small>Best scores, career &amp; replays</small>
        </Link>
      </nav>
      <Footer />
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [launch, setLaunch] = useState<{ game: GameId; mode: ModeId; seed: number } | null>(null);
  const [replay, setReplay] = useState<{ game: GameId; replay: Replay } | null>(null);
  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  useEffect(() => {
    // Any navigation (including the browser Back button) leaves a running match or replay.
    const on = () => {
      setLaunch(null);
      setReplay(null);
      setRoute(parse(location.pathname));
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const game: GameId = route.game ?? loadJson<GameId>('lastGame', 'override');
  useEffect(() => {
    if (route.game) saveJson('lastGame', route.game);
    document.title = route.game ? `ZDrive · ${GAMES.find((g) => g.id === route.game)!.name}` : 'ZDrive: VEX Driving Simulator';
  }, [route.game]);

  useEffect(() => {
    applyAppearance(settings);
  }, [settings.theme, settings.palette, settings.motion, settings.uiScale]);
  useEffect(() => {
    setAudioLevels({ master: settings.master, sfx: settings.sfx, voice: settings.voice });
    setMuted(settings.muted);
    setUiSounds(settings.uiSounds);
  }, [settings.master, settings.sfx, settings.voice, settings.muted, settings.uiSounds]);
  useEffect(() => startNav(), []);

  const def = useGame(game);

  if (launch && def && def.id === launch.game) {
    const mode = def.modes.find((m) => m.id === launch.mode)!;
    return (
      <Suspense fallback={<div className="loading">Loading field…</div>}>
        <GameView
          key={launch.seed}
          game={def}
          mode={mode}
          entries={lineup(def, mode, loadDraft(def.id), settings)}
          settings={settings}
          seed={launch.seed}
          onExit={() => setLaunch(null)}
          onRestart={() => setLaunch({ ...launch, seed: (Date.now() & 0x7fffffff) || 1 })}
          onWatch={(r) => {
            setLaunch(null);
            setReplay({ game: def.id, replay: r });
          }}
        />
      </Suspense>
    );
  }
  if (replay && def && def.id === replay.game) {
    return (
      <Suspense fallback={<div className="loading">Loading replay…</div>}>
        <ReplayViewer game={def} replay={replay.replay} settings={settings} onExit={() => setReplay(null)} />
      </Suspense>
    );
  }

  if (location.pathname.toLowerCase() === '/design') return <DesignPage settings={settings} setSettings={setSettings} />;
  if (route.page === 'home' || !route.game) return <Home game={game} />;
  if (!def) return <div className="loading">Loading…</div>;

  return (
    <Shell game={game} page={route.page}>
      {route.page === 'play' && <PlayPage def={def} settings={settings} onLaunch={(mode) => setLaunch({ game, mode, seed: (Date.now() & 0x7fffffff) || 1 })} />}
      {route.page === 'configure' && (
        <ConfigurePage def={def} section={route.section} settings={settings} setSettings={setSettings} onSection={(s) => navigate(`/${game}/configure/${s}`)} />
      )}
      {route.page === 'records' && <RecordsPage game={def} onWatch={(r) => setReplay({ game, replay: r })} />}
    </Shell>
  );
}
