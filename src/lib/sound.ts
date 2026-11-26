/**
 * The "someone needs you" ping, made in code with WebAudio (two soft sine notes), so the HQ ships no sound files. Browsers
 * only allow sound after the page has been clicked once, so it is armed by the first click; the top bar can mute it.
 */
let context: AudioContext | null = null;
let lastPing = 0;

const MUTE_KEY = 'bayanihan-hq-muted';

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // private mode: the setting just won't stick
  }
}

/** Call from a click handler: creates or wakes the audio context. */
export function armSound(): void {
  if (typeof window === 'undefined') return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

export function soundReady(): boolean {
  return !!context && context.state === 'running';
}

/** One ping per wait, never more than one a second, so a burst of prompts doesn't nag. */
export function ping(): void {
  if (!context || context.state !== 'running' || isMuted()) return;
  const now = performance.now();
  if (now - lastPing < 1000) return;
  lastPing = now;
  const t = context.currentTime;
  note(context, 659.25, t, 0.16); // E5
  note(context, 880.0, t + 0.13, 0.26); // A5
}

function note(ctx: AudioContext, freq: number, at: number, length: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}
