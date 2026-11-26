import fs from 'node:fs';
import path from 'node:path';
import { parseEvent, type HqEvent } from '../lib/event';

/** How much of the log is read for each new page: the office only needs recent history, and the log can be 5 MB. */
export const REPLAY_BYTES = 512 * 1024;
/** Only events this close to the newest one are replayed. */
export const REPLAY_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * The log the hook writes: ~/Documents/Bayanihan/.claude/office/events.jsonl, one folder above HQ. HQ_EVENT_LOG overrides
 * it (the tests use that).
 */
export function defaultLogPath(): string {
  return process.env.HQ_EVENT_LOG || path.resolve(process.cwd(), '..', '.claude', 'office', 'events.jsonl');
}

export interface Tail {
  /** The events to replay, oldest first. */
  events: HqEvent[];
  /** Every line that was read, so a live event already in the replay isn't sent twice. */
  lines: Set<string>;
}

/**
 * Events from the last maxBytes of the log (and the rotated events.1.jsonl if the log is short), keeping only those within
 * windowMs of the newest one, oldest first. Ported from the Unity HQ's HqReplay.cs.
 */
export function readTail(logPath: string, maxBytes = REPLAY_BYTES, windowMs = REPLAY_WINDOW_MS): Tail {
  const lines: string[] = [];
  const rotated = path.join(path.dirname(logPath), path.basename(logPath, '.jsonl') + '.1.jsonl');
  const mainSize = fileSize(logPath);
  if (mainSize < maxBytes && fs.existsSync(rotated)) lines.push(...tailLines(rotated, maxBytes - mainSize));
  if (mainSize > 0) lines.push(...tailLines(logPath, maxBytes));

  const events: HqEvent[] = [];
  for (const line of lines) {
    const e = parseEvent(line);
    if (e && !e.sim) events.push(e);
  }
  // Async hooks can land a few milliseconds out of order; sort (stable), then drop anything older than the window.
  events.sort((a, b) => a.ts - b.ts);
  const newest = events.length ? events[events.length - 1].ts : 0;
  return { events: events.filter(e => e.ts >= newest - windowMs), lines: new Set(lines) };
}

/** The complete lines in the last maxBytes of a file. The first, probably cut, line is dropped. */
export function tailLines(file: string, maxBytes: number): string[] {
  if (maxBytes <= 0) return [];
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    let read = 0;
    while (read < buffer.length) {
      const n = fs.readSync(fd, buffer, read, buffer.length - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    const parts = buffer.toString('utf8', 0, read).split('\n');
    const out: string[] = [];
    parts.forEach((part, i) => {
      if (i === 0 && start > 0) return;
      const line = part.trim();
      if (line) out.push(line);
    });
    return out;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}
