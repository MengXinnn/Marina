import { useEffect, useRef } from 'react';

const MARGIN = 8;
/** Room between the anchor point and a card moved beside or below it. */
const GAP = 26;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** HUD panels the cards must not hide behind (the HUD is stacked above the canvas). */
function hudBoxes(): Box[] {
  return [...document.querySelectorAll('.hud > .panel')].map((el) => el.getBoundingClientRect());
}

/**
 * Keep an in-scene DOM card readable: it normally sits above its anchor; when that would run
 * off screen or under a HUD panel it moves below, left or right of the anchor instead, then is
 * clamped into the viewport. The anchor follows a world point (the camera can orbit), so this
 * re-checks every frame and moves the card with `translate`.
 */
export function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    let shift = { x: 0, y: 0 };
    let raf = 0;
    let frame = 0;
    let hud: Box[] = [];
    const fit = () => {
      raf = requestAnimationFrame(fit);
      const el = ref.current;
      if (!el) return;
      if (frame++ % 20 === 0) hud = hudBoxes();
      const r = el.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      // Natural box: above the anchor, bottom-centred on it.
      const left = r.left - shift.x;
      const top = r.top - shift.y;
      const candidates = [
        { x: 0, y: 0 },
        { x: 0, y: h + GAP },
        { x: -(w / 2 + GAP), y: h / 2 },
        { x: w / 2 + GAP, y: h / 2 },
      ];
      let best = { x: 0, y: 0, score: Infinity };
      for (const c of candidates) {
        const box = {
          left: left + c.x,
          top: top + c.y,
          right: left + c.x + w,
          bottom: top + c.y + h,
        };
        let x = c.x;
        let y = c.y;
        if (box.left < MARGIN) x += MARGIN - box.left;
        else if (box.right > innerWidth - MARGIN) x -= box.right - (innerWidth - MARGIN);
        if (box.top < MARGIN) y += MARGIN - box.top;
        else if (box.bottom > innerHeight - MARGIN) y -= box.bottom - (innerHeight - MARGIN);
        const placed = { left: left + x, top: top + y, right: left + x + w, bottom: top + y + h };
        const covered = hud.reduce((s, b) => s + overlap(placed, b), 0);
        // Prefer the natural spot; clamping counts a little, hiding under the HUD a lot.
        const score = covered * 4 + Math.abs(x - c.x) + Math.abs(y - c.y);
        if (score < best.score - 1) best = { x, y, score };
      }
      if (best.x !== shift.x || best.y !== shift.y) {
        shift = { x: best.x, y: best.y };
        el.style.translate = `${shift.x}px ${shift.y}px`;
        // The little pointer no longer points at the anchor once the card has moved.
        el.classList.toggle('shifted', shift.x !== 0 || shift.y !== 0);
      }
    };
    raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, []);
  return ref;
}
