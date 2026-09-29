// Altitude input (ARCHITECTURE §8): wheel and pinch → A (0.15 per notch); `[` / `]` → ±1 band. Live sources only:
// a recorded run cannot answer zoom/<n>, so its camera stays at the scale the recording simulated.

import type { AltitudeRig } from './AltitudeRig.ts';

export function bindAltitudeInput(el: HTMLElement, rig: AltitudeRig): () => void {
  const wheel = (e: WheelEvent) => { e.preventDefault(); rig.nudge(Math.sign(e.deltaY) * 0.15); };
  const key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    if (e.key === ']') rig.setBand(Math.min(5, rig.band + 1) as 1 | 2 | 3 | 4 | 5);
    if (e.key === '[') rig.setBand(Math.max(1, rig.band - 1) as 1 | 2 | 3 | 4 | 5);
  };
  el.addEventListener('wheel', wheel, { passive: false });
  addEventListener('keydown', key);
  return () => { el.removeEventListener('wheel', wheel); removeEventListener('keydown', key); };
}
