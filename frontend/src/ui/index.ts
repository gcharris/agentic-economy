// The ui lane's UiLayer: the Door, the HUD and the Note, patched once per frame in reduce().

import type { App } from '../app/App.ts';
import type { Frame } from '../engine/source/EngineSource.ts';
import type { UiLayer, Store } from '../engine/store/Store.ts';
import { DoorDialog } from './door.ts';
import { Hud } from './hud.ts';
import { NoteCard } from './note.ts';

export function createUi(app: App, root: ParentNode): UiLayer {
  const live = app.source.live;
  const command = app.command.bind(app);
  const door = new DoorDialog({ root, live, command, locate: () => app.doorScreen() });
  const note = new NoteCard({ root, live, command });
  const clock = app.clock;
  const hud = new Hud({
    root, source: app.source,
    zoom: (band) => app.rig.setBand(band), // the rig crosses the band edge and asks the engine once
    controls: clock ? {
      run: () => clock.start(), pause: () => clock.pause(), step: () => { void clock.stepOnce(); },
      speed: (x) => clock.setSpeed(x), running: () => clock.running,
    } : undefined,
  });
  const banner = root.querySelector<HTMLElement>('#banner');
  if (banner && !live) banner.textContent = 'Recorded run · the person’s answers replay at the recorded ticks';
  return {
    apply(frame: Frame, store: Store) {
      hud.apply(frame, store);
      door.apply(frame.state, store);
      note.apply(store);
    },
  };
}
