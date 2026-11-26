import type { Object3D } from 'three';

/** A responder as the overlay and camera need it: where it stands and whether it is in the room. */
export interface ResponderHandle {
  /** The responder's root, at its feet. */
  root: Object3D;
  /** Height of the top of the head above the feet, in metres. */
  headTop: number;
  visible(): boolean;
}

/**
 * The few things the DOM overlay and the 3D office share without going through React: responder positions (for click
 * picking and the off-screen waiting badges), the badge elements, and the camera's focus commands.
 */
export const officeBus = {
  responders: new Map<string, ResponderHandle>(),
  badges: new Map<string, HTMLDivElement>(),
  focusAgent: (key: string): void => void key,
  frameAll: (): void => {},
  /** Pixels on the right of the screen covered by the agent cards; the view is centred in what is left. */
  rightInset: 380,
};
