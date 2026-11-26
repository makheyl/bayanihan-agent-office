import { isLocalHost } from '@/server/guard';
import { getHub } from '@/server/hub';
import { defaultLogPath, readTail } from '@/server/replay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 15000;

/**
 * GET /api/stream: Server-Sent Events for one page. It first sends "replay" (the log tail, read fresh, so the office is up
 * to date even if the page opened after the session began), then each live event as "hq". It subscribes before reading
 * the log, and a live line that the replay already holds is not sent again.
 */
export async function GET(req: Request): Promise<Response> {
  if (!isLocalHost(req.headers.get('host'))) return new Response(null, { status: 403 });
  const hub = getHub();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: string) => write(`event: ${event}\ndata: ${data}\n\n`);

      const pending: string[] = [];
      let ready = false;
      const subscriber = (line: string) => (ready ? send('hq', line) : pending.push(line));
      hub.subscribers.add(subscriber);

      const logPath = defaultLogPath();
      const tail = readTail(logPath);
      send('replay', JSON.stringify({ events: tail.events, received: hub.received }));
      for (const line of pending) if (!tail.lines.has(line)) send('hq', line);
      ready = true;

      const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
      cleanup = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        hub.subscribers.delete(subscriber);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
