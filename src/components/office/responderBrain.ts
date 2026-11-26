import type { AgentState, AgentStatus } from '@/lib/state/agentState';
import { BREAK_CENTRE, BREAK_SPOTS, DOOR, type XZ } from './layout';
import type { NavGrid } from './navGrid';

export type Mode = 'Hidden' | 'Desk' | 'WalkingToDesk' | 'WalkingToBreak' | 'OnBreak';
export type BubbleTone = 'normal' | 'waiting' | 'error' | 'done';

export interface Bubble {
  text: string;
  tone: BubbleTone;
  /** Seconds (page clock) when it hides. */
  until: number;
}

/** Idle this long and a responder walks to the kubo. */
export const WANDER_AFTER_IDLE_MS = 60_000;
/** A brisk walk: the room is 24 m across and a demo should not wait on it. */
export const WALK_SPEED = 3.2;

/** The break corner's spots, shared by everyone: a responder claims one before walking there. */
export class BreakCorner {
  private readonly taken = BREAK_SPOTS.map(() => false);

  /** A free spot (random among the free ones), or -1 when the corner is full. */
  claim(random: () => number = Math.random): number {
    const free = this.taken.map((t, i) => (t ? -1 : i)).filter(i => i >= 0);
    if (free.length === 0) return -1;
    const pick = free[Math.floor(random() * free.length)];
    this.taken[pick] = true;
    return pick;
  }

  release(i: number): void {
    if (i >= 0 && i < this.taken.length) this.taken[i] = false;
  }

  releaseAll(): void {
    this.taken.fill(false);
  }
}

/** Facing (rotation about y) for looking along a direction on the floor; the figures face +z at rotation 0. */
export function facingAlong(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Seated responders face their monitor, toward the back wall. */
export const DESK_FACING = Math.PI;

/**
 * What one responder is doing in the room, from its agent's state: hidden until the agent shows up, walking in from the
 * door for a new subagent, sitting at the desk while there is work, wandering to the break corner after a minute idle,
 * and the speech bubble's text. Ported from the Unity HQ's Responder.cs; the walking goes along NavGrid paths instead of
 * a NavMesh. Pure logic, so the 3D figure just reads it each frame.
 */
export class ResponderBrain {
  mode: Mode = 'Hidden';
  x: number;
  z: number;
  facing = DESK_FACING;
  seated = false;
  /** Walk cycle phase, for the legs. */
  walkPhase = 0;
  bubble: Bubble | null = null;
  /** Page-clock seconds until which the responder waves (Done). */
  waveUntil = 0;
  /** Bumped on each celebration, so the confetti knows to fire. */
  celebrations = 0;

  private path: XZ[] = [];
  private goalFacing = DESK_FACING;
  private turning = 0;
  private breakSpot = -1;
  private appearAt = -1;
  private lastStatus: AgentStatus = 'Idle';
  private lastActivity = '';

  constructor(
    readonly agent: AgentState,
    readonly seat: XZ,
    private readonly nav: NavGrid,
    private readonly corner: BreakCorner,
  ) {
    [this.x, this.z] = seat;
  }

  get walking(): boolean {
    return this.mode === 'WalkingToDesk' || this.mode === 'WalkingToBreak';
  }

  /** One frame. nowMs is the wall clock the state uses; t is page seconds; dt is the frame time in seconds. */
  tick(nowMs: number, t: number, dt: number): void {
    const a = this.agent;
    if (!(a.present || a.isLead)) {
      if (this.mode !== 'Hidden') this.hide();
      return;
    }
    if (this.mode === 'Hidden') {
      // Wait a moment before appearing: the hand-off and the SubagentStart arrive a few hundred ms apart, and a freshly
      // started subagent should walk in from the door rather than pop into its chair.
      if (this.appearAt < 0) this.appearAt = t + 0.6;
      if (t < this.appearAt) return;
      this.appearAt = -1;
      if (nowMs - a.spawnedAt < 8000) this.walkInFromDoor();
      else this.sitDown();
    }

    const wantDesk = a.status !== 'Idle';
    const wantBreak = a.status === 'Idle' && a.idleFor(nowMs) >= WANDER_AFTER_IDLE_MS;
    if (this.mode === 'Desk' && wantBreak) this.goToBreak();
    else if ((this.mode === 'OnBreak' || this.mode === 'WalkingToBreak') && wantDesk) this.goToDesk();

    if (this.walking) this.step(dt);
    else if (this.turning > 0) {
      this.turning = Math.max(0, this.turning - dt);
      this.facing = lerpAngle(this.facing, this.goalFacing, 1 - Math.exp(-14 * dt));
    }

    if (a.status === 'Done' && this.lastStatus !== 'Done') this.celebrate(t);
    this.updateBubble(t);
    if (this.bubble && t > this.bubble.until) this.bubble = null;
    this.lastStatus = a.status;
  }

  /** A subagent of this role started: come back from the break corner. */
  onSpawned(): void {
    if (this.mode === 'OnBreak' || this.mode === 'WalkingToBreak') this.goToDesk();
  }

  /** Reset or a Simulate switch: back in the chair, quiet. */
  resetToDesk(): void {
    this.corner.release(this.breakSpot);
    this.breakSpot = -1;
    this.bubble = null;
    this.lastStatus = 'Idle';
    this.lastActivity = '';
    this.waveUntil = 0;
    this.appearAt = -1;
    this.sitDown();
    if (!this.agent.present && !this.agent.isLead) this.hide();
  }

  private updateBubble(t: number): void {
    const a = this.agent;
    const activity = a.activity ?? '';
    const last = this.lastStatus;
    switch (a.status) {
      case 'Waiting':
        this.show(activity || 'Needs your approval', 'waiting', t, 1e9);
        break;
      case 'Error':
        this.show(activity, 'error', t, 1e9);
        break;
      case 'Working':
      case 'Thinking':
        if (activity !== this.lastActivity || last === 'Waiting' || last === 'Error')
          this.show(activity, 'normal', t, a.status === 'Working' ? 6 : 3);
        break;
      case 'Done':
        if (last !== 'Done') this.show('Tapos na! (done)', 'done', t, 2.5);
        break;
      default:
        if (last === 'Waiting' || last === 'Error') this.bubble = null;
    }
    this.lastActivity = activity;
  }

  private show(text: string, tone: BubbleTone, t: number, seconds: number): void {
    this.bubble = text ? { text, tone, until: t + seconds } : null;
  }

  private celebrate(t: number): void {
    this.waveUntil = t + 2.5;
    this.celebrations++;
  }

  private walkInFromDoor(): void {
    [this.x, this.z] = DOOR;
    this.facing = 0;
    this.mode = 'Hidden';
    this.goToDesk();
  }

  private goToDesk(): void {
    this.corner.release(this.breakSpot);
    this.breakSpot = -1;
    this.walkTo(this.seat, DESK_FACING, 'WalkingToDesk');
  }

  private goToBreak(): void {
    this.breakSpot = this.corner.claim();
    if (this.breakSpot < 0) return; // the corner is full; stay put
    const spot = BREAK_SPOTS[this.breakSpot];
    this.walkTo(spot, facingAlong(BREAK_CENTRE[0] - spot[0], BREAK_CENTRE[1] - spot[1]), 'WalkingToBreak');
  }

  private walkTo(goal: XZ, facing: number, mode: Mode): void {
    this.seated = false;
    this.path = this.nav.path([this.x, this.z], goal).slice(1);
    this.goalFacing = facing;
    this.mode = mode;
  }

  private step(dt: number): void {
    let budget = WALK_SPEED * dt;
    while (budget > 0 && this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.x;
      const dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.02) this.facing = lerpAngle(this.facing, facingAlong(dx, dz), 1 - Math.exp(-12 * dt));
      if (dist <= budget) {
        this.x = tx;
        this.z = tz;
        budget -= dist;
        this.path.shift();
      } else {
        this.x += (dx / dist) * budget;
        this.z += (dz / dist) * budget;
        budget = 0;
      }
    }
    this.walkPhase += dt * 9.5;
    if (this.path.length === 0) this.arrive();
  }

  private arrive(): void {
    this.turning = 0.4;
    if (this.mode === 'WalkingToDesk') {
      this.seated = true;
      this.mode = 'Desk';
    } else {
      this.mode = 'OnBreak';
    }
  }

  private sitDown(): void {
    [this.x, this.z] = this.seat;
    this.facing = this.goalFacing = DESK_FACING;
    this.path = [];
    this.seated = true;
    this.mode = 'Desk';
  }

  private hide(): void {
    this.corner.release(this.breakSpot);
    this.breakSpot = -1;
    this.mode = 'Hidden';
    this.bubble = null;
  }
}

/** Turns from one angle toward another the short way round. */
export function lerpAngle(from: number, to: number, k: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}
