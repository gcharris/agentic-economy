// Projected labels (ARCHITECTURE §4.5): bands emit `label` on the bus; the DOM draws the glyph (the canvas draws
// none). At most eight live at once; per render frame only their `transform` is written.

import type * as THREE from 'three';
import type { SceneBus } from '../engine/store/bus.ts';

export const LABEL_CAP = 8;

interface Live { el: HTMLElement; world: THREE.Vector3; until: number }

export class Labels {
  private readonly live = new Map<string, Live>();
  private readonly off: () => void;

  constructor(private readonly root: HTMLElement | null, bus: SceneBus, private readonly now: () => number,
    private readonly project: (p: THREE.Vector3) => { x: number; y: number; visible: boolean }) {
    this.off = bus.on('label', (l) => {
      if ('remove' in l) { this.drop(l.id); return; }
      if (!this.root) return;
      if (this.live.size >= LABEL_CAP && !this.live.has(l.id)) this.drop(this.live.keys().next().value!);
      const el = this.live.get(l.id)?.el ?? document.createElement('span');
      el.className = `label ${l.kind}`;
      el.textContent = l.text;
      this.root.append(el);
      this.live.set(l.id, { el, world: l.world.clone(), until: this.now() + l.ttl });
    });
  }

  /** Per render frame: place, and expire. */
  frame(t: number): void {
    for (const [id, l] of this.live) {
      if (t > l.until) { this.drop(id); continue; }
      const p = this.project(l.world);
      l.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      l.el.style.visibility = p.visible ? 'visible' : 'hidden';
    }
  }

  get count(): number { return this.live.size; }
  private drop(id: string): void { this.live.get(id)?.el.remove(); this.live.delete(id); }
  dispose(): void { this.off(); for (const id of [...this.live.keys()]) this.drop(id); }
}
