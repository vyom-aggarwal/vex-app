import { useEffect, useRef, useState } from 'react';
import type { GameDefinition } from '../engine/types';
import type { ZRenderer } from '../render/renderer';
import { reducedMotion, tokenMs } from './appearance';
import { ambientWorld, applyPalette, attachCanvas, getRenderer, ownsCanvas } from './host';
import { resolveQuality } from './quality';
import type { Settings } from './settings';

/**
 * The live 3D field behind every menu. It never unmounts: the shared canvas lives here whenever the
 * builder, a match or a replay isn't using it, slowly orbiting the selected game's field (still
 * under reduced motion). Switching games crossfades.
 */
export function Backdrop({ def, settings, strong, onError }: { def: GameDefinition | null; settings: Settings; strong: boolean; onError: (e: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const rRef = useRef<ZRenderer | null>(null);
  const shown = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const want = useRef(def);
  want.current = def;

  // Load (or reload after another owner hands the canvas back) the ambient world of the wanted game.
  const setup = useRef(async () => {});
  setup.current = async () => {
    const r = rRef.current;
    const d = want.current;
    if (!r || !d) return;
    const w = await ambientWorld(d);
    if (want.current !== d || !ownsCanvas(host.current)) return;
    applyPalette(r);
    r.alliance = 'red';
    r.loadGame(d);
    r.setWorld(w.info);
    r.applyPoses(w.poses, w.poses, 1);
    r.beginAmbient();
    r.renderAmbient(0);
    shown.current = d.id;
    setVisible(true);
  };

  useEffect(() => {
    let live = true;
    let raf = 0;
    let release = () => {};
    getRenderer(resolveQuality(settings.quality))
      .then((r) => {
        if (!live || !host.current) return;
        rRef.current = r;
        release = attachCanvas(r, host.current, () => {
          shown.current = null;
          void setup.current();
        });
        void setup.current();
        let last = performance.now();
        let acc = 0;
        const frame = (now: number) => {
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          acc += dt;
          // ~30 fps is plenty for a slow orbit, and leaves the GPU alone.
          if (acc >= 1 / 30 && ownsCanvas(host.current) && shown.current && !document.hidden) {
            r.renderAmbient(reducedMotion() ? 0 : acc);
            acc = 0;
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      })
      .catch((e: unknown) => onError((e as Error)?.message || String(e)));
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      release();
    };
    // The renderer is a singleton; quality changes are applied by the views that use it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Game switch: fade out, swap the field, fade back in.
  useEffect(() => {
    if (!def || shown.current === def.id) return;
    if (!shown.current) {
      void setup.current();
      return;
    }
    setVisible(false);
    const t = setTimeout(() => void setup.current(), tokenMs('--dur-base', 200));
    return () => clearTimeout(t);
  }, [def]);

  // Palette or theme changes recolor the scene.
  useEffect(() => {
    shown.current = null;
    const t = setTimeout(() => void setup.current(), 0);
    return () => clearTimeout(t);
  }, [settings.palette, settings.theme]);

  return (
    <div className={`zd-backdrop${visible ? ' is-visible' : ''}${strong ? ' is-strong' : ''}`} aria-hidden="true">
      <div className="zd-backdrop-canvas" ref={host} />
      <div className="zd-backdrop-scrim" />
    </div>
  );
}
