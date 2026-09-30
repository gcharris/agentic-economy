// Against engine/src/bin/serve.rs (ARCHITECTURE §3.2): EventSource on
// /events with named `hello`, `tick` and `lagged` events; one GET /state per
// tick (the tick frame carries report + events, no state); POST commands with
// ids as decimals on the path. 200 {"ok":true} → true; 404 → false ("already
// decided"); 400 → false plus a console error. drive: 'push': the server's
// --interval-ms is the clock.

import type { EngineEvent } from '../contract/events.ts';
import { idToString } from '../contract/ids.ts';
import type { EnvelopeId, NodeId, StateView, TickReport } from '../contract/state.ts';
import { Listeners, nowSeconds, type EngineSource, type Frame, type ScenarioName, type SourceHello, type SourceStatus } from './EngineSource.ts';

export const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8787';
/** serve's default --interval-ms. */
export const SERVE_INTERVAL_SECONDS = 0.7;

export function engineBaseUrl(): string {
  const env = (import.meta as { env?: { VITE_ENGINE_URL?: string } }).env;
  return (env?.VITE_ENGINE_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');
}

/** "context-engine 0.1.0 (native, tokio-multi-thread executor, scenario house, seed 7)" */
export function parseHello(text: string): { version: string; scenario: ScenarioName; seed: number | null } {
  const scenario = /scenario (house|street|city|country|world)/.exec(text)?.[1] as ScenarioName | undefined;
  const seedText = /seed (\d+)/.exec(text)?.[1];
  const seed = seedText !== undefined && Number(seedText) <= Number.MAX_SAFE_INTEGER ? Number(seedText) : null;
  return { version: text.trim(), scenario: scenario ?? 'house', seed };
}

export interface SseSourceOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  createEventSource?: (url: string) => EventSource;
}

interface TickPayload { report: TickReport; events: EngineEvent[] }

export class SseSource implements EngineSource {
  readonly kind = 'sse' as const;
  readonly drive = 'push' as const;
  readonly live = true as const;

  readonly baseUrl: string;
  private es: EventSource | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly frames$ = new Listeners<Frame>();
  private readonly status$ = new Listeners<SourceStatus>();
  private pendingEvents: EngineEvent[] = [];
  private lastTick = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly opts: SseSourceOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? engineBaseUrl()).replace(/\/$/, '');
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  start(): Promise<SourceHello> {
    this.status$.emit({ kind: 'connecting' });
    return new Promise<SourceHello>((resolve, reject) => {
      const url = `${this.baseUrl}/events`;
      const es = (this.opts.createEventSource ?? ((u) => new EventSource(u)))(url);
      this.es = es;
      let said = false;
      es.addEventListener('hello', (e) => {
        const text = String((e as MessageEvent).data ?? '');
        const { version, scenario, seed } = parseHello(text);
        this.status$.emit({ kind: 'streaming' });
        // A paused table and a reconnect after Friday still need their current frame.
        this.enqueue(async () => this.emit(await this.getState()));
        if (!said) { said = true; resolve({ version, scenario, seed, tickSeconds: SERVE_INTERVAL_SECONDS, recorded: false }); }
      });
      es.addEventListener('tick', (e) => {
        let payload: TickPayload;
        try { payload = JSON.parse(String((e as MessageEvent).data)) as TickPayload; } catch (err) { this.status$.emit({ kind: 'error', message: `bad tick frame: ${String(err)}` }); return; }
        this.enqueue(() => this.onTick(payload));
      });
      es.addEventListener('lagged', (e) => {
        let skipped = 0;
        try { skipped = Number((JSON.parse(String((e as MessageEvent).data)) as { skipped?: number }).skipped ?? 0); } catch { /* keep 0 */ }
        this.status$.emit({ kind: 'lagged', skipped });
        this.enqueue(() => this.onLagged());
      });
      es.onerror = () => {
        const message = `SSE connection to ${url} failed`;
        this.status$.emit({ kind: 'error', message });
        if (!said) { said = true; reject(new Error(message)); }
      };
    });
  }

  onFrame(cb: (f: Frame) => void): () => void { return this.frames$.add(cb); }
  onStatus(cb: (s: SourceStatus) => void): () => void { return this.status$.add(cb); }

  /** Push source: the server ticks. */
  step(): Promise<Frame | null> { return Promise.reject(new Error('SseSource is a push source; the server ticks')); }

  async pause(): Promise<void> { if (await this.post('/pause')) this.status$.emit({ kind: 'paused' }); }
  async resume(): Promise<void> { if (await this.post('/resume')) this.status$.emit({ kind: 'streaming' }); }
  authorize(envelope: EnvelopeId): Promise<boolean> { return this.post(`/authorize/${idToString(envelope)}`); }
  reject(envelope: EnvelopeId): Promise<boolean> { return this.post(`/reject/${idToString(envelope)}`); }
  topUp(node: NodeId, credits: number): Promise<boolean> { return this.post(`/top-up/${idToString(node)}/${String(credits)}`); }
  zoom(stage: 1 | 2 | 3 | 4 | 5): Promise<boolean> { return this.post(`/zoom/${stage}`); }
  answer(node: NodeId, offer: EnvelopeId, answer: 'send' | 'hire' | 'ask' | 'leave'): Promise<boolean> { return this.post(`/answer/${idToString(node)}/${idToString(offer)}/${answer}`); }
  close(node: NodeId): Promise<boolean> { return this.post(`/close/${idToString(node)}`); }
  sync(node: NodeId): Promise<boolean> { return this.post(`/sync/${idToString(node)}`); }

  dispose(): void {
    this.es?.close();
    this.es = null;
    this.frames$.clear(); this.status$.clear();
  }

  private enqueue(job: () => Promise<void>): void {
    this.chain = this.chain.then(job, job).catch((err: unknown) => {
      this.status$.emit({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    });
  }

  private async getState(): Promise<StateView> {
    const res = await this.fetchFn(`${this.baseUrl}/state`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`GET /state → ${res.status}`);
    return (await res.json()) as StateView;
  }

  /** A `tick` frame: events now, state from GET /state. Two ticks' events coalesce when the state ran ahead. */
  private async onTick(payload: TickPayload): Promise<void> {
    this.pendingEvents.push(...payload.events);
    const state = await this.getState();
    if (state.tick < payload.report.tick) return; // the state is behind the report: keep the events for the next frame
    this.emit(state);
  }

  /** `lagged`: one fresh GET /state; events since the last frame are whatever arrived (usually none). */
  private async onLagged(): Promise<void> {
    const state = await this.getState();
    if (state.tick > this.lastTick) this.emit(state);
  }

  private emit(state: StateView): void {
    const events = this.pendingEvents; this.pendingEvents = [];
    this.lastTick = state.tick;
    this.frames$.emit({ tick: state.tick, state, events, decisions: [], arrivedAt: nowSeconds() });
  }

  private async post(path: string): Promise<boolean> {
    let res: Response;
    try { res = await this.fetchFn(`${this.baseUrl}${path}`, { method: 'POST' }); }
    catch (err) { console.error(`POST ${path} failed`, err); return false; }
    if (res.status === 200) return true;
    if (res.status === 404) return false; // "no envelope held with that id": already decided, not an error dialog
    console.error(`POST ${path} → ${res.status}`, await res.text().catch(() => ''));
    return false;
  }
}
