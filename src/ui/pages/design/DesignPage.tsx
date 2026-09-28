import type { Settings } from '../../settings';
import { SegmentedControl } from '../../components';
import { ComponentsSection } from './ComponentsSection';
import { TokensSection } from './TokensSection';

/** /design: the whole design system on one page. Not linked from the main navigation. */
export function DesignPage({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  return (
    <div className="dg" data-nav-scope="page" id="zd-main">
      <header className="dg-head">
        <div>
          <span className="zd-label">ZDrive design system</span>
          <h1>Style guide</h1>
        </div>
        <div className="dg-row">
          <SegmentedControl
            label="Theme"
            value={settings.theme === 'light' ? 'light' : 'dark'}
            onChange={(v) => setSettings({ ...settings, theme: v })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <SegmentedControl
            label="Palette"
            value={settings.palette}
            onChange={(v) => setSettings({ ...settings, palette: v })}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'colorblind', label: 'Colorblind' },
            ]}
          />
        </div>
      </header>
      <TokensSection />
      <ComponentsSection />
    </div>
  );
}
