'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Director } from '@/lib/director';
import { SIGNAL_WORDS, signalColour } from '@/lib/format';
import { isDone, type BoardItem } from '@/lib/state/todoBoard';
import { useDirectorVersion } from '../useDirector';
import { fitText, useCanvasTexture } from './canvasTexture';
import { MAP_TABLE, SIGNAL_BOARD, WHITEBOARD } from './layout';
import { B, C, DEG, S } from './prims';

/**
 * The whiteboard on the back wall (Gawain ngayon, "today's work"): the lead's hand-offs to each responder and any task
 * list, ticked off as they finish. Open items first (in progress, then waiting), then the most recent finished ones.
 */
export function Whiteboard({ director }: { director: Director }) {
  useDirectorVersion(director);
  const s = director.state;
  const shown: BoardItem[] = [];
  for (const pass of ['in_progress', 'pending', 'done'] as const)
    for (let i = s.board.items.length - 1; i >= 0 && shown.length < 12; i--) {
      const item = s.board.items[i];
      if (pass === 'done' ? isDone(item) : item.status === pass) shown.push(item);
    }
  const key = shown.map(i => `${i.status}:${i.text}:${i.owner}`).join('\n');
  const texture = useCanvasTexture(1072, 592, key, (ctx, w, h) => {
    ctx.fillStyle = '#F7F7F2';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#1F408C';
    ctx.font = '50px LilitaOne';
    const tw = ctx.measureText('GAWAIN NGAYON').width;
    ctx.fillText('GAWAIN NGAYON', 24, 16);
    ctx.font = '28px LilitaOne';
    ctx.fillText("today's work", 24 + tw + 14, 34);
    if (shown.length === 0) {
      ctx.fillStyle = '#9A9088';
      ctx.font = '28px MergeOne';
      ctx.fillText('Walang nakasulat pa. (Nothing on the board yet.)', 24, 96);
      return;
    }
    let y = 88;
    for (const item of shown) {
      const owner = s.get(item.owner);
      const [box, boxColour] =
        item.status === 'completed' ? ['[x]', '#2E8B2E'] : item.status === 'failed' ? ['[!]', '#C0302A'] : item.status === 'in_progress' ? ['[~]', '#D97C2A'] : ['[ ]', '#2E1F14'];
      ctx.font = '30px LilitaOne';
      ctx.fillStyle = boxColour;
      ctx.fillText(box, 24, y);
      ctx.font = '29px MergeOne';
      ctx.fillStyle = isDone(item) ? '#7A7068' : '#261E19';
      const ownerName = owner ? owner.name : '';
      ctx.font = '22px LilitaOne';
      const ownerW = ownerName ? ctx.measureText(ownerName).width + 16 : 0;
      ctx.font = '29px MergeOne';
      const used = fitText(ctx, item.text, 82, y, w - 110 - ownerW);
      if (isDone(item)) ctx.fillRect(82, y + 16, used, 2.5);
      if (owner) {
        ctx.font = '22px LilitaOne';
        ctx.fillStyle = owner.entry.color;
        ctx.fillText(ownerName, 82 + used + 12, y + 6);
      }
      y += 41;
    }
  });
  return (
    <group position={[WHITEBOARD.x, WHITEBOARD.y, WHITEBOARD.z]}>
      <B at={[0, 0, 0]} size={[3.7, 2.1, 0.05]} colour="#B8BDC2" rough={0.4} />
      <mesh position={[0, 0, 0.031]}>
        <planeGeometry args={[3.55, 1.95]} />
        <meshStandardMaterial map={texture} roughness={0.35} />
      </mesh>
      <B at={[0, -1.08, 0.06]} size={[3.0, 0.04, 0.1]} colour="#B8BDC2" rough={0.4} />
      {(
        [
          [-0.4, '#1A3399'],
          [-0.25, '#CC2619'],
          [-0.1, '#1A8026'],
        ] as const
      ).map(([x, c]) => (
        <B key={x} at={[x, -1.05, 0.07]} size={[0.12, 0.025, 0.025]} colour={c} />
      ))}
    </group>
  );
}

/**
 * A wall board in the shape of PAGASA's tropical cyclone wind signal: the number is the session's health, from 1 (all
 * quiet) to 5 (errors, or something blocked on you). At 4 and 5 the lamps pulse, slowly (well under 3 flashes a second).
 */
export function SignalBoard({ director }: { director: Director }) {
  useDirectorVersion(director);
  const signal = director.state.signal(Date.now());
  const colour = signalColour(signal);
  const texture = useCanvasTexture(540, 600, `signal-${signal}`, (ctx, w, h) => {
    const back = new THREE.Color('#1A3373').lerp(new THREE.Color(colour), 0.35);
    ctx.fillStyle = `#${back.getHexString()}`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '40px LilitaOne';
    ctx.fillText('TROPICAL CYCLONE', w / 2, 62);
    ctx.fillText('WIND SIGNAL', w / 2, 106);
    ctx.font = '250px LilitaOne';
    ctx.fillText(String(signal), w / 2, 270);
    ctx.font = '34px MergeOne';
    fitText(ctx, SIGNAL_WORDS[Math.min(5, Math.max(1, signal))], w / 2, 440, w - 40);
  });
  const lamps = useMemo(
    () => Array.from({ length: 5 }, () => new THREE.MeshStandardMaterial({ color: '#332E29', roughness: 0.5, emissive: new THREE.Color(0, 0, 0) })),
    [],
  );
  const signalRef = useRef(signal);
  signalRef.current = signal;
  useFrame(({ clock }) => {
    const sig = signalRef.current;
    const c = new THREE.Color(signalColour(sig));
    const pulse = sig >= 4 ? 0.65 + 0.35 * Math.sin(clock.elapsedTime * 5) : 1;
    lamps.forEach((m, i) => {
      const on = i < sig;
      m.color.set(on ? c : '#332E29');
      m.emissive.copy(on ? c : new THREE.Color(0, 0, 0));
      m.emissiveIntensity = on ? 0.9 * pulse : 0;
    });
  });
  return (
    <group position={[SIGNAL_BOARD.x, SIGNAL_BOARD.y, SIGNAL_BOARD.z]}>
      <B at={[0, 0, -0.02]} size={[1.92, 2.12, 0.04]} colour="#F2F2F2" />
      <mesh position={[0, 0.0, 0.021]}>
        <planeGeometry args={[1.8, 2.0]} />
        <meshStandardMaterial map={texture} roughness={0.7} />
      </mesh>
      <B at={[0, 1.22, 0.0]} size={[0.4, 0.4, 0.03]} colour="#D9261F" rot={[0, 0, 45 * DEG]} />
      {lamps.map((m, i) => (
        <S key={i} at={[-0.6 + i * 0.3, -0.8, 0.06]} size={[0.16, 0.16, 0.16]} colour="#332E29" material={m} shadow={false} />
      ))}
    </group>
  );
}

interface MapData {
  boundary: [number, number][][];
  roads: { main: boolean; points: [number, number][] }[];
  waterways: { wide: boolean; points: [number, number][] }[];
  landmarks: { name: string; at: [number, number]; shelter: boolean; essential: boolean }[];
}

/** The planning table in the middle of the room, with a plan of Barangay Mabuhay drawn from the game's map data. */
export function MapTable() {
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => {
    fetch('/mabuhay-map.json')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d as MapData | null))
      .catch(() => setData(null));
  }, []);
  const texture = useCanvasTexture(1024, 1024, data ? `map-${data.roads.length}` : 'paper', (ctx, w, h) => drawMap(ctx, w, h, data));
  const wood = '#7A4F2E';
  return (
    <group position={[MAP_TABLE[0], 0, MAP_TABLE[1]]}>
      <B at={[0, 0.86, 0]} size={[4.4, 0.1, 3.4]} colour={wood} rough={0.7} />
      <B at={[0, 0.92, 0]} size={[4.5, 0.03, 3.5]} colour="#4D301C" />
      {[-1.9, 1.9].flatMap(x => [-1.4, 1.4].map(z => <B key={`${x}${z}`} at={[x, 0.4, z]} size={[0.12, 0.8, 0.12]} colour={wood} />))}
      <mesh position={[0, 0.94, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 3.2]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      {(
        [
          [-1.0, -0.6, '#D9331F'],
          [0.7, 0.4, '#268C33'],
          [0.2, -1.1, '#F2BF33'],
        ] as const
      ).map(([x, z, c]) => (
        <group key={c} position={[x, 0.94, z]}>
          <C at={[0, 0.06, 0]} size={[0.015, 0.12, 0.015]} colour="#CCCCCC" />
          <S at={[0, 0.13, 0]} size={[0.06, 0.06, 0.06]} colour={c} />
        </group>
      ))}
      {/* Handheld radio. */}
      <group position={[1.9, 0.93, 1.2]} rotation={[0, 30 * DEG, 0]}>
        <B at={[0, 0.09, 0]} size={[0.09, 0.18, 0.05]} colour="#262626" />
        <C at={[0.025, 0.24, 0]} size={[0.012, 0.14, 0.012]} colour="#262626" />
        <B at={[0, 0.12, 0.026]} size={[0.06, 0.05, 0.002]} colour="#7FBF7F" glow="#5FA05F" shadow={false} />
      </group>
    </group>
  );
}

/** Draws the plan the way the Unity HQ's MapTable did: land, waterways, roads, the boundary, landmarks, the hall. */
function drawMap(ctx: CanvasRenderingContext2D, w: number, h: number, data: MapData | null) {
  ctx.fillStyle = '#EDDBB3';
  ctx.fillRect(0, 0, w, h);
  if (!data || data.boundary.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of data.boundary)
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const span = Math.max(maxX - minX, maxY - minY) * 1.08;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // North is up on the paper, which faces the back wall.
  const px = (x: number) => ((x - cx) / span + 0.5) * w;
  const py = (y: number) => (0.5 - (y - cy) / span) * h;
  const path = (pts: [number, number][], close = false) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    if (close) ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = '#B8CC8C';
  for (const ring of data.boundary) {
    path(ring, true);
    ctx.fill();
  }
  ctx.strokeStyle = '#4D94D9';
  for (const wv of data.waterways) {
    ctx.lineWidth = wv.wide ? 4.5 : 2.4;
    path(wv.points);
    ctx.stroke();
  }
  for (const pass of [false, true])
    for (const r of data.roads) {
      if (r.main !== pass) continue;
      ctx.strokeStyle = r.main ? '#FFD173' : '#FAF2E0';
      ctx.lineWidth = r.main ? 4.2 : 2.1;
      path(r.points);
      ctx.stroke();
    }
  ctx.strokeStyle = '#6B401F';
  ctx.lineWidth = 3.4;
  ctx.setLineDash([10, 6]);
  for (const ring of data.boundary) {
    path(ring, true);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const l of data.landmarks) {
    ctx.fillStyle = l.shelter ? '#268C33' : '#D12E26';
    ctx.beginPath();
    ctx.arc(px(l.at[0]), py(l.at[1]), l.essential ? 6.5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#F28C26';
  ctx.strokeStyle = '#5C3A1C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px(0), py(0), 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5C3A1C';
  ctx.font = '26px LilitaOne';
  ctx.textAlign = 'left';
  ctx.fillText('BRGY. MABUHAY', 20, h - 24);
}
