import { LEAD_KEY, isTaskEmpty, summary, type HqEvent } from '../event';
import { defaultRoster, type RosterEntry } from '../roster';
import { AgentState, type AgentStatus } from './agentState';
import { TodoBoard } from './todoBoard';

/** A Claude Code session the office has heard from. */
export interface SessionInfo {
  id: string;
  startMs: number;
  lastMs: number;
  ended: boolean;
}

type StatusListener = (agent: AgentState, from: AgentStatus, to: AgentStatus) => void;
type AgentListener = (agent: AgentState) => void;

/**
 * The whole office as data: every desk, the whiteboard, sessions, the event log and the typhoon signal. It has nothing
 * visual in it, so live events, the replayed log and Simulate mode all go through the same apply(), and tests can drive
 * it directly. Ported from the Unity HQ's OfficeState.cs.
 */
export class OfficeState {
  /** A tool shows as working for this long after it finishes, so quick Reads are still visible. */
  static readonly WorkingLingerMs = 3000;
  static readonly ErrorHoldMs = 10000;
  static readonly DoneHoldMs = 3000;
  /** A desk that has heard nothing for this long is no longer busy (covers a lost Stop or SubagentStop). */
  static readonly EngagedTimeoutMs = 10 * 60 * 1000;
  /** A tool with no PostToolUse after this long is treated as finished. */
  static readonly OpenToolTimeoutMs = 10 * 60 * 1000;
  /** A wait older than this is assumed answered (e.g. replaying yesterday's log). */
  static readonly WaitingTimeoutMs = 20 * 60 * 1000;
  static readonly FailureWindowMs = 2 * 60 * 1000;
  static readonly SessionTimeoutMs = 30 * 60 * 1000;
  static readonly LogMax = 300;

  readonly roster: RosterEntry[];
  readonly agents: AgentState[] = [];
  readonly lead: AgentState;
  readonly board = new TodoBoard();
  /** Everything applied, newest last, at most 300. */
  readonly log: HqEvent[] = [];
  eventsApplied = 0;
  lastEventMs = 0;

  private readonly byKey = new Map<string, AgentState>();
  private readonly sessions = new Map<string, SessionInfo>();
  private failures: number[] = [];
  private readonly finishedTools = new Set<string>();
  private readonly finishedOrder: string[] = [];

  private readonly statusListeners = new Set<StatusListener>();
  private readonly spawnListeners = new Set<AgentListener>();

  constructor(roster?: RosterEntry[]) {
    this.roster = roster && roster.length ? roster : defaultRoster();
    for (const entry of this.roster) {
      if (this.byKey.has(entry.key)) continue;
      const a = new AgentState(entry);
      this.agents.push(a);
      this.byKey.set(entry.key, a);
    }
    this.lead = this.get(LEAD_KEY) ?? this.agents[0];
  }

  /** A desk changed status: (desk, from, to). Returns a function that unsubscribes. */
  onStatusChanged(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** A subagent of this role was started: its responder walks in from the entrance. */
  onSpawned(fn: AgentListener): () => void {
    this.spawnListeners.add(fn);
    return () => this.spawnListeners.delete(fn);
  }

  get(key: string | undefined): AgentState | undefined {
    return key ? this.byKey.get(key) : undefined;
  }

  /** The desk an event belongs to; unknown keys (an edited roster) go to the lead. */
  private deskFor(e: HqEvent): AgentState {
    return this.get(e.agent) ?? this.lead;
  }

  /** Applies one event. nowMs is the wall clock, used to settle the statuses afterwards. */
  apply(e: HqEvent | null | undefined, nowMs: number): void {
    if (!e || !e.ev) return;
    this.eventsApplied++;
    this.lastEventMs = Math.max(this.lastEventMs, e.ts);
    this.log.push(e);
    if (this.log.length > OfficeState.LogMax) this.log.shift();
    this.touchSession(e);

    const desk = this.deskFor(e);
    const lead = this.lead;
    const isSpawn = e.tool === 'Agent' || e.tool === 'Task';

    switch (e.ev) {
      case 'SessionStart':
        lead.present = true;
        break;

      case 'SessionEnd':
        this.endSession(e);
        break;

      case 'UserPromptSubmit':
        // The owner is at the keyboard, so nothing is waiting on them any more.
        for (const a of this.agents) clearWaiting(a);
        lead.busy = true;
        lead.doneUntil = 0;
        lead.activity = 'Planning';
        this.touch(lead, e);
        break;

      case 'PreCompact':
        lead.activity = 'Compacting notes';
        this.touch(lead, e);
        break;

      case 'Stop':
        clearWaiting(lead);
        lead.busy = false;
        lead.openTools.clear();
        lead.doneUntil = e.ts + OfficeState.DoneHoldMs;
        lead.activity = 'Done';
        this.touch(lead, e);
        break;

      case 'PreToolUse':
        if (isSpawn) {
          this.handOff(desk, e);
          break;
        }
        clearWaiting(desk);
        if (e.tuid && this.finishedTools.has(e.tuid)) {
          // It arrived after its PostToolUse: async hooks can land out of order.
          this.touch(desk, e);
          break;
        }
        if (e.tuid) desk.openTools.set(e.tuid, e.ts);
        desk.toolCount++;
        desk.errorUntil = 0;
        this.showTool(desk, e);
        break;

      case 'PostToolUse':
        if (isSpawn) {
          this.touch(lead, e);
          break;
        }
        clearWaiting(desk);
        this.finishTool(desk, e);
        desk.errorUntil = 0;
        desk.workingUntil = Math.max(desk.workingUntil, e.ts + OfficeState.WorkingLingerMs);
        if (isEdit(e.tool) && e.file) desk.filesTouched.add(e.file);
        this.showTool(desk, e);
        break;

      case 'PostToolUseFailure':
        clearWaiting(desk);
        this.finishTool(desk, e);
        if (isSpawn) this.board.failAssignment(e.tuid, e.ts);
        if (e.intr) {
          desk.workingUntil = Math.max(desk.workingUntil, e.ts + 500);
        } else {
          desk.errorUntil = e.ts + OfficeState.ErrorHoldMs;
          this.failures.push(e.ts);
        }
        this.showTool(desk, e);
        break;

      case 'PermissionRequest':
        // The Notification that follows a permission prompt has no file, so it lands on the lead's desk. The request
        // names the real desk, so move the wait there.
        if (desk !== lead && lead.waitingKind === 'permission_prompt' && e.ts - lead.waitingSince < 3000) clearWaiting(lead);
        this.startWaiting(desk, e, 'permission');
        this.showTool(desk, e);
        break;

      case 'Notification':
        if (isWaitingKind(e.kind)) {
          // Skip the duplicate when the PermissionRequest for the same prompt already put a desk on hold.
          if (e.kind === 'permission_prompt' && this.anyWaitingSince(e.ts - 3000)) {
            this.touch(desk, e);
            break;
          }
          this.startWaiting(desk, e, e.kind ?? '');
        } else this.touch(desk, e);
        break;

      case 'SubagentStart':
        desk.activeAgentIds.add(e.aid ?? '');
        desk.doneUntil = 0;
        desk.spawnedAt = e.ts;
        if (desk !== lead) this.board.startAssignment(desk.key, e.aid, e.ts);
        desk.activity = 'Arriving';
        this.touch(desk, e);
        if (desk !== lead) for (const fn of this.spawnListeners) fn(desk);
        break;

      case 'SubagentStop':
        desk.activeAgentIds.delete(e.aid ?? '');
        clearWaiting(desk);
        if (desk !== lead) {
          this.board.finishAssignment(desk.key, e.aid, e.ts);
          if (desk.activeAgentIds.size === 0) {
            desk.openTools.clear();
            desk.doneUntil = e.ts + OfficeState.DoneHoldMs;
            desk.activity = 'Done';
          }
        }
        this.touch(desk, e);
        break;

      case 'TaskCreated':
      case 'TaskCompleted':
        if (e.task) this.board.upsertTask(e.task, desk.key, e.ts);
        this.touch(desk, e);
        break;

      default:
        this.touch(desk, e);
        break;
    }

    // TaskUpdate and TodoWrite arrive as ordinary PostToolUse events with a task or todo list attached.
    if (e.ev === 'PostToolUse' && e.tool === 'TaskUpdate' && !isTaskEmpty(e.task)) this.board.upsertTask(e.task, desk.key, e.ts);
    if (e.ev === 'PostToolUse' && e.todos && e.todos.length > 0) this.board.replaceTodos(e.todos, desk.key, e.ts);

    this.tick(nowMs);
  }

  /** Works out every desk's status from its flags and timers. Cheap; called several times a second. */
  tick(nowMs: number): void {
    for (const a of this.agents) {
      expireStale(a, nowMs);
      if (a.idleSince === 0 && a.status === 'Idle') a.idleSince = nowMs;
      const next = decide(a, nowMs);
      if (next === a.status) continue;
      const prev = a.status;
      a.status = next;
      a.statusSince = nowMs;
      if (next === 'Idle') a.idleSince = nowMs;
      for (const fn of this.statusListeners) fn(a, prev, next);
    }
    this.failures = this.failures.filter(t => nowMs - t <= OfficeState.FailureWindowMs);
  }

  /**
   * The PAGASA-style wall board. 1: nobody working. 2: one or two busy. 3: three or more busy, or a failure in the last
   * 2 minutes. 4: someone is waiting for the owner. 5: a desk in Error, 3+ failures in 2 minutes, or a wait over 2 minutes.
   */
  signal(nowMs: number): number {
    let busy = 0;
    let waiting = 0;
    let errors = 0;
    let longWait = false;
    for (const a of this.agents) {
      switch (a.status) {
        case 'Working':
        case 'Thinking':
          busy++;
          break;
        case 'Waiting':
          waiting++;
          if (a.waitingFor(nowMs) > 2 * 60 * 1000) longWait = true;
          break;
        case 'Error':
          errors++;
          break;
      }
    }
    const recentFailures = this.recentFailures(nowMs);
    if (errors > 0 || recentFailures >= 3 || longWait) return 5;
    if (waiting > 0) return 4;
    if (busy >= 3 || recentFailures >= 1) return 3;
    if (busy >= 1) return 2;
    return 1;
  }

  recentFailures(nowMs: number): number {
    return this.failures.filter(t => nowMs - t <= OfficeState.FailureWindowMs).length;
  }

  countStatus(status: AgentStatus): number {
    return this.agents.filter(a => a.status === status).length;
  }

  /** The desks waiting for the owner, longest wait first. */
  waitingAgents(): AgentState[] {
    return this.agents.filter(a => a.status === 'Waiting').sort((x, y) => x.waitingSince - y.waitingSince);
  }

  /** Sessions not ended and heard from in the last 30 minutes. */
  activeSessions(nowMs: number): number {
    let n = 0;
    for (const s of this.sessions.values()) if (!s.ended && nowMs - s.lastMs < OfficeState.SessionTimeoutMs) n++;
    return n;
  }

  /** Start of the oldest active session (Unix ms), or 0 when none is active. */
  sessionStartMs(nowMs: number): number {
    let start = 0;
    for (const s of this.sessions.values())
      if (!s.ended && nowMs - s.lastMs < OfficeState.SessionTimeoutMs && (start === 0 || s.startMs < start)) start = s.startMs;
    return start;
  }

  /** Empties the office (the Reset button). */
  reset(): void {
    for (const a of this.agents) a.clear();
    this.board.clear();
    this.log.length = 0;
    this.sessions.clear();
    this.failures = [];
    this.finishedTools.clear();
    this.finishedOrder.length = 0;
    this.eventsApplied = 0;
    this.lastEventMs = 0;
  }

  // --- helpers ---------------------------------------------------------------------------------------------------

  private handOff(target: AgentState, e: HqEvent): void {
    // The lead is the one calling Agent; the event names the desk it hands work to.
    const lead = this.lead;
    lead.toolCount++;
    lead.tool = e.tool ?? '';
    lead.preview = e.preview ?? '';
    lead.activity = target === lead ? `Agent → ${e.to || 'helper'}` : `Assign → ${target.name}`;
    this.touch(lead, e);
    const text = target === lead && e.to ? `${e.to}: ${e.preview ?? ''}` : e.preview ?? '';
    this.board.addAssignment(e.tuid, target.key, text, e.ts);
    if (target !== lead) {
      target.present = true;
      target.currentTask = e.preview ?? '';
    }
  }

  private showTool(desk: AgentState, e: HqEvent): void {
    desk.tool = e.tool ?? '';
    desk.file = e.file ?? '';
    desk.preview = e.preview ?? '';
    desk.activity = summary(e);
    if (e.sub) desk.helper = e.sub;
    this.touch(desk, e);
  }

  private touch(desk: AgentState, e: HqEvent): void {
    desk.present = true;
    desk.lastEventMs = Math.max(desk.lastEventMs, e.ts);
    desk.remember(e);
  }

  private finishTool(desk: AgentState, e: HqEvent): void {
    if (!e.tuid) {
      desk.openTools.clear();
      return;
    }
    desk.openTools.delete(e.tuid);
    if (!this.finishedTools.has(e.tuid)) {
      this.finishedTools.add(e.tuid);
      this.finishedOrder.push(e.tuid);
      if (this.finishedOrder.length > 500) this.finishedTools.delete(this.finishedOrder.shift()!);
    }
  }

  private startWaiting(desk: AgentState, e: HqEvent, kind: string): void {
    if (desk.waitingSince === 0) desk.waitingSince = e.ts;
    desk.waitingKind = kind;
    desk.activity = e.ev === 'Notification' && e.preview ? e.preview : `Needs approval: ${summary(e)}`;
    this.touch(desk, e);
  }

  private anyWaitingSince(ts: number): boolean {
    return this.agents.some(a => a.waitingSince > 0 && a.waitingSince >= ts);
  }

  private endSession(e: HqEvent): void {
    for (const a of this.agents) {
      clearWaiting(a);
      a.openTools.clear();
      a.activeAgentIds.clear();
      a.busy = false;
    }
    this.touch(this.lead, e);
  }

  private touchSession(e: HqEvent): void {
    if (!e.sid) return;
    let s = this.sessions.get(e.sid);
    if (!s) {
      s = { id: e.sid, startMs: e.ts, lastMs: e.ts, ended: false };
      this.sessions.set(e.sid, s);
    }
    s.startMs = Math.min(s.startMs, e.ts);
    s.lastMs = Math.max(s.lastMs, e.ts);
    if (e.ev === 'SessionEnd') s.ended = true;
    else if (e.ev === 'SessionStart') s.ended = false;
  }
}

function decide(a: AgentState, now: number): AgentStatus {
  if (a.waitingSince > 0) return 'Waiting';
  if (now < a.errorUntil) return 'Error';
  if (a.openTools.size > 0 || now < a.workingUntil) return 'Working';
  if (now < a.doneUntil) return 'Done';
  if (a.busy || a.activeAgentIds.size > 0) return 'Thinking';
  return 'Idle';
}

/** Drops inputs whose closing event never came, so a lost hook can't freeze a desk. */
function expireStale(a: AgentState, now: number): void {
  if (a.waitingSince > 0 && now - a.waitingSince > OfficeState.WaitingTimeoutMs) {
    a.waitingSince = 0;
    a.waitingKind = '';
  }
  for (const [tuid, since] of a.openTools) if (now - since > OfficeState.OpenToolTimeoutMs) a.openTools.delete(tuid);
  if ((a.busy || a.activeAgentIds.size > 0) && now - a.lastEventMs > OfficeState.EngagedTimeoutMs) {
    a.busy = false;
    a.activeAgentIds.clear();
  }
}

function clearWaiting(a: AgentState): void {
  a.waitingSince = 0;
  a.waitingKind = '';
}

function isWaitingKind(kind: string | undefined): boolean {
  return kind === 'permission_prompt' || kind === 'idle_prompt' || kind === 'agent_needs_input' || kind === 'elicitation_dialog';
}

function isEdit(tool: string | undefined): boolean {
  return tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit';
}
