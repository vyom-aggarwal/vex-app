import type { Sim } from '../engine/sim';
import type { WorldInfo } from '../render/renderer';

/** What the renderer needs from a sim: piece kinds/visibility and robot specs. */
export function worldInfoOf(sim: Sim): WorldInfo {
  return {
    objects: sim.state.objects.map((o) => ({ kind: o.kind, pin: o.pin, hidden: o.loc === 'supply' || (o.loc === 'loader' && !sim.state.loaders.some((l) => l.presented === o.id) && o.base < 0) })),
    robots: sim.state.robots.map((r) => ({ spec: sim.specs[r.index], alliance: r.alliance })),
  };
}
