import { LEAD_KEY, type HqEvent } from '../event';
import type { RosterEntry } from '../roster';

/** What a desk is doing right now. */
export type AgentStatus = 'Idle' | 'Thinking' | 'Working' | 'Waiting' | 'Error' | 'Done';

export const ALL_STATUSES: AgentStatus[] = ['Idle', 'Thinking', 'Working', 'Waiting', 'Error', 'Done'];

/**
 * One desk's live state. OfficeState writes the inputs (flags and timers) from events; the status itself is always worked
 * out from them in OfficeState.tick, so a lost event can only leave a timer to run out, never a desk stuck in the wrong
 * state.
 */
export class AgentState {
  static readonly RecentMax = 20;

  readonly entry: RosterEntry;

  status: AgentStatus = 'Idle';
  /** When the current status started (Unix ms). */
  statusSince = 0;

  /** The job it was handed (the Agent tool's description). */
  currentTask = '';
  tool = '';
  file = '';
  preview = '';
  /** The last tool line, e.g. "Edit → SimpleBoat.cs", for bubbles and monitors. */
  activity = '';
  /** A built-in helper (e.g. Explore) whose work is shown at this desk. */
  helper = '';
  /** Why it is waiting: permission, permission_prompt, idle_prompt... */
  waitingKind = '';

  toolCount = 0;
  readonly filesTouched = new Set<string>();
  /** The last 20 events at this desk, oldest first. */
  readonly recent: HqEvent[] = [];

  /** Has done anything this session; desks with no one at them stay empty until then (the lead always sits). */
  present = false;
  /** When a subagent of this role was last started (Unix ms), for the walk-in from the entrance. */
  spawnedAt = 0;
  lastEventMs = 0;

  // Inputs the status is worked out from.
  readonly activeAgentIds = new Set<string>();
  readonly openTools = new Map<string, number>();
  /** The lead between a prompt and Stop. */
  busy = false;
  waitingSince = 0;
  workingUntil = 0;
  errorUntil = 0;
  doneUntil = 0;
  /** 0 until the first tick, which stamps it, so a desk that never changed status doesn't read as idle since 1970. */
  idleSince = 0;

  constructor(entry: RosterEntry) {
    this.entry = entry;
    this.clear();
  }

  get key(): string {
    return this.entry.key;
  }

  get name(): string {
    return this.entry.name;
  }

  get isLead(): boolean {
    return this.entry.key === LEAD_KEY;
  }

  /** How long it has been idle (ms), for wandering to the break corner. */
  idleFor(nowMs: number): number {
    return this.status === 'Idle' && this.idleSince > 0 ? nowMs - this.idleSince : 0;
  }

  /** How long it has been waiting for the owner (ms). */
  waitingFor(nowMs: number): number {
    return this.status === 'Waiting' ? nowMs - this.waitingSince : 0;
  }

  remember(e: HqEvent): void {
    this.recent.push(e);
    if (this.recent.length > AgentState.RecentMax) this.recent.shift();
  }

  clear(): void {
    this.status = 'Idle';
    this.statusSince = this.idleSince = 0;
    this.currentTask = this.tool = this.file = this.preview = this.activity = this.helper = this.waitingKind = '';
    this.toolCount = 0;
    this.filesTouched.clear();
    this.recent.length = 0;
    this.present = this.isLead;
    this.spawnedAt = this.lastEventMs = 0;
    this.activeAgentIds.clear();
    this.openTools.clear();
    this.busy = false;
    this.waitingSince = this.workingUntil = this.errorUntil = this.doneUntil = 0;
  }
}
