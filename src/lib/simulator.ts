import { LEAD_KEY, type HqEvent } from './event';

/** A small seeded random generator (mulberry32), so a seed always tells the same story. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Step {
  t: number;
  e: HqEvent;
}

const G = 'Game/Assets/';

/**
 * Simulate mode: a scripted, believable two-minute work session for demos (the capstone defense) when no Claude Code
 * session is running. It makes the same events the hook writes, tagged sim, so the whole office reacts exactly as it
 * would live. Each loop is a new session with a little jitter per desk, so it doesn't look canned. Ported from the Unity
 * HQ's HqSimulator.cs.
 */
export class Simulator {
  /** Seconds from the start of one loop to the next. */
  static readonly LoopSeconds = 128;

  private readonly random: () => number;
  private steps: Step[] = [];
  private next = 0;
  private loopStartMs = -1;
  private loop = 0;

  constructor(seed = 2026) {
    this.random = seededRandom(seed);
  }

  /** Seconds into the current loop. */
  elapsed(nowMs: number): number {
    return this.loopStartMs < 0 ? 0 : (nowMs - this.loopStartMs) / 1000;
  }

  /** Starts again from the top (Simulate turned on, or Reset). */
  restart(): void {
    this.loopStartMs = -1;
    this.next = 0;
  }

  /** Returns the events due by nowMs, stamped with the time they were due. */
  update(nowMs: number): HqEvent[] {
    const due: HqEvent[] = [];
    if (this.loopStartMs < 0) this.beginLoop(nowMs);
    for (;;) {
      if (this.next >= this.steps.length) {
        if (this.elapsed(nowMs) < Simulator.LoopSeconds) break;
        this.beginLoop(this.loopStartMs + Simulator.LoopSeconds * 1000);
        continue;
      }
      const s = this.steps[this.next];
      const at = this.loopStartMs + Math.round(s.t * 1000);
      if (at > nowMs) break;
      due.push({ ...s.e, ts: at });
      this.next++;
    }
    return due;
  }

  private beginLoop(startMs: number): void {
    this.loopStartMs = startMs;
    this.loop++;
    const sid = `sim-${String(this.loop).padStart(3, '0')}-${1000 + Math.floor(this.random() * 9000)}`;
    this.steps = buildStory(this.random, sid);
    this.next = 0;
  }

  /** For tests: the events of one loop in order, with ts set as if the loop began at startMs. */
  static storyEvents(seed: number, startMs: number): HqEvent[] {
    return buildStory(seededRandom(seed), 'sim-test').map(s => ({ ...s.e, ts: startMs + Math.round(s.t * 1000) }));
  }
}

function buildStory(random: () => number, sid: string): Step[] {
  const s = new Story(sid, random);

  // The owner asks for a round of work; the lead reads the notes and plans it on the board.
  s.lead(0.0, 'SessionStart', 'startup');
  s.lead(0.8, 'UserPromptSubmit');
  s.tool(LEAD_KEY, 1.6, 'Read', 'Game/Docs/Home.md', undefined, 0.4);
  s.tool(LEAD_KEY, 2.4, 'Read', 'Game/Docs/Systems/Map and Props.md', undefined, 0.5);
  s.task(3.4, '1', 'Fill Bagumbayan side streets with sari-sari rows', 'pending', 'TaskCreated');
  s.task(3.6, '2', 'Boat wake reacts to speed', 'pending', 'TaskCreated');
  s.task(3.8, '3', 'Rain ambience follows typhoon strength', 'pending', 'TaskCreated');
  s.task(4.0, '4', 'Show rescued / total on the HUD', 'pending', 'TaskCreated');
  s.task(4.2, '5', 'Run Mabuhay and boat tests', 'pending', 'TaskCreated');
  s.task(4.4, '6', 'Update the Docs notes', 'pending', 'TaskCreated');

  // Lito, the level builder: row generation away from WalterMart and Macaria, then a full map rebuild.
  s.spawn(5.0, 'map-level-builder', 'Fill Bagumbayan side streets with sari-sari rows');
  s.task(5.3, '1', undefined, 'in_progress');
  s.tool('map-level-builder', 6.2, 'Read', G + 'Scripts/Editor/RowBuilder.cs', undefined, 0.6);
  s.tool('map-level-builder', 7.4, 'Grep', G + 'Scripts/Editor', 'ProtectedBuffer', 0.4);
  s.tool('map-level-builder', 8.6, 'Read', G + 'Scripts/Map/BarangayMockPlanner.cs', undefined, 0.5);
  s.tool('map-level-builder', 10.5, 'Edit', G + 'Scripts/Editor/RowBuilder.cs', undefined, 1.2);
  s.tool('map-level-builder', 13.5, 'Edit', G + 'Scripts/Map/BarangayMockPlanner.cs', undefined, 1.0);
  s.tool('map-level-builder', 16.0, 'Bash', undefined, 'unity cmd menu --path "Bayanihan/Build Mabuhay Gameplay Scene"', 15.0);
  s.tool('map-level-builder', 33.0, 'Read', G + 'Generated/MabuhayGameplay/BuildReport.txt', undefined, 0.5);
  s.tool('map-level-builder', 35.0, 'Edit', 'Game/Docs/Systems/Map and Props.md', undefined, 1.0);
  s.stop(38.0, 'map-level-builder');
  s.task(38.4, '1', undefined, 'completed', 'TaskCompleted');

  // Bea, the gameplay scripter: the boat's wake.
  s.spawn(6.0, 'gameplay-scripter', 'Boat wake reacts to speed');
  s.task(6.3, '2', undefined, 'in_progress');
  s.tool('gameplay-scripter', 7.2, 'Read', G + 'Scripts/SimpleBoat.cs', undefined, 0.5);
  s.tool('gameplay-scripter', 8.4, 'Read', G + 'Scripts/BoatEffects.cs', undefined, 0.4);
  s.tool('gameplay-scripter', 11.0, 'Edit', G + 'Scripts/SimpleBoat.cs', undefined, 1.5);
  s.tool('gameplay-scripter', 14.5, 'Edit', G + 'Scripts/BoatEffects.cs', undefined, 1.2);
  s.tool('gameplay-scripter', 18.0, 'Bash', undefined, 'unity cmd recompile', 4.0);
  s.tool('gameplay-scripter', 23.0, 'Bash', undefined, 'unity cmd console --type error', 0.8);
  s.stop(26.0, 'gameplay-scripter');
  s.task(26.4, '2', undefined, 'completed', 'TaskCompleted');

  // Lorna, audio: rain ambience.
  s.spawn(7.0, 'audio', 'Rain ambience follows typhoon strength');
  s.task(7.3, '3', undefined, 'in_progress');
  s.tool('audio', 8.0, 'Glob', G + 'Audio/Weather', '**/*.ogg', 0.3);
  s.tool('audio', 9.5, 'Read', G + 'Scripts/TyphoonWeather.cs', undefined, 0.6);
  s.tool('audio', 12.0, 'Write', G + 'Scripts/RainAmbience.cs', undefined, 1.0);
  s.tool('audio', 16.5, 'Edit', G + 'Scripts/TyphoonWeather.cs', undefined, 1.0);
  s.tool('audio', 21.0, 'Edit', 'Game/README.md', undefined, 0.6);
  s.stop(34.0, 'audio');
  s.task(34.4, '3', undefined, 'completed', 'TaskCompleted');

  // Tala, VFX: needs the owner's OK to capture the Game view (~45 s): the "waiting for me" moment.
  s.spawn(28.0, 'vfx-environment', 'Lightning stays under 3 flashes a second');
  s.tool('vfx-environment', 29.5, 'Read', G + 'Scripts/Cutscenes/FlashLimiter.cs', undefined, 0.5);
  s.tool('vfx-environment', 31.5, 'Edit', G + 'Scripts/TyphoonWeather.cs', undefined, 1.0);
  s.permission('vfx-environment', 44.0, 'Bash', 'unity cmd capture_game_view --path Temp/lightning.png', 11.0);
  s.tool('vfx-environment', 58.0, 'Read', 'Game/Temp/lightning.png', undefined, 0.4);
  s.stop(61.0, 'vfx-environment');

  // Mika, UI: the HUD counter.
  s.spawn(40.0, 'ui-frontend', 'Show rescued / total on the HUD');
  s.task(40.3, '4', undefined, 'in_progress');
  s.tool('ui-frontend', 41.0, 'Read', G + 'Scripts/UI/UiKit.cs', undefined, 0.6);
  s.tool('ui-frontend', 42.5, 'Read', G + 'Scripts/UI/UiTheme.cs', undefined, 0.4);
  s.tool('ui-frontend', 46.0, 'Edit', G + 'Scripts/HudMarker.cs', undefined, 1.2);
  s.tool('ui-frontend', 50.0, 'Edit', G + 'Scripts/RescueManager.cs', undefined, 1.0);
  s.tool('ui-frontend', 55.0, 'Edit', 'Game/Docs/Systems/UI and Settings.md', undefined, 0.8);
  s.stop(64.0, 'ui-frontend');
  s.task(64.4, '4', undefined, 'completed', 'TaskCompleted');

  // Nena, QA: a test fails at ~70 s, Bea fixes it, the rerun passes.
  s.spawn(62.0, 'qa-tester', 'Run Mabuhay and boat tests');
  s.task(62.3, '5', undefined, 'in_progress');
  s.tool('qa-tester', 63.0, 'Bash', undefined, 'unity cmd run_tests --mode editor --filter BarangayLayout --format json', 4.0);
  s.tool('qa-tester', 68.0, 'Bash', undefined, 'unity cmd run_tests --mode editor --filter BoatTests --format json', 3.0, false);
  s.spawn(75.0, 'gameplay-scripter', 'Fix BoatTests: wake speed reads 0 at the helm');
  s.tool('gameplay-scripter', 76.0, 'Read', G + 'Tests/EditMode/BoatTests.cs', undefined, 0.5);
  s.tool('gameplay-scripter', 77.5, 'Read', G + 'Scripts/PlayerRescuer.cs', undefined, 0.6);
  s.tool('gameplay-scripter', 80.0, 'Edit', G + 'Scripts/SimpleBoat.cs', undefined, 1.2);
  s.tool('gameplay-scripter', 83.0, 'Bash', undefined, 'unity cmd recompile', 3.0);
  s.stop(87.0, 'gameplay-scripter');
  s.tool('qa-tester', 89.0, 'Bash', undefined, 'unity cmd run_tests --mode editor --filter BoatTests --format json', 3.0);
  s.tool('qa-tester', 93.0, 'Bash', undefined, 'unity cmd run_tests --mode playmode --filter MabuhaySmokeTests --async_tests true', 1.0);
  s.tool('qa-tester', 95.0, 'Bash', undefined, 'unity cmd test_status', 6.0);
  s.tool('qa-tester', 102.0, 'Bash', undefined, 'unity cmd console', 0.6);
  s.stop(104.0, 'qa-tester');
  s.task(104.4, '5', undefined, 'completed', 'TaskCompleted');

  // The lead writes up, finishes, and later sits waiting for the next prompt.
  s.task(105.0, '6', undefined, 'in_progress');
  s.tool(LEAD_KEY, 106.0, 'Edit', 'Game/Docs/Home.md', undefined, 1.0);
  s.tool(LEAD_KEY, 109.0, 'Bash', undefined, 'git status --short', 0.5);
  s.task(111.0, '6', undefined, 'completed', 'TaskCompleted');
  s.lead(112.0, 'Stop');
  s.lead(120.0, 'Notification', 'Claude is waiting for your input', 'idle_prompt');

  return s.sorted();
}

/** Builds the event list. Every desk gets its own small time offset so each loop looks different. */
class Story {
  private readonly jitter = new Map<string, number>();
  private readonly agentRuns = new Map<string, number>();
  private readonly steps: Step[] = [];
  private toolIds = 0;

  constructor(
    private readonly sid: string,
    private readonly random: () => number,
  ) {}

  private j(agent: string): number {
    if (agent === LEAD_KEY) return 0;
    let v = this.jitter.get(agent);
    if (v === undefined) {
      v = this.random() * 1.6 - 0.8;
      this.jitter.set(agent, v);
    }
    return v;
  }

  private e(agent: string, ev: string, via: string): HqEvent {
    return { ts: 0, sid: this.sid, agent, ev, via, sim: true };
  }

  private add(t: number, e: HqEvent): void {
    this.steps.push({ t: Math.max(0, t), e });
  }

  private agentId(agent: string): string {
    return `sim-${agent}-${this.agentRuns.get(agent) ?? 0}`;
  }

  private nextTool(): string {
    return `sim-tool-${++this.toolIds}`;
  }

  lead(t: number, ev: string, preview?: string, kind?: string): void {
    const e = this.e(LEAD_KEY, ev, 'lead');
    if (preview) e.preview = preview;
    if (kind) e.kind = kind;
    this.add(t, e);
  }

  spawn(t: number, agent: string, description: string): void {
    this.agentRuns.set(agent, (this.agentRuns.get(agent) ?? 0) + 1);
    t += this.j(agent);
    const tuid = this.nextTool();
    this.add(t, { ...this.e(agent, 'PreToolUse', 'spawn'), tool: 'Agent', preview: description, to: agent, tuid });
    this.add(t + 0.2, { ...this.e(agent, 'SubagentStart', 'agent'), aid: this.agentId(agent), preview: agent });
    // Subagents run in the background, so the Agent call returns at once.
    this.add(t + 0.3, { ...this.e(agent, 'PostToolUse', 'spawn'), tool: 'Agent', preview: description, to: agent, tuid, ok: true });
  }

  stop(t: number, agent: string): void {
    this.add(t + this.j(agent), { ...this.e(agent, 'SubagentStop', 'agent'), aid: this.agentId(agent), preview: agent });
  }

  tool(agent: string, t: number, tool: string, file: string | undefined, preview: string | undefined, duration: number, ok = true): void {
    t += this.j(agent);
    const tuid = this.nextTool();
    const via = agent === LEAD_KEY ? 'lead' : 'agent';
    const pre: HqEvent = { ...this.e(agent, 'PreToolUse', via), tool, tuid };
    if (file) pre.file = file;
    if (preview) pre.preview = preview;
    if (via === 'agent') pre.aid = this.agentId(agent);
    this.add(t, pre);
    this.add(t + duration, { ...pre, ev: ok ? 'PostToolUse' : 'PostToolUseFailure', ok });
  }

  permission(agent: string, t: number, tool: string, preview: string, waitSeconds: number): void {
    t += this.j(agent);
    const tuid = this.nextTool();
    const aid = this.agentId(agent);
    this.add(t, { ...this.e(agent, 'PreToolUse', 'agent'), tool, preview, tuid, aid });
    this.add(t + 0.2, { ...this.e(agent, 'PermissionRequest', 'agent'), tool, preview, aid });
    this.add(t + 0.4, {
      ...this.e(LEAD_KEY, 'Notification', 'lead'),
      preview: `Claude needs your permission to use ${tool}`,
      kind: 'permission_prompt',
    });
    this.add(t + waitSeconds + 1.5, { ...this.e(agent, 'PostToolUse', 'agent'), tool, preview, tuid, ok: true, aid });
  }

  task(t: number, id: string, text: string | undefined, status: string, ev?: string): void {
    const e = this.e(LEAD_KEY, ev ?? 'PostToolUse', 'lead');
    e.task = { id, status, ...(text ? { text } : {}) };
    if (!ev) {
      e.tool = 'TaskUpdate';
      e.ok = true;
      e.preview = `#${id} → ${status}`;
      e.tuid = this.nextTool();
    } else if (text) e.preview = text;
    this.add(t, e);
  }

  /** A stable sort, so events at the same moment keep the order they were written in. */
  sorted(): Step[] {
    return this.steps.map((s, i) => ({ s, i })).sort((a, b) => a.s.t - b.s.t || a.i - b.i).map(x => x.s);
  }
}
