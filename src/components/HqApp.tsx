'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { Director } from '@/lib/director';
import { normalizeRoster } from '@/lib/roster';
import { armSound, ping } from '@/lib/sound';
import { officeBus } from './officeBus';
import { DebugView, Overlay, WaitingBadges } from './overlay/Overlay';
import { useDirectorVersion, useReducedMotion } from './useDirector';

// three.js needs the browser, so the office is loaded on the client only.
const Office = dynamic(() => import('./office/Office'), {
  ssr: false,
  loading: () => <div className="hq-loading">Opening the operations centre…</div>,
});

/** The HQ page: the 3D office with the overlay on top, all driven by one Director. */
export default function HqApp() {
  const [director, setDirector] = useState<Director | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [debug, setDebug] = useState(false);
  const reducedMotion = useReducedMotion();
  useDirectorVersion(director);

  // The roster is read from config/roster.json on every load, so edits show without a rebuild.
  useEffect(() => {
    let d: Director | null = null;
    let cancelled = false;
    fetch('/api/roster')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        if (cancelled) return;
        d = new Director(normalizeRoster(data));
        d.start(new URLSearchParams(window.location.search).has('demo'));
        setDirector(d);
      });
    return () => {
      cancelled = true;
      d?.stop();
    };
  }, []);

  // A ping when someone starts waiting for the owner (not while paused).
  useEffect(() => {
    if (!director) return;
    return director.state.onStatusChanged((_a, _from, to) => {
      if (to === 'Waiting' && !director.paused) ping();
    });
  }, [director]);

  const select = useCallback((key: string | null, focus = false) => {
    setSelected(key);
    if (key === null) officeBus.frameAll();
    else if (focus) officeBus.focusAgent(key);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'h' || e.key === 'H') setHidden(h => !h);
      else if (e.key === 'F1') {
        e.preventDefault();
        setDebug(v => !v);
      } else if (e.key === 'Escape') select(null);
    };
    const onPointer = () => armSound();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, { capture: true });
    };
  }, [select]);

  // The agent cards cover the right of the screen, so the camera centres the room in the space left of them.
  useEffect(() => {
    officeBus.rightInset = hidden ? 0 : 380;
  }, [hidden]);

  if (!director) return <div className="hq-loading">Opening the operations centre…</div>;
  const now = Date.now();
  return (
    <div className="hq-root">
      <div className="hq-canvas">
        <Office director={director} selected={selected} onPick={key => select(key, true)} reducedMotion={reducedMotion} />
      </div>
      {!hidden && <Overlay director={director} now={now} selected={selected} select={select} />}
      <WaitingBadges director={director} />
      {debug && <DebugView director={director} now={now} close={() => setDebug(false)} />}
    </div>
  );
}
