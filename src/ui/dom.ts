export type Child = Node | string | number | null | undefined | false;

/**
 * Tiny element builder. Children are appended before props are applied, so a <select>'s
 * `value` can be set in props. `on*` function props become event listeners, `class` sets className.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  if (props) {
    for (const [key, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2), v as EventListener);
      else if (key === 'class') el.className = String(v);
      else if (key in el) (el as unknown as Record<string, unknown>)[key] = v;
      else el.setAttribute(key, v === true ? '' : String(v));
    }
  }
  return el;
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
