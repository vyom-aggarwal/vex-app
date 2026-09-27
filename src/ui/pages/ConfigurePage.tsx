import type { GameDefinition } from '../../engine/types';
import { CONFIG_SECTIONS, type ConfigSection } from '../chrome';
import type { Settings } from '../settings';
import { AudioSection, GraphicsSection } from './configure/AudioGraphicsSections';
import { ControlsSection } from './configure/ControlsSection';
import { MatchSection } from './configure/MatchSection';
import { RobotSection } from './configure/RobotSection';

export function ConfigurePage({
  def,
  section,
  settings,
  setSettings,
  onSection,
}: {
  def: GameDefinition;
  section: ConfigSection;
  settings: Settings;
  setSettings: (s: Settings) => void;
  onSection: (s: ConfigSection) => void;
}) {
  return (
    <div className="configure">
      <h1>Configure</h1>
      <div className="configure-body">
        <nav className="subnav" aria-label="Configure sections">
          {CONFIG_SECTIONS.map((s) => (
            <button key={s.id} className={s.id === section ? 'active' : ''} onClick={() => onSection(s.id)}>
              <b>{s.label}</b>
              <small>{s.sub}</small>
            </button>
          ))}
        </nav>
        <div className="configure-content">
          {section === 'robot' && <RobotSection key={def.id} def={def} settings={settings} setSettings={setSettings} />}
          {section === 'controls' && <ControlsSection settings={settings} setSettings={setSettings} />}
          {section === 'match' && <MatchSection def={def} settings={settings} setSettings={setSettings} />}
          {section === 'audio' && <AudioSection settings={settings} setSettings={setSettings} />}
          {section === 'graphics' && <GraphicsSection settings={settings} setSettings={setSettings} />}
        </div>
      </div>
    </div>
  );
}
