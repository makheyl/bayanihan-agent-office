/**
 * Where everything in the office stands, in metres. Same room as the Unity HQ's OfficeSceneBuilder, converted to three.js
 * axes: x to the right, y up, and z toward the viewer, so the back wall (banner, whiteboard, door) is at z = -8.1 and the
 * camera looks in from the front-left.
 */

export type XZ = readonly [number, number];

export const ROOM = {
  width: 24.4,
  depth: 16.4,
  wallHeight: 3.2,
  backZ: -8.1,
  rightX: 12.1,
  /** The doorway in the back wall, from x 9.6 to 11.4. */
  doorFrom: 9.6,
  doorTo: 11.4,
};

export interface DeskSpot {
  slot: number;
  x: number;
  z: number;
  big: boolean;
  /** Width (x) and depth (z) of the desk top. */
  w: number;
  d: number;
}

const desk = (slot: number, x: number, z: number): DeskSpot =>
  slot === 0 ? { slot, x, z, big: true, w: 2.6, d: 0.95 } : { slot, x, z, big: false, w: 1.5, d: 0.75 };

/** Desk slots from roster.json; 0 is Kap. Dado's big desk under the banner. */
export const DESKS: DeskSpot[] = [
  desk(0, 0, -5.4),
  desk(1, -8.5, -3.4),
  desk(2, -4.8, -3.4),
  desk(3, 4.8, -3.4),
  desk(4, 8.5, -3.4),
  desk(5, -8.5, 0.6),
  desk(6, 8.5, 0.6),
  desk(7, -8.5, 4.4),
  desk(8, -4.8, 4.4),
  desk(9, 4.8, 4.4),
];

/** Seat height of the chairs above the floor. */
export const SEAT_HEIGHT = 0.48;

/** Where the responder at a desk sits: in front of the chair, facing the monitor (toward -z). */
export function seatOf(d: DeskSpot): XZ {
  return [d.x, d.z + d.d / 2 + 0.4];
}

export const MAP_TABLE: XZ = [0, -0.4];
export const WHITEBOARD = { x: -5.6, y: 1.7, z: -7.86 };
export const SIGNAL_BOARD = { x: 5.6, y: 1.75, z: -7.86 };

/** Inside the entrance: newly started subagents walk in from here. */
export const DOOR: XZ = [10.5, -7.3];

export const KUBO: XZ = [8.9, 5.9];
export const SARI_SARI: XZ = [11.15, 2.9];

/** Places around the kubo and the sari-sari counter where idle responders go (none inside the furniture). */
export const BREAK_SPOTS: XZ[] = [
  [7.05, 5.6],
  [10.75, 5.6],
  [7.3, 7.6],
  [10.5, 7.6],
  [8.9, 7.7],
  [9.7, 4.25],
];

/** The middle of the break corner, which people there face. */
export const BREAK_CENTRE: XZ = [
  BREAK_SPOTS.reduce((s, p) => s + p[0], 0) / BREAK_SPOTS.length,
  BREAK_SPOTS.reduce((s, p) => s + p[1], 0) / BREAK_SPOTS.length,
];

/** A box on the floor that people walk around: centre and half-sizes. */
export interface Block {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/** Everything solid on the floor, for the walking paths. Chairs are left out: people walk up to them and sit. */
export function obstacles(): Block[] {
  const blocks: Block[] = [];
  for (const d of DESKS) blocks.push({ x: d.x, z: d.z, hx: d.w / 2, hz: d.d / 2 });
  blocks.push({ x: MAP_TABLE[0], z: MAP_TABLE[1], hx: 2.25, hz: 1.75 });
  // Kubo: the papag bench, the low table and the four bamboo posts.
  blocks.push({ x: KUBO[0], z: KUBO[1] - 0.3, hx: 1.1, hz: 0.45 });
  blocks.push({ x: KUBO[0], z: KUBO[1] + 0.6, hx: 0.36, hz: 0.36 });
  for (const px of [-1.5, 1.5]) for (const pz of [-1.1, 1.1]) blocks.push({ x: KUBO[0] + px, z: KUBO[1] + pz, hx: 0.08, hz: 0.08 });
  // Sari-sari counter and shelves against the right wall.
  blocks.push({ x: SARI_SARI[0], z: SARI_SARI[1], hx: 0.95, hz: 1.05 });
  // Supply cabinet, rescue gear, buckets and plant pots.
  blocks.push({ x: -11.3, z: -7.4, hx: 0.6, hz: 0.3 });
  blocks.push({ x: 8.2, z: -7.4, hx: 0.7, hz: 0.45 });
  blocks.push({ x: 11.65, z: -7.3, hx: 0.25, hz: 0.5 });
  for (const [x, z] of PLANTS) blocks.push({ x, z, hx: 0.3, hz: 0.3 });
  return blocks;
}

export const PLANTS: XZ[] = [
  [-11.3, 7.3],
  [2.8, -7.4],
  [-2.8, -7.4],
];
