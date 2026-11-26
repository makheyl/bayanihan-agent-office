import { isTaskEmpty, type HqTaskInfo } from '../event';

/** A line on the whiteboard. */
export interface BoardItem {
  /** "assign" (a hand-off to a subagent), "task" (TaskCreate) or "todo" (TodoWrite). */
  kind: 'assign' | 'task' | 'todo';
  id: string;
  /** Desk key it belongs to. */
  owner: string;
  text: string;
  /** pending, in_progress, completed or failed. */
  status: string;
  /** Subagent id that took an assignment, so its SubagentStop can tick it. */
  agentId: string;
  createdMs: number;
  updatedMs: number;
}

export function isDone(item: BoardItem): boolean {
  return item.status === 'completed' || item.status === 'failed';
}

/**
 * The whiteboard. Recent Claude Code models don't use the task tools unless told to, so the board always shows the
 * lead's hand-offs to subagents, and adds TaskCreate/TodoWrite items when Claude does use them.
 */
export class TodoBoard {
  static readonly MaxItems = 24;

  readonly items: BoardItem[] = [];

  clear(): void {
    this.items.length = 0;
  }

  /** A hand-off: the Agent tool's description, owned by the desk it went to. */
  addAssignment(id: string | undefined, owner: string, text: string, ts: number): void {
    if (id && this.findById('assign', id)) return;
    this.add({ kind: 'assign', id: id ?? '', owner, text, status: 'pending', agentId: '', createdMs: ts, updatedMs: ts });
  }

  /** A subagent started: the oldest waiting hand-off for that desk is now in progress. */
  startAssignment(owner: string, agentId: string | undefined, ts: number): void {
    for (const item of this.items) {
      if (item.kind !== 'assign' || item.owner !== owner || item.status !== 'pending') continue;
      item.status = 'in_progress';
      item.agentId = agentId ?? '';
      item.updatedMs = ts;
      return;
    }
  }

  /** A subagent stopped: tick its hand-off (by id, else the oldest one in progress at that desk). */
  finishAssignment(owner: string, agentId: string | undefined, ts: number): void {
    let match: BoardItem | null = null;
    for (const item of this.items) {
      if (item.kind !== 'assign' || isDone(item)) continue;
      if (agentId && item.agentId === agentId) {
        match = item;
        break;
      }
      if (!match && item.owner === owner && item.status === 'in_progress') match = item;
    }
    if (!match) return;
    match.status = 'completed';
    match.updatedMs = ts;
  }

  failAssignment(id: string | undefined, ts: number): void {
    const item = this.findById('assign', id);
    if (!item || isDone(item)) return;
    item.status = 'failed';
    item.updatedMs = ts;
  }

  /** TaskCreated / TaskUpdate / TaskCompleted. "deleted" takes it off the board. */
  upsertTask(info: HqTaskInfo | undefined, owner: string, ts: number): void {
    if (!info || isTaskEmpty(info)) return;
    let item = info.id ? this.findById('task', info.id) : null;
    if (info.status === 'deleted') {
      if (item) this.items.splice(this.items.indexOf(item), 1);
      return;
    }
    if (!item) {
      item = { kind: 'task', id: info.id ?? '', owner, text: info.text ?? '', status: 'pending', agentId: '', createdMs: ts, updatedMs: ts };
      this.add(item);
    }
    if (info.text) item.text = info.text;
    if (info.status) item.status = info.status;
    item.updatedMs = ts;
  }

  /** TodoWrite sends the whole list each time, so it replaces the previous todos. */
  replaceTodos(todos: HqTaskInfo[], owner: string, ts: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].kind === 'todo') this.items.splice(i, 1);
    todos.forEach((t, i) => {
      if (!t || !t.text) return;
      this.add({ kind: 'todo', id: `todo${i}`, owner, text: t.text, status: t.status || 'pending', agentId: '', createdMs: ts, updatedMs: ts });
    });
  }

  countDone(): number {
    return this.items.filter(isDone).length;
  }

  private findById(kind: BoardItem['kind'], id: string | undefined): BoardItem | null {
    if (!id) return null;
    return this.items.find(i => i.kind === kind && i.id === id) ?? null;
  }

  private add(item: BoardItem): void {
    this.items.push(item);
    // The board has room for 24 lines: finished ones go first, then the oldest.
    while (this.items.length > TodoBoard.MaxItems) {
      const drop = this.items.findIndex(isDone);
      this.items.splice(drop >= 0 ? drop : 0, 1);
    }
  }
}
