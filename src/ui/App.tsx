import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { onStorageFull } from '../shared/storage';
import { loadJson, saveJson } from '../shared/storage';
import type { Replay } from '../shared/replay';
import type { GameId, ModeId } from '../shared/types';
import { applyAppearance, tokenMs } from './appearance';
import { Backdrop } from './Backdrop';
import { Footer, GAMES, TopBar, Wordmark, type Page, type SettingsSection } from './chrome';
import { Button, ProgressBar, Skeleton, useToast } from './components';
import { getRenderer, loadGame, loadPhysicsOnce, useGame } from './host';
import { Icon } from './icons';
import { lineup } from './lineup';
import { setUiSounds, startNav } from './nav';
import { DesignPage } from './pages/design/DesignPage';
import { HomePage } from './pages/HomePage';
import { ModeSelectPage } from './pages/ModeSelectPage';
import { RecordsPage } from './pages/RecordsPage';
import { RobotPage } from './pages/RobotPage';
import { SETTINGS_SECTIONS, SettingsPage } from './pages/SettingsPage';
import { resolveQuality } from './quality';
import { loadDraft } from './robots';
import { navigate, rememberView, restoreView } from './router';
import { loadSettings, saveSettings, type Settings } from './settings';
import { setAudioLevels, setMuted } from './sound';

const GameView = lazy(() => import('./GameView'));
const ReplayViewer = lazy(() => import('./ReplayViewer'));

type Route = { game: GameId | null; page: Page; section: SettingsSection; design: boolean; legacy: string | null };

const LEGACY_SECTION: Record<string, string> = { robot: 'robot', controls: 'settings/controls', match: 'play', audio: 'settings/audio', graphics: 'settings/graphics' };

function parse(path: string): Route {
  const parts = path.toLowerCase().split('/').filter(Boolean);
  const design = parts[0] === 'design';
  const game = parts[0] === 'override' || parts[0] === 'pinnacle' ? (parts[0] as GameId) : null;
  let page: Page = (['play', 'robot', 'records', 'settings'] as const).find((p) => p === parts[1]) ?? 'home';
  let legacy: string | null = null;
  if (game && parts[1] === 'configure') {
    legacy = `/${game}/${LEGACY_SECTION[parts[2] ?? 'robot'] ?? 'robot'}`;
    page = 'home';
  }
  const section = SETTINGS_SECTIONS.find((s) => s.id === parts[2])?.id ?? 'controls';
  return { game, page: game ? page : 'home', section, design, legacy };
}

/** Path after the game segment (kept when switching games). */
const subPath = (r: Route): string => (r.page === 'home' ? '' : r.page === 'settings' ? `/settings/${r.section}` : `/${r.page}`);

/** First-visit loading screen: wordmark and a thin progress bar while three.js and Rapier load. */
function Boot({ progress, leaving }: { progress: number; leaving: boolean }) {
  return (
    <div className={`zd-boot${leaving ? ' is-leaving' : ''}`} role="status" aria-label="Loading ZDrive">
      <div className="zd-boot-inner">
        <span className="zd-boot-mark">
          <span className="zd-wordmark-z">Z</span>Drive
        </span>
        <ProgressBar value={progress} label="Loading" />
      </div>
    </div>
  );
}

function ViewLoading({ label }: { label: string }) {
  return (
    <div className="zd-view-loading" role="status">
      <Wordmark />
      <span className="zd-muted">{label}</span>
      <ProgressBar value={null} label={label} />
    </div>
  );
}

/** Stands in for a screen while its game definition loads (same header + card grid shape). */
function PageSkeleton() {
  return (
    <div className="zd-skeleton-page" aria-hidden="true">
      <Skeleton width="var(--space-16)" height="var(--control-sm)" />
      <Skeleton width="calc(var(--space-16) * 4)" height="var(--fs-32)" />
      <div className="zd-skeleton-grid">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="calc(var(--space-16) * 2)" radius="var(--radius-md)" />
        ))}
      </div>
    </div>
  );
}

export function App() {
  const toast = useToast();
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [launch, setLaunch] = useState<{ game: GameId; mode: ModeId; seed: number } | null>(null);
  const [replay, setReplay] = useState<{ game: GameId; replay: Replay; at?: number } | null>(null);
  const [lastMode, setLastMode] = useState<ModeId | null>(null);
  const [boot, setBoot] = useState({ done: 0, finished: false, gone: false });
  const [webgl, setWebgl] = useState<string | null>(null);
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

  // Old /configure/* links land on their new screens.
  useEffect(() => {
    if (route.legacy) navigate(route.legacy, { replace: true });
  }, [route.legacy]);

  // Back/forward restores the screen's scroll and focus.
  const path = location.pathname;
  useLayoutEffect(() => {
    if (!launch && !replay) restoreView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, launch, replay]);

  const game: GameId = route.game ?? loadJson<GameId>('lastGame', 'override');
  useEffect(() => {
    if (route.game) saveJson('lastGame', route.game);
    document.title = route.game ? `ZDrive · ${GAMES.find((g) => g.id === route.game)!.name}` : 'ZDrive: VEX Driving Simulator';
  }, [route.game]);

  useLayoutEffect(() => {
    applyAppearance(settings);
  }, [settings.theme, settings.palette, settings.motion, settings.uiScale]);
  useEffect(() => {
    setAudioLevels({ master: settings.master, sfx: settings.sfx, voice: settings.voice });
    setMuted(settings.muted);
    setUiSounds(settings.uiSounds);
  }, [settings.master, settings.sfx, settings.voice, settings.muted, settings.uiSounds]);
  useEffect(() => startNav(), []);

  // Storage full: say so once in a while, with a way to free space.
  const lastFull = useRef(0);
  useEffect(() => {
    onStorageFull(() => {
      const now = Date.now();
      if (now - lastFull.current < 15000) return;
      lastFull.current = now;
      toast({ tone: 'warn', text: 'Storage is full, so some data was not saved.', action: { label: 'Manage data', onClick: () => navigate(`/${game}/settings/data`) } });
    });
    return () => onStorageFull(null);
  }, [toast, game]);

  // Boot: renderer (three.js), the game definition and physics (Rapier) load in parallel.
  useEffect(() => {
    if (route.design) {
      setBoot({ done: 3, finished: true, gone: true });
      return;
    }
    const step = () => setBoot((b) => ({ ...b, done: b.done + 1 }));
    const steps = [
      getRenderer(resolveQuality(settings.quality)).then(step, (e: unknown) => {
        setWebgl((e as Error)?.message || 'WebGL is unavailable');
        step();
      }),
      loadGame(game).then(step, step),
      loadPhysicsOnce().then(step, step),
    ];
    void Promise.all(steps).then(() => {
      setBoot((b) => ({ ...b, finished: true }));
      setTimeout(() => setBoot((b) => ({ ...b, gone: true })), tokenMs('--dur-slow', 320));
    });
    // Boot runs once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const def = useGame(game);
  const bootLayer = !boot.gone && <Boot progress={boot.done / 3} leaving={boot.finished} />;

  if (route.design) return <DesignPage settings={settings} setSettings={setSettings} />;

  const exitTo = (to: string | null) => {
    setLaunch(null);
    setReplay(null);
    if (to) navigate(to);
  };
  const newSeed = () => (Date.now() & 0x7fffffff) || 1;

  let view: ReactNode = null;
  if (launch && def && def.id === launch.game) {
    const mode = def.modes.find((m) => m.id === launch.mode)!;
    view = (
      <Suspense fallback={<ViewLoading label="Loading field" />}>
        <GameView
          key={launch.seed}
          game={def}
          mode={mode}
          entries={lineup(def, mode, loadDraft(def.id), settings)}
          settings={settings}
          setSettings={setSettings}
          seed={launch.seed}
          onExit={(to) => exitTo(to ?? null)}
          onRestart={() => setLaunch({ ...launch, seed: newSeed() })}
          onWatch={(r, at) => {
            setLaunch(null);
            setReplay({ game: def.id, replay: r, at });
          }}
        />
      </Suspense>
    );
  } else if (replay && def && def.id === replay.game) {
    view = (
      <Suspense fallback={<ViewLoading label="Loading replay" />}>
        <ReplayViewer game={def} replay={replay.replay} at={replay.at} settings={settings} onExit={() => setReplay(null)} />
      </Suspense>
    );
  }

  const page = route.page;
  let content: ReactNode;
  if (!def) content = <PageSkeleton />;
  else if (page === 'play')
    content = (
      <ModeSelectPage
        def={def}
        settings={settings}
        setSettings={setSettings}
        initial={lastMode}
        onLaunch={(mode) => {
          rememberView();
          setLastMode(mode);
          setLaunch({ game, mode, seed: newSeed() });
        }}
      />
    );
  else if (page === 'robot')
    content = (
      <RobotPage key={def.id} def={def} settings={settings} />
    );
  else if (page === 'records')
    content = (
      <RecordsPage
        game={def}
        onWatch={(r) => {
          rememberView();
          setReplay({ game, replay: r });
        }}
      />
    );
  else if (page === 'settings') content = <SettingsPage game={game} section={route.section} settings={settings} setSettings={setSettings} />;
  else content = <HomePage game={game} />;

  return (
    <div className="zd-app">
      <Backdrop def={def} settings={settings} strong={page !== 'home'} onError={(e) => setWebgl(e)} />
      {!view && (
        <div className={`zd-shell is-${page}`}>
          <TopBar game={game} path={subPath(route)} muted={settings.muted} onMute={() => setSettings({ ...settings, muted: !settings.muted })} />
          {webgl && (
            <div className="zd-banner" role="alert">
              <Icon name="danger" />
              <span>3D view unavailable: this browser has WebGL turned off or unsupported. Turn on hardware acceleration in your browser settings, then reload.</span>
              <Button size="sm" onClick={() => location.reload()}>
                Reload
              </Button>
            </div>
          )}
          <main id="zd-main" className={`zd-main is-${page}`} data-nav-scope="page" key={`${game}/${page}`}>
            {content}
          </main>
          <Footer />
        </div>
      )}
      {view}
      {bootLayer}
    </div>
  );
}
