import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEvent, summary, type HqEvent } from '@/lib/event';
import { defaultRoster } from '@/lib/roster';
import { Simulator } from '@/lib/simulator';
import { ALL_STATUSES, type AgentStatus } from '@/lib/state/agentState';
import { OfficeState } from '@/lib/state/officeState';
import { readTail } from '@/server/replay';

// Ports of the Unity HQ's OfficeStateTests.cs: parsing hook lines, statuses, the whiteboard, the signal and Simulate's story.
const T0 = 1_800_000_000_000;
let state: OfficeState;

beforeEach(() => {
  state = new OfficeState(defaultRoster());
});

function ev(ev: string, agent: string, ts: number, extra: Partial<HqEvent> = {}): HqEvent {
  return { ev, agent, ts, sid: 's1', ...extra };
}

function apply(e: HqEvent, now = -1): void {
  state.apply(e, now < 0 ? e.ts : now);
}

describe('OfficeState (ported from the Unity tests)', () => {
  it('parses a real hook line', () => {
    const e = parseEvent(
      '{"ts":1795622605323,"sid":"429e","ev":"PreToolUse","agent":"qa-tester","via":"agent","aid":"a82","tuid":"toolu_01","tool":"Glob","file":"Game/Assets/Tests/EditMode","preview":"**/*.cs"}',
    );
    expect(e).not.toBeNull();
    expect(e!.ts).toBe(1795622605323);
    expect(e!.agent).toBe('qa-tester');
    expect(summary(e!)).toBe('Glob → EditMode');
    expect(e!.task).toBeUndefined();
  });

  it('skips broken lines instead of throwing', () => {
    expect(parseEvent('')).toBeNull();
    expect(parseEvent('not json')).toBeNull();
    expect(parseEvent('{"no":1}')).toBeNull();
    expect(parseEvent('{"ev":"Stop"}')!.agent).toBe('lead');
  });

  it('shows a tool as working, then lingering, then idle', () => {
    apply(ev('PreToolUse', 'gameplay-scripter', T0, { tool: 'Edit', tuid: 't1', file: 'Game/Assets/Scripts/SimpleBoat.cs' }));
    const bea = state.get('gameplay-scripter')!;
    expect(bea.status).toBe('Working');
    expect(bea.activity).toBe('Edit → SimpleBoat.cs');

    apply(ev('PostToolUse', 'gameplay-scripter', T0 + 500, { tool: 'Edit', tuid: 't1', file: 'Game/Assets/Scripts/SimpleBoat.cs' }));
    state.tick(T0 + 2000);
    expect(bea.status).toBe('Working');
    state.tick(T0 + 500 + OfficeState.WorkingLingerMs + 1);
    expect(bea.status).toBe('Idle');
    expect(bea.toolCount).toBe(1);
    expect(bea.filesTouched.has('Game/Assets/Scripts/SimpleBoat.cs')).toBe(true);
  });

  it('does not reopen a tool when its PreToolUse arrives after its Post', () => {
    apply(ev('PostToolUse', 'audio', T0 + 10, { tool: 'Read', tuid: 't9' }));
    apply(ev('PreToolUse', 'audio', T0, { tool: 'Read', tuid: 't9' }), T0 + 20);
    state.tick(T0 + 10 + OfficeState.WorkingLingerMs + 1);
    expect(state.get('audio')!.status).toBe('Idle');
  });

  it('waits on a permission request until the tool finishes', () => {
    apply(ev('PreToolUse', 'qa-tester', T0, { tool: 'Bash', tuid: 't2' }));
    apply(ev('PermissionRequest', 'qa-tester', T0 + 100, { tool: 'Bash' }));
    apply(ev('Notification', 'lead', T0 + 200, { kind: 'permission_prompt' }));
    const nena = state.get('qa-tester')!;
    expect(nena.status).toBe('Waiting');
    expect(state.lead.status).not.toBe('Waiting');
    expect(state.signal(T0 + 300)).toBe(4);
    expect(state.signal(T0 + 100 + 2 * 60 * 1000 + 1)).toBe(5);

    apply(ev('PostToolUse', 'qa-tester', T0 + 5000, { tool: 'Bash', tuid: 't2' }));
    expect(nena.status).toBe('Working');
  });

  it('treats a failure as an error but not an interrupt', () => {
    apply(ev('PreToolUse', 'qa-tester', T0, { tool: 'Bash', tuid: 't3' }));
    apply(ev('PostToolUseFailure', 'qa-tester', T0 + 100, { tool: 'Bash', tuid: 't3' }));
    expect(state.get('qa-tester')!.status).toBe('Error');
    expect(state.signal(T0 + 200)).toBe(5);
    state.tick(T0 + 100 + OfficeState.ErrorHoldMs + 1);
    expect(state.get('qa-tester')!.status).toBe('Idle');
    expect(state.signal(T0 + 100 + OfficeState.ErrorHoldMs + 1)).toBe(3);

    apply(ev('PostToolUseFailure', 'audio', T0, { tool: 'Bash', tuid: 't4', intr: true }));
    expect(state.get('audio')!.status).not.toBe('Error');
  });

  it('puts a hand-off on the board and ticks it when the subagent stops', () => {
    const spawned: string[] = [];
    state.onSpawned(a => spawned.push(a.key));
    apply(ev('PreToolUse', 'map-level-builder', T0, { tool: 'Agent', tuid: 't5', preview: 'Fill side streets', to: 'map-level-builder' }));
    apply(ev('SubagentStart', 'map-level-builder', T0 + 50, { aid: 'A1' }));
    const lito = state.get('map-level-builder')!;
    expect(spawned).toEqual(['map-level-builder']);
    expect(lito.status).toBe('Thinking');
    expect(lito.currentTask).toBe('Fill side streets');
    expect(state.board.items[0].status).toBe('in_progress');

    apply(ev('SubagentStop', 'map-level-builder', T0 + 9000, { aid: 'A1' }));
    expect(lito.status).toBe('Done');
    expect(state.board.items[0].status).toBe('completed');
    state.tick(T0 + 9000 + OfficeState.DoneHoldMs + 1);
    expect(lito.status).toBe('Idle');
  });

  it('creates, updates and completes tasks', () => {
    apply(ev('TaskCreated', 'lead', T0, { task: { id: '3', text: 'Wire the counter', status: 'pending' } }));
    apply(ev('PostToolUse', 'lead', T0 + 1, { tool: 'TaskUpdate', task: { id: '3', status: 'in_progress' } }));
    expect(state.board.items[0].status).toBe('in_progress');
    expect(state.board.items[0].text).toBe('Wire the counter');
    apply(ev('TaskCompleted', 'lead', T0 + 2, { task: { id: '3', text: 'Wire the counter', status: 'completed' } }));
    expect(state.board.countDone()).toBe(1);
  });

  it('does not leave the lead busy forever after a lost Stop', () => {
    apply(ev('UserPromptSubmit', 'lead', T0));
    expect(state.lead.status).toBe('Thinking');
    state.tick(T0 + OfficeState.EngagedTimeoutMs + 1);
    expect(state.lead.status).toBe('Idle');
  });

  it('replays only whole lines from the tail of the log', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqtest-'));
    const file = path.join(dir, 'events.jsonl');
    try {
      const lines: string[] = [];
      for (let i = 0; i < 200; i++) lines.push(`{"ts":${T0 + i * 1000},"ev":"PreToolUse","agent":"audio","tool":"Read","tuid":"x${i}"}`);
      lines.push('garbage line');
      fs.writeFileSync(file, lines.join('\n') + '\n');
      const events = readTail(file, 2000, 6 * 3600 * 1000).events;
      expect(events.length).toBeGreaterThan(5);
      expect(events.length).toBeLessThan(40);
      expect(events[events.length - 1].tuid).toBe('x199');
      expect(readTail(file, 1 << 20, 10_000).events.length).toBe(11);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plays a Simulate story that shows every status and ends within the loop', () => {
    const events = Simulator.storyEvents(7, T0);
    const seen = new Set<AgentStatus>();
    const desks = new Set<string>();
    let maxSignal = 0;
    state.onStatusChanged((a, _from, to) => {
      seen.add(to);
      if (a.key !== 'lead') desks.add(a.key);
    });
    let last = T0;
    for (const e of events) {
      expect(e.ts).toBeGreaterThanOrEqual(last);
      last = e.ts;
      expect(e.sim).toBe(true);
      state.apply(e, e.ts);
      maxSignal = Math.max(maxSignal, state.signal(e.ts));
      for (let t = e.ts; t < e.ts + 900; t += 300) state.tick(t);
    }
    expect(last - T0).toBeLessThan(Simulator.LoopSeconds * 1000);
    for (const s of ALL_STATUSES) if (s !== 'Idle') expect(seen.has(s), `Simulate shows ${s}`).toBe(true);
    expect(desks.size).toBeGreaterThanOrEqual(6);
    expect(maxSignal).toBe(5);
    expect(state.board.countDone()).toBeGreaterThanOrEqual(6);
  });
});

describe('OfficeState (web additions)', () => {
  it('counts idle time from the first tick, not from 1970', () => {
    state.tick(T0);
    expect(state.lead.idleFor(T0 + 5000)).toBe(5000);
  });

  it('keeps the log to 300 events', () => {
    for (let i = 0; i < 350; i++) apply(ev('Notification', 'lead', T0 + i, { kind: 'info' }));
    expect(state.log.length).toBe(OfficeState.LogMax);
    expect(state.log[0].ts).toBe(T0 + 50);
  });

  it('sends unknown desks to the lead', () => {
    apply(ev('PreToolUse', 'someone-new', T0, { tool: 'Read', tuid: 'u1', file: 'a/b.cs' }));
    expect(state.lead.status).toBe('Working');
  });
});
