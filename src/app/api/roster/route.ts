import fs from 'node:fs';
import path from 'node:path';
import { normalizeRoster } from '@/lib/roster';
import { isLocalHost } from '@/server/guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/roster: config/roster.json, read on every page load so edits show without a rebuild. */
export async function GET(req: Request): Promise<Response> {
  if (!isLocalHost(req.headers.get('host'))) return new Response(null, { status: 403 });
  let raw: unknown = null;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'roster.json'), 'utf8'));
  } catch {
    // A missing or broken file gives the built-in team.
  }
  return Response.json({ agents: normalizeRoster(raw) });
}
