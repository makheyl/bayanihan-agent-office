'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Director } from '@/lib/director';

const noop = () => () => {};

/** Re-renders the caller whenever the director has news (about five times a second while anything changes). */
export function useDirectorVersion(director: Director | null): number {
  return useSyncExternalStore(
    director ? director.subscribe : noop,
    () => (director ? director.getVersion() : 0),
    () => 0,
  );
}

/** The user's "reduce motion" setting: no confetti, no pulsing, no camera glides. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
