import { useState } from 'react';
import { ICON_NAMES, Icon } from '../../icons';

/** Style guide: the design tokens (colors, type, space, shape, motion) and the icon set. */

const COLOR_GROUPS: { title: string; names: string[] }[] = [
  { title: 'Surfaces', names: ['--bg-0', '--bg-1', '--bg-2', '--bg-3', '--line-1', '--line-2'] },
  { title: 'Text', names: ['--text-1', '--text-2', '--text-3'] },
  { title: 'Accent (interaction only)', names: ['--accent', '--accent-hover', '--accent-press', '--accent-text', '--accent-soft'] },
  { title: 'Alliance and game', names: ['--red', '--red-soft', '--blue', '--blue-soft', '--yellow', '--yellow-soft'] },
  { title: 'Status', names: ['--ok', '--ok-soft', '--warn', '--warn-soft', '--danger', '--danger-soft'] },
];

const TYPE = [
  { token: '--fs-72', px: 72 },
  { token: '--fs-48', px: 48 },
  { token: '--fs-32', px: 32 },
  { token: '--fs-24', px: 24 },
  { token: '--fs-20', px: 20 },
  { token: '--fs-16', px: 16 },
  { token: '--fs-14', px: 14 },
  { token: '--fs-13', px: 13 },
  { token: '--fs-12', px: 12 },
];

const SPACE = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-6', '--space-8', '--space-12', '--space-16'];

export function TokensSection() {
  const [moved, setMoved] = useState(false);
  return (
    <>
      <section className="dg-section" aria-labelledby="dg-color">
        <h2 id="dg-color" className="dg-h">
          Color
        </h2>
        <p className="dg-note">Red and blue mean alliance only. The accent marks interaction. Danger pairs with its octagon icon so it never reads as alliance red.</p>
        {COLOR_GROUPS.map((g) => (
          <div key={g.title} className="dg-block">
            <h3 className="zd-label">{g.title}</h3>
            <div className="dg-swatches">
              {g.names.map((n) => (
                <div key={n} className="dg-swatch">
                  <span className="dg-chip" style={{ background: `var(${n})` }} />
                  <code>{n}</code>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="dg-section" aria-labelledby="dg-type">
        <h2 id="dg-type" className="dg-h">
          Type
        </h2>
        <p className="dg-note">Inter variable with tabular figures. Weights 400, 500 and 600 only.</p>
        <div className="dg-type">
          {TYPE.map((t) => (
            <div key={t.token} className="dg-type-row">
              <code>{t.token}</code>
              <span style={{ fontSize: `var(${t.token})`, lineHeight: t.px >= 20 ? 'var(--lh-display)' : 'var(--lh-body)', fontWeight: t.px >= 20 ? 'var(--fw-semibold)' : 'var(--fw-regular)' }}>
                {t.px >= 32 ? '128 – 96' : 'Nest Pins and Cups on the Goals'}
              </span>
            </div>
          ))}
        </div>
        <div className="dg-row">
          <span style={{ fontWeight: 'var(--fw-regular)' }}>Regular 400</span>
          <span style={{ fontWeight: 'var(--fw-medium)' }}>Medium 500</span>
          <span style={{ fontWeight: 'var(--fw-semibold)' }}>Semibold 600</span>
          <span className="zd-label">Section label</span>
        </div>
        <div className="dg-numbers zd-num">
          <span>0:15</span>
          <span>1:45.0</span>
          <span>111</span>
          <span>88.8</span>
        </div>
      </section>

      <section className="dg-section" aria-labelledby="dg-space">
        <h2 id="dg-space" className="dg-h">
          Space, shape, elevation
        </h2>
        <div className="dg-space">
          {SPACE.map((s) => (
            <div key={s} className="dg-space-row">
              <code>{s}</code>
              <span className="dg-space-bar" style={{ width: `var(${s})` }} />
            </div>
          ))}
        </div>
        <div className="dg-row">
          {['--radius-sm', '--radius-md', '--radius-pill'].map((r) => (
            <div key={r} className="dg-radius" style={{ borderRadius: `var(${r})` }}>
              <code>{r}</code>
            </div>
          ))}
          <div className="dg-radius dg-float">
            <code>--shadow-float</code>
          </div>
        </div>
      </section>

      <section className="dg-section" aria-labelledby="dg-motion">
        <h2 id="dg-motion" className="dg-h">
          Motion
        </h2>
        <p className="dg-note">120 ms hover and press, 200 ms panels and tabs, 320 ms screens. Opacity and transform only; reduced motion keeps the fades and drops the travel.</p>
        <button type="button" className="zd-btn zd-btn--secondary" onClick={() => setMoved(!moved)}>
          Play motion
        </button>
        <div className="dg-motion">
          {['--dur-fast', '--dur-base', '--dur-slow'].map((d) => (
            <div key={d} className="dg-motion-row">
              <code>{d}</code>
              <span className="dg-motion-track">
                <span className="dg-motion-dot" style={{ transitionDuration: `var(${d})`, transform: moved ? 'translateX(var(--space-16))' : 'none', opacity: moved ? 1 : 0.5 }} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="dg-section" aria-labelledby="dg-icons">
        <h2 id="dg-icons" className="dg-h">
          Icons
        </h2>
        <p className="dg-note">24 px grid, 1.5 px stroke, round caps.</p>
        <div className="dg-icons">
          {ICON_NAMES.map((n) => (
            <div key={n} className="dg-icon">
              <Icon name={n} size="var(--icon-lg)" />
              <code>{n}</code>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
