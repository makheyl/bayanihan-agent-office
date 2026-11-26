import { describe, expect, it } from 'vitest';
import { Simulator } from '@/lib/simulator';

describe('Simulator', () => {
  it('loops every 128 seconds with a new session id', () => {
    const sim = new Simulator(1);
    const start = 1_800_000_000_000;
    const first = sim.update(start);
    expect(first[0].ev).toBe('SessionStart');
    const loop1 = sim.update(start + 127_000);
    const sid1 = loop1[0].sid;
    const loop2 = sim.update(start + 128_500);
    expect(loop2.some(e => e.ev === 'SessionStart')).toBe(true);
    expect(loop2.find(e => e.ev === 'SessionStart')!.sid).not.toBe(sid1);
  });

  it('tags every event as simulated and keeps time order', () => {
    const events = Simulator.storyEvents(3, 0);
    expect(events.every(e => e.sim)).toBe(true);
    for (let i = 1; i < events.length; i++) expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
  });

  it('restarts from the top', () => {
    const sim = new Simulator(5);
    sim.update(0);
    sim.update(60_000);
    sim.restart();
    expect(sim.update(200_000)[0].ev).toBe('SessionStart');
  });
});
