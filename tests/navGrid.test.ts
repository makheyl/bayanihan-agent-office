import { describe, expect, it } from 'vitest';
import { BREAK_SPOTS, DESKS, DOOR, ROOM, obstacles, seatOf } from '@/components/office/layout';
import { NavGrid } from '@/components/office/navGrid';
import { BreakCorner, ResponderBrain } from '@/components/office/responderBrain';
import { defaultRoster } from '@/lib/roster';
import { OfficeState } from '@/lib/state/officeState';

const nav = new NavGrid({ minX: -12.1, maxX: ROOM.rightX - 0.1, minZ: ROOM.backZ + 0.1, maxZ: 8.2, blocks: obstacles(), pad: 0.3 });

function walkable(path: readonly (readonly [number, number])[]): boolean {
  // Every point but the two ends (a chair, a spot by the kubo) is on free floor.
  return path.slice(1, -1).every(([x, z]) => nav.isFree(x, z));
}

describe('walking paths', () => {
  it('reach every desk from the door and every break spot from every desk', () => {
    for (const d of DESKS) {
      const seat = seatOf(d);
      const inPath = nav.path(DOOR, seat);
      expect(inPath[inPath.length - 1]).toEqual(seat);
      expect(walkable(inPath), `door to desk ${d.slot}`).toBe(true);
      for (const spot of BREAK_SPOTS) expect(walkable(nav.path(seat, spot)), `desk ${d.slot} to ${spot}`).toBe(true);
    }
  });

  it('keeps break spots and the door on free floor', () => {
    for (const [x, z] of [...BREAK_SPOTS, DOOR]) expect(nav.isFree(x, z), `${x},${z}`).toBe(true);
  });
});

describe('ResponderBrain', () => {
  it('walks a new subagent in from the door, sits, then wanders to the kubo after a minute idle', () => {
    const state = new OfficeState(defaultRoster());
    const corner = new BreakCorner();
    const lito = state.get('map-level-builder')!;
    const brain = new ResponderBrain(lito, seatOf(DESKS[1]), nav, corner);
    const t0 = 1_800_000_000_000;
    state.apply({ ev: 'PreToolUse', agent: 'map-level-builder', ts: t0, tool: 'Agent', tuid: 'a', preview: 'job', to: 'map-level-builder' }, t0);
    state.apply({ ev: 'SubagentStart', agent: 'map-level-builder', ts: t0 + 100, aid: 'A' }, t0 + 100);
    let t = 0;
    const run = (seconds: number, nowStart: number) => {
      for (let i = 0; i < seconds * 30; i++) {
        t += 1 / 30;
        const now = nowStart + Math.round(i * (1000 / 30));
        state.tick(now);
        brain.tick(now, t, 1 / 30);
      }
    };
    run(1, t0 + 200);
    expect(brain.mode).toBe('WalkingToDesk');
    run(15, t0 + 1200);
    expect(brain.mode).toBe('Desk');
    expect(brain.seated).toBe(true);
    state.apply({ ev: 'SubagentStop', agent: 'map-level-builder', ts: t0 + 20_000, aid: 'A' }, t0 + 20_000);
    run(2, t0 + 20_000);
    expect(brain.bubble?.tone).toBe('done');
    run(70, t0 + 30_000);
    expect(['WalkingToBreak', 'OnBreak']).toContain(brain.mode);
  });
});
