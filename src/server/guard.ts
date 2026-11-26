/** The port the hook POSTs to (PORT in .claude/office/hook.mjs). */
export const HQ_PORT = 47821;

/**
 * True when a request was addressed to this machine by name: localhost or 127.0.0.1 (any port, so `next dev` on another
 * port still works). A web page elsewhere that points a DNS name at 127.0.0.1 (DNS rebinding) sends its own host name, so
 * it is refused.
 */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]';
}

/** POST /event takes only JSON, so a form on another site (a "simple" cross-origin request) can't post to it. */
export function isJson(contentType: string | null | undefined): boolean {
  return !!contentType && contentType.toLowerCase().split(';')[0].trim() === 'application/json';
}

/** Hook lines are a few hundred bytes; anything this big is not from the hook. */
export const MAX_EVENT_BYTES = 64 * 1024;
