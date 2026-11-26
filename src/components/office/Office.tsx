'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Director } from '@/lib/director';
import { Whiteboard, SignalBoard, MapTable } from './Boards';
import { CameraRig } from './CameraRig';
import { Desk } from './Desk';
import { DESKS, ROOM, obstacles, seatOf } from './layout';
import { NavGrid } from './navGrid';
import { BreakCorner } from './responderBrain';
import { Responder } from './Responder';
import { Room } from './Room';

interface Props {
  director: Director;
  selected: string | null;
  onPick: (key: string) => void;
  reducedMotion: boolean;
}

/**
 * The Barangay Mabuhay DRRM operations centre in 3D: the room, a desk per roster slot, the boards and map table, and a
 * responder for every agent. Warm afternoon light through the capiz windows, like the Unity HQ's scene.
 */
export default function Office({ director, onPick, reducedMotion }: Props) {
  const nav = useMemo(
    () => new NavGrid({ minX: -12.1, maxX: ROOM.rightX - 0.1, minZ: ROOM.backZ + 0.1, maxZ: 8.2, blocks: obstacles(), pad: 0.3 }),
    [],
  );
  const corner = useMemo(() => new BreakCorner(), []);
  useEffect(() => director.onRebuilt(() => corner.releaseAll()), [director, corner]);

  const seats = useMemo(() => new Map(DESKS.map(d => [d.slot, seatOf(d)] as const)), []);
  const agents = director.state.agents;

  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 2]}
      camera={{ position: [-16.7, 25.2, 26.2], zoom: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <color attach="background" args={['#291C14']} />
      <hemisphereLight args={['#9E9485', '#382B1F', 1.6]} />
      <ambientLight intensity={0.35} color="#FFE8CC" />
      <directionalLight
        position={[19.7, 20, 10.5]}
        intensity={2.6}
        color="#FFDBA8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />

      <Room />
      <MapTable />
      <Whiteboard director={director} />
      <SignalBoard director={director} />
      {DESKS.map(d => (
        <Desk key={d.slot} spot={d} agent={agents.find(a => a.entry.desk === d.slot)} director={director} />
      ))}
      {agents.map(a => {
        const seat = seats.get(a.entry.desk);
        return seat ? <Responder key={a.key} agent={a} seat={seat} nav={nav} corner={corner} director={director} reducedMotion={reducedMotion} /> : null;
      })}

      <CameraRig director={director} onPick={onPick} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
