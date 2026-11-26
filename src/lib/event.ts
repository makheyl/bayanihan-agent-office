/**
 * One line of .claude/office/events.jsonl, as written by .claude/office/hook.mjs. The field names are short because every
 * tool call writes one. Ported from the Unity HQ's HqEvent.cs.
 */
export interface HqEvent {
  /** Unix time in milliseconds when the hook ran. */
  ts: number;
  /** Claude Code session id. */
  sid?: string;
  /** Hook event name, e.g. PreToolUse, SubagentStart, PermissionRequest. */
  ev: string;
  /** Roster key of the desk this belongs to (e.g. "lead", "qa-tester"). */
  agent: string;
  /** How the desk was chosen: agent, spawn, path, cmd or lead. */
  via?: string;
  /** A built-in helper subagent (e.g. Explore) whose work was routed to this desk. */
  sub?: string;
  /** Opaque subagent id, so two runs of the same role can be told apart. */
  aid?: string;
  /** Opaque tool-use id, used to pair PreToolUse with PostToolUse. */
  tuid?: string;
  tool?: string;
  /** Project-relative path, e.g. Game/Assets/Scripts/SimpleBoat.cs. */
  file?: string;
  /** At most 100 characters, already redacted by the hook. */
  preview?: string;
  /** True on PostToolUse, false on PostToolUseFailure. */
  ok?: boolean;
  /** The failure was the user interrupting, not an error. */
  intr?: boolean;
  /** For Agent calls: the subagent type the work was handed to. */
  to?: string;
  /** For Notification: notification_type. */
  kind?: string;
  task?: HqTaskInfo;
  todos?: HqTaskInfo[];
  /** Made by Simulate mode. Never sent to the server or written to the log. */
  sim?: boolean;
}

/** A task or todo item as the hook sends it: an id (tasks only), its text and its state. */
export interface HqTaskInfo {
  id?: string;
  text?: string;
  status?: string;
}

/** The main Claude Code session's desk key. */
export const LEAD_KEY = 'lead';

const STRING_FIELDS = ['sid', 'ev', 'agent', 'via', 'sub', 'aid', 'tuid', 'tool', 'file', 'preview', 'to', 'kind'] as const;

/** Parses one JSON line. Returns null for blank or broken lines instead of throwing. */
export function parseEvent(line: string | null | undefined): HqEvent | null {
  if (!line || !line.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  return toEvent(raw);
}

/**
 * Builds an event from parsed JSON, keeping only fields of the right type, so a hand-edited or foreign line can never put
 * an object where the office expects text.
 */
export function toEvent(raw: unknown): HqEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.ev !== 'string' || !o.ev) return null;
  const e: HqEvent = { ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : 0, ev: o.ev, agent: LEAD_KEY };
  for (const key of STRING_FIELDS) {
    const v = o[key];
    if (typeof v === 'string' && v) (e as unknown as Record<string, unknown>)[key] = v;
  }
  if (!e.agent) e.agent = LEAD_KEY;
  if (typeof o.ok === 'boolean') e.ok = o.ok;
  if (o.intr === true) e.intr = true;
  if (o.sim === true) e.sim = true;
  const task = toTask(o.task);
  if (task) e.task = task;
  if (Array.isArray(o.todos)) {
    const todos = o.todos.map(toTask).filter((t): t is HqTaskInfo => t !== null);
    if (todos.length) e.todos = todos.slice(0, 20);
  }
  return e;
}

function toTask(raw: unknown): HqTaskInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const t: HqTaskInfo = {};
  if (typeof o.id === 'string' && o.id) t.id = o.id;
  else if (typeof o.id === 'number') t.id = String(o.id);
  if (typeof o.text === 'string' && o.text) t.text = o.text;
  if (typeof o.status === 'string' && o.status) t.status = o.status;
  return isTaskEmpty(t) ? null : t;
}

/** A task with no id, text or status carries nothing. */
export function isTaskEmpty(t: HqTaskInfo | null | undefined): boolean {
  return !t || (!t.id && !t.text && !t.status);
}

/** The file name without folders, for bubbles and cards. */
export function fileName(e: HqEvent): string {
  return e.file ? e.file.slice(e.file.lastIndexOf('/') + 1) : '';
}

/** A short "Edit → SimpleBoat.cs" style line for bubbles, monitors and the log. */
export function summary(e: HqEvent): string {
  const target = e.file ? fileName(e) : e.preview ?? '';
  if (!e.tool) return e.preview ? `${e.ev}: ${e.preview}` : e.ev;
  return target ? `${e.tool} → ${target}` : e.tool;
}
