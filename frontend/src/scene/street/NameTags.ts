// The TV's name tags (doc 06 §5, §8.7): each cottage labelled for its person, above its plate. Its own spans in
// #labels (the shared projected labels are capped at eight and the kerb's settle captions would evict them); placed
// once per render frame from the plate's projected position, like the other labels. Only the TV view mounts it.

import * as THREE from 'three';
import type { SceneBand, SceneContext, SceneEvent } from '../../app/App.ts';
import type { Frame } from '../../engine/source/EngineSource.ts';

export class NameTags implements SceneBand {
  readonly stage = 2 as const;
  readonly tags = new Map<number, { el: HTMLElement; world: THREE.Vector3 }>();
  private ctx!: SceneContext;
  private root: HTMLElement | null = null;
  private key = '';
  private a = 1;

  mount(ctx: SceneContext): void {
    this.ctx = ctx;
    this.root = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('#labels') : null;
  }

  onFrame(frame: Frame): void {
    const { store } = this.ctx;
    const houses = frame.state.nodes.filter((n) => n.stage === 'House');
    const key = `${store.layout.key}|${houses.map((n) => n.name).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    for (const t of this.tags.values()) t.el.remove();
    this.tags.clear();
    for (const n of houses) {
      const p = store.layout.plateOf(n.id);
      if (!p) continue;
      const el = typeof document !== 'undefined' ? document.createElement('span') : ({ remove() {}, style: {} } as unknown as HTMLElement);
      el.className = 'label nametag';
      el.textContent = n.name;
      this.root?.append(el);
      this.tags.set(n.id, { el, world: new THREE.Vector3(p.cx, p.top + 7.5, p.cz) });
    }
  }

  onEvent(_se: SceneEvent): void { /* names do not move */ }

  setAltitude(a: number): void { this.a = a; }

  animate(): void {
    const show = this.a >= 1.6 && this.a <= 3.4;
    for (const t of this.tags.values()) {
      const p = this.ctx.project(t.world);
      t.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      t.el.style.visibility = show && p.visible ? 'visible' : 'hidden';
    }
  }

  dispose(): void { for (const t of this.tags.values()) t.el.remove(); this.tags.clear(); }
}
