/** Something listening for live event lines: one open page's stream. */
export type Subscriber = (line: string) => void;

export interface Hub {
  readonly subscribers: Set<Subscriber>;
  /** Event lines received over POST /event since the server started. */
  received: number;
  readonly startedAt: number;
  /** Sends one live line to every open page. */
  push(line: string): void;
}

function createHub(): Hub {
  const subscribers = new Set<Subscriber>();
  return {
    subscribers,
    received: 0,
    startedAt: Date.now(),
    push(line: string) {
      this.received++;
      for (const fn of subscribers) {
        try {
          fn(line);
        } catch {
          // A page that went away mid-send is dropped by its own stream's cleanup.
        }
      }
    },
  };
}

/**
 * The one hub in the server process. Next.js bundles each route on its own, so a plain module-level variable would give
 * POST /event and GET /api/stream different hubs; globalThis is shared by all of them.
 */
export function getHub(): Hub {
  const g = globalThis as typeof globalThis & { __bayanihanHqHub?: Hub };
  g.__bayanihanHqHub ??= createHub();
  return g.__bayanihanHqHub;
}
