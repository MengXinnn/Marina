import { useEffect, useRef, useState } from 'react';

const TICK_MS = 420;

/** A number that rolls to its new value, flashing green when it grows and red when it shrinks. */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setFlash(value > start ? 'up' : 'down');
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / TICK_MS);
      const v = Math.round(start + (value - start) * k);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else setFlash('');
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={`${className} ${flash ? `count-${flash}` : ''}`}>{shown}</span>;
}
