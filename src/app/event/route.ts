import { parseEvent } from '@/lib/event';
import { MAX_EVENT_BYTES, isJson, isLocalHost } from '@/server/guard';
import { getHub } from '@/server/hub';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /event: one hook line from .claude/office/hook.mjs, passed on to every open page. The hook has already written the
 * same line to events.jsonl, so nothing is stored here.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isLocalHost(req.headers.get('host'))) return new Response(null, { status: 403 });
  if (!isJson(req.headers.get('content-type'))) return new Response(null, { status: 415 });
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_EVENT_BYTES) return new Response(null, { status: 413 });
  const text = (await req.text()).trim();
  if (text.length > MAX_EVENT_BYTES) return new Response(null, { status: 413 });
  const e = parseEvent(text);
  if (!e || e.sim) return new Response(null, { status: 400 });
  getHub().push(text);
  return new Response(null, { status: 204 });
}
