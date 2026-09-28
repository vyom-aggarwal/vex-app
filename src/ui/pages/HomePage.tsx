import type { GameId } from '../../shared/types';
import { Card, KeyHint, LinkButton, type KeyHintProps } from '../components';
import { GAMES, TAGLINE, navigate } from '../chrome';
import { Icon, type IconName } from '../icons';
import { useShortcut } from '../nav';

const CARDS: { id: string; title: string; desc: string; icon: IconName; path: string; hint: KeyHintProps }[] = [
  { id: 'play', title: 'Play', desc: 'Practice modes, skills runs and full matches against bots.', icon: 'play', path: 'play', hint: { code: 'KeyP', pad: 9 } },
  { id: 'configure', title: 'Configure', desc: 'Controls, driving, assists, graphics and data.', icon: 'sliders', path: 'settings/controls', hint: { code: 'KeyC', pad: 2 } },
  { id: 'records', title: 'Records', desc: 'Best scores, career totals and saved replays.', icon: 'trophy', path: 'records', hint: { code: 'KeyR', pad: 3 } },
];

/** Game hub: the live field behind a calm hero, then Play / Configure / Records. */
export function HomePage({ game }: { game: GameId }) {
  const g = GAMES.find((x) => x.id === game)!;
  useShortcut(CARDS[0].hint, () => navigate(`/${game}/play`));
  useShortcut(CARDS[1].hint, () => navigate(`/${game}/${CARDS[1].path}`));
  useShortcut(CARDS[2].hint, () => navigate(`/${game}/records`));
  return (
    <div className="zd-home">
      <p className="zd-phone-note" role="note">
        <Icon name="monitor" />
        Best on a larger screen with a controller. Menus still work here.
      </p>
      <section className="zd-hero" aria-labelledby="zd-hero-title">
        <div className="zd-hero-text" key={game}>
          <span className="zd-label">{g.org}</span>
          <h1 id="zd-hero-title">{g.name}</h1>
          <p className="zd-hero-desc">{g.blurb}</p>
          <p className="zd-hero-tag">{TAGLINE}</p>
        </div>
        <div className="zd-hero-actions">
          <LinkButton to={`/${game}/play`} variant="primary" size="lg" icon="play" data-autofocus>
            Play
          </LinkButton>
          <LinkButton to={`/${game}/robot`} variant="secondary" size="lg" icon="wrench">
            Build robot
          </LinkButton>
        </div>
      </section>
      <nav className="zd-hub-cards" aria-label="Main menu">
        {CARDS.map((c) => (
          <Card key={c.id} to={`/${game}/${c.path}`} className="zd-hub-card">
            <span className="zd-hub-card-top">
              <Icon name={c.icon} />
              <KeyHint {...c.hint} />
            </span>
            <span className="zd-hub-card-title">{c.title}</span>
            <span className="zd-hub-card-desc">{c.desc}</span>
          </Card>
        ))}
      </nav>
    </div>
  );
}
