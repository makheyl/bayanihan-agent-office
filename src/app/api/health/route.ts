import fs from 'node:fs';
import { isLocalHost } from '@/server/guard';
import { getHub } from '@/server/hub';
import { defaultLogPath } from '@/server/replay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/health: is the HQ server up, and is it reading the hook's log. Used by scripts/serve.mjs and the README. */
export async function GET(req: Request): Promise<Response> {
  if (!isLocalHost(req.headers.get('host'))) return new Response(null, { status: 403 });
  const hub = getHub();
  return Response.json({
    app: 'bayanihan-hq',
    ok: true,
    pid: process.pid,
    upSeconds: Math.round((Date.now() - hub.startedAt) / 1000),
    pages: hub.subscribers.size,
    received: hub.received,
    logFound: fs.existsSync(defaultLogPath()),
  });
}
