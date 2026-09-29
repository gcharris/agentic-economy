// For `drive: 'pull'` sources the app owns time (ARCHITECTURE §3.4):
// `source.step()` every tickSeconds / speed on a setTimeout chain re-armed
// after each frame resolves (never overlapping; no requestAnimationFrame).

import type { EngineSource, Frame } from './EngineSource.ts';

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 8;
/** Seconds per tick by band: the 16-tick heartbeat reads as 19 s in the room and 4 s in orbit. */
export const TICK_SECONDS_BY_BAND: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 1.2, 2: 0.7, 3: 0.4, 4: 0.3, 5: 0.25 };

export interface TickClockOptions {
  tickSeconds?: number;
  speed?: number;
  /** Called with every frame step() produced (in addition to the source's own onFrame listeners). */
  onFrame?: (f: Frame) => void;
  /** Called when the source returned null (a trace is over). */
  onEnd?: () => void;
  /** Injectable timers for tests. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export class TickClock {
  running = false;
  speed: number;
  tickSeconds: number;
  private handle: unknown = null;
  private busy = false;
  private readonly setT: (cb: () => void, ms: number) => unknown;
  private readonly clearT: (handle: unknown) => void;

  constructor(readonly source: EngineSource, private readonly opts: TickClockOptions = {}) {
    if (source.drive !== 'pull') throw new Error('TickClock drives pull sources only; a push source ticks itself');
    this.tickSeconds = opts.tickSeconds ?? TICK_SECONDS_BY_BAND[1];
    this.speed = clampSpeed(opts.speed ?? 1);
    this.setT = opts.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearT = opts.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Milliseconds between steps at the current speed. */
  get intervalMs(): number { return (this.tickSeconds / this.speed) * 1000; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.arm(0);
  }

  pause(): void {
    this.running = false;
    this.disarm();
  }

  /** One tick now, whether running or not; never overlaps a tick in flight. */
  async stepOnce(): Promise<Frame | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const f = await this.source.step();
      if (f) this.opts.onFrame?.(f);
      else { this.running = false; this.disarm(); this.opts.onEnd?.(); }
      return f;
    } finally {
      this.busy = false;
    }
  }

  /** Speed rescales the schedule (and, in the app, uTickSeconds together). */
  setSpeed(speed: number): void {
    this.speed = clampSpeed(speed);
    if (this.running) this.rearm();
  }

  /** Per-band tick seconds (bands.ts); the schedule follows on the next arm. */
  setTickSeconds(seconds: number): void {
    this.tickSeconds = Math.max(0.01, seconds);
    if (this.running) this.rearm();
  }

  dispose(): void { this.pause(); }

  private arm(ms: number): void {
    this.disarm();
    this.handle = this.setT(() => { void this.fire(); }, ms);
  }
  private rearm(): void { if (!this.busy) this.arm(this.intervalMs); }
  private disarm(): void { if (this.handle !== null) { this.clearT(this.handle); this.handle = null; } }

  private async fire(): Promise<void> {
    this.handle = null;
    if (!this.running) return;
    await this.stepOnce();
    if (this.running) this.arm(this.intervalMs);
  }
}

export const clampSpeed = (s: number): number => Math.min(SPEED_MAX, Math.max(SPEED_MIN, s || 1));
