/**
 * Minimal client router: pushState navigation that remembers each entry's scroll position and
 * focused control, so Back returns to the previous screen exactly as it was left.
 */

export interface NavState {
  depth: number;
  scroll?: number;
  focus?: number;
}

const state = (): NavState => (history.state as NavState | null) ?? { depth: 0 };

/** Index of the focused control among the page's focusables (for restoring focus on Back). */
function focusIndex(): number | undefined {
  const main = document.getElementById('zd-main');
  const el = document.activeElement;
  if (!main || !el || !main.contains(el)) return undefined;
  const list = [...main.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]')];
  const i = list.indexOf(el as HTMLElement);
  return i >= 0 ? i : undefined;
}

/** Save the current screen's scroll and focus into its history entry (before leaving it). */
export function rememberView(): void {
  history.replaceState({ ...state(), scroll: window.scrollY, focus: focusIndex() } satisfies NavState, '');
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (location.pathname + location.search !== to) {
    rememberView();
    const cur = state();
    const next: NavState = { depth: opts.replace ? cur.depth : cur.depth + 1 };
    if (opts.replace) history.replaceState(next, '', to);
    else history.pushState(next, '', to);
  }
  window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
}

/** Go back one screen: browser history when we have some, otherwise the given parent route. */
export function back(parent: string): void {
  if (state().depth > 0) history.back();
  else navigate(parent, { replace: true });
}

/** After a screen renders from a Back/Forward, restore its scroll and focus. */
export function restoreView(): void {
  const s = state();
  window.scrollTo(0, s.scroll ?? 0);
  if (s.focus === undefined) return;
  const main = document.getElementById('zd-main');
  const list = main ? [...main.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]')] : [];
  list[s.focus]?.focus({ preventScroll: true });
}
