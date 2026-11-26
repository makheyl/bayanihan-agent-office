import { parseEvent, type HqEvent } from './event';
import type { RosterEntry } from './roster';
import { Simulator } from './simulator';
import { OfficeState } from './state/officeState';

/** How the office is being fed, for the top bar. */
export type Feed = 'Offline' | 'Listening' | 'Live' | 'Simulating';

/** Live events kept while paused, at most; the oldest go first past this. */
const QUEUE_MAX = 5000;
/** How often the views are told to redraw their text (the 3D scene reads the state every frame on its own). */
const EMIT_EVERY_MS = 200;

/**
 * Runs the office in the page: listens to the server's event stream, replays the log tail it sends, feeds live or
 * simulated events into OfficeState, and owns the Simulate / Pause / Reset buttons. Everything visual reads from
 * `state`. Ported from the Unity HQ's HqDirector.cs.
 */
export class Director {
  readonly state: OfficeState;
  simulating = false;
  paused = false;
  /** Events applied from the last replay. */
  replayed = 0;
  /** Live events received since the page opened. */
  received = 0;
  /** The event stream is open. */
  connected = false;
  /** Bumped on every redraw notice; React reads it through useSyncExternalStore. */
  version = 0;

  private readonly simulator: Simulator;
  private readonly now: () => number;
  private pausedAt = 0;
  /** Simulated time stops while paused. */
  private simClockOffset = 0;
  private queue: HqEvent[] = [];
  private source: EventSource | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastEmit = 0;
  private readonly listeners = new Set<() => void>();
  private readonly rebuiltListeners = new Set<() => void>();

  constructor(roster: RosterEntry[], options: { now?: () => number; seed?: number } = {}) {
    this.state = new OfficeState(roster);
    this.now = options.now ?? Date.now;
    this.simulator = new Simulator(options.seed ?? (Date.now() & 0x7fffffff));
  }

  /** Opens the stream (or starts Simulate) and the update loop. Call once; stop() undoes it. */
  start(simulate: boolean): void {
    if (simulate) this.setSimulate(true);
    else this.connect();
    this.timer = setInterval(() => this.update(this.now()), 100);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.disconnect();
  }

  /** React's subscribe for useSyncExternalStore. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** Reset or a Simulate switch rebuilt the state: views start fresh (responders back to their chairs). */
  onRebuilt(fn: () => void): () => void {
    this.rebuiltListeners.add(fn);
    return () => this.rebuiltListeners.delete(fn);
  }

  /** One step of the loop: apply simulated events, settle statuses, and tell the views a few times a second. */
  update(now: number): void {
    if (!this.paused) {
      if (this.simulating) {
        for (const e of this.simulator.update(now - this.simClockOffset)) {
          e.ts += this.simClockOffset;
          this.state.apply(e, now);
        }
      }
      this.state.tick(now);
    }
    if (now - this.lastEmit >= EMIT_EVERY_MS) this.emit();
  }

  /** How the top bar should describe the feed. */
  feed(now: number): Feed {
    if (this.simulating) return 'Simulating';
    if (!this.connected) return 'Offline';
    return now - this.state.lastEventMs < 60_000 ? 'Live' : 'Listening';
  }

  /** Live events waiting for Pause to be turned off. */
  get pending(): number {
    return this.queue.length;
  }

  /** Simulate on: an empty office plays the scripted demo. Off: back to the real log and live events. */
  setSimulate(on: boolean): void {
    this.simulating = on;
    this.state.reset();
    this.queue = [];
    this.simulator.restart();
    this.simClockOffset = 0;
    if (this.paused) this.pausedAt = this.now();
    if (on) this.disconnect();
    else this.connect();
    this.rebuilt();
  }

  /** Freezes the office. Live events queue up and are applied on resume. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    const now = this.now();
    if (paused) this.pausedAt = now;
    else {
      this.simClockOffset += now - this.pausedAt;
      const queued = this.queue;
      this.queue = [];
      for (const e of queued) this.state.apply(e, now);
    }
    this.emit();
  }

  /** Clears the office. Live mode starts empty and fills from the next event; Simulate starts its story again. */
  resetOffice(): void {
    this.state.reset();
    this.queue = [];
    if (this.simulating) {
      this.simulator.restart();
      this.simClockOffset = 0;
      if (this.paused) this.pausedAt = this.now();
    }
    this.rebuilt();
  }

  /** A live hook line from the stream. */
  receive(line: string): void {
    this.received++;
    if (this.simulating) return; // live events are in the log too; turning Simulate off replays them
    const e = parseEvent(line);
    if (!e) return;
    if (this.paused) {
      this.queue.push(e);
      if (this.queue.length > QUEUE_MAX) this.queue.shift();
      return;
    }
    this.state.apply(e, this.now());
  }

  /** The stream's opening replay: the log tail, applied to an empty office. */
  replay(events: HqEvent[]): void {
    if (this.simulating) return;
    this.state.reset();
    this.queue = [];
    const now = this.now();
    let n = 0;
    for (const raw of events) {
      const e = parseEvent(JSON.stringify(raw));
      if (!e || e.sim) continue;
      this.state.apply(e, now);
      n++;
    }
    this.replayed = n;
    this.rebuilt();
  }

  private connect(): void {
    if (this.source || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/stream');
    this.source = source;
    source.onopen = () => {
      this.connected = true;
      this.emit();
    };
    // EventSource reconnects on its own; each reconnect starts with a fresh replay.
    source.onerror = () => {
      this.connected = false;
      this.emit();
    };
    source.addEventListener('replay', msg => {
      try {
        const data = JSON.parse((msg as MessageEvent<string>).data) as { events?: HqEvent[] };
        this.connected = true;
        this.replay(Array.isArray(data.events) ? data.events : []);
      } catch {
        // A garbled replay leaves the office as it was.
      }
    });
    source.addEventListener('hq', msg => this.receive((msg as MessageEvent<string>).data));
  }

  private disconnect(): void {
    this.source?.close();
    this.source = null;
    this.connected = false;
  }

  private rebuilt(): void {
    for (const fn of this.rebuiltListeners) fn();
    this.emit();
  }

  private emit(): void {
    this.lastEmit = this.now();
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
