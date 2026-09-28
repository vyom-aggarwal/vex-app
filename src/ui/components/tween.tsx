import { useEffect, useRef, useState } from 'react';
import { reducedMotion, tokenMs } from '../appearance';

/**
 * Tween a number toward `target` (ease-out over --dur-fast by default). Jumps straight to the value
 * under reduced motion or when disabled.
 */
export function useTween(target: number, enabled = true, durationToken = '--dur-fast'): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (!enabled || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
      cur.current = target;
      setShown(target);
      return;
    }
    const dur = tokenMs(durationToken, 120);
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (target - from.current) * e;
      setShown(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationToken]);
  return enabled ? shown : target;
}

/** A tweening integer (scores). */
export function TweenNumber({ value, decimals = 0, durationToken }: { value: number; decimals?: number; durationToken?: string }) {
  const v = useTween(value, true, durationToken);
  return <>{v.toFixed(decimals)}</>;
}
