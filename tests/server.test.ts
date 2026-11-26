import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/event/route';
import { GET as stream } from '@/app/api/stream/route';
import { isJson, isLocalHost } from '@/server/guard';
import { getHub } from '@/server/hub';

const line = '{"ts":1795622605323,"sid":"s","ev":"PreToolUse","agent":"audio","tool":"Read","tuid":"t1"}';

function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request('http://127.0.0.1:47821/event', {
      method: 'POST',
      body,
      headers: { host: '127.0.0.1:47821', 'content-type': 'application/json', ...headers },
    }),
  );
}

afterEach(() => {
  getHub().subscribers.clear();
  delete process.env.HQ_EVENT_LOG;
});

describe('request guard', () => {
  it('accepts only this machine by name', () => {
    expect(isLocalHost('127.0.0.1:47821')).toBe(true);
    expect(isLocalHost('localhost:47821')).toBe(true);
    expect(isLocalHost('evil.example.com')).toBe(false);
    expect(isLocalHost('127.0.0.1.nip.io:47821')).toBe(false);
    expect(isLocalHost(null)).toBe(false);
  });

  it('accepts only JSON bodies', () => {
    expect(isJson('application/json')).toBe(true);
    expect(isJson('application/json; charset=utf-8')).toBe(true);
    expect(isJson('text/plain')).toBe(false);
  });
});

describe('POST /event', () => {
  it('passes a hook line to every open page', async () => {
    const got: string[] = [];
    getHub().subscribers.add(l => got.push(l));
    const res = await post(line);
    expect(res.status).toBe(204);
    expect(got).toEqual([line]);
  });

  it('refuses other hosts, other content types, junk and simulated events', async () => {
    expect((await post(line, { host: 'evil.example.com' })).status).toBe(403);
    expect((await post(line, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post('not json')).status).toBe(400);
    expect((await post('{"ev":"Stop","sim":true}')).status).toBe(400);
    expect((await post('x'.repeat(70 * 1024))).status).toBe(413);
  });
});

describe('GET /api/stream', () => {
  it('replays the log tail first and never sends a live line twice', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqstream-'));
    const log = path.join(dir, 'events.jsonl');
    fs.writeFileSync(log, line + '\n');
    process.env.HQ_EVENT_LOG = log;
    const controller = new AbortController();
    const res = await stream(new Request('http://127.0.0.1:47821/api/stream', { headers: { host: '127.0.0.1:47821' }, signal: controller.signal }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first.startsWith('event: replay\n')).toBe(true);
    expect(JSON.parse(first.split('data: ')[1]).events).toHaveLength(1);

    const next = '{"ts":1795622606000,"sid":"s","ev":"PostToolUse","agent":"audio","tool":"Read","tuid":"t1"}';
    getHub().push(next);
    const second = new TextDecoder().decode((await reader.read()).value);
    expect(second).toBe(`event: hq\ndata: ${next}\n\n`);
    controller.abort();
    expect(getHub().subscribers.size).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
