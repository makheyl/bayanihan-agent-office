'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Director } from '@/lib/director';
import { statusColour, statusText } from '@/lib/format';
import type { AgentState } from '@/lib/state/agentState';
import { useDirectorVersion } from '../useDirector';
import { fitText, useCanvasTexture, wrapText } from './canvasTexture';
import type { DeskSpot } from './layout';
import { B, C, DEG, S } from './prims';

const METAL = '#3F3D3A';
const BEZEL = '#171719';
const DESK_WOOD = '#BD8C5C';
const FABRIC = '#33383F';

/**
 * One desk, ported from the Unity HQ's DeskStation: the monitor shows what its agent is doing and glows while it works,
 * the nameplate carries its name and colour, and the lamp turns yellow while it waits for you and red on an error.
 */
export function Desk({ spot, agent, director }: { spot: DeskSpot; agent: AgentState | undefined; director: Director }) {
  useDirectorVersion(director);
  const { w, d, big } = spot;
  const chairZ = d / 2 + 0.42;
  const lampX = -w / 2 + 0.2;
  return (
    <group position={[spot.x, 0, spot.z]}>
      <B at={[0, 0.74, 0]} size={[w, 0.05, d]} colour={DESK_WOOD} rough={0.65} />
      <B at={[-w / 2 + 0.04, 0.36, 0]} size={[0.05, 0.72, d - 0.05]} colour={METAL} rough={0.5} />
      <B at={[w / 2 - 0.04, 0.36, 0]} size={[0.05, 0.72, d - 0.05]} colour={METAL} rough={0.5} />
      <B at={[0, 0.45, -d / 2 + 0.04]} size={[w - 0.1, 0.5, 0.03]} colour={METAL} rough={0.5} />
      {big && <B at={[0.85, 0.36, 0]} size={[0.5, 0.72, d - 0.1]} colour={DESK_WOOD} rough={0.65} />}

      <B at={[0, 0.83, -0.2]} size={[0.08, 0.16, 0.08]} colour={METAL} rough={0.5} />
      <B at={[0, 1.1, -0.2]} size={[0.68, 0.44, 0.04]} colour={BEZEL} rough={0.4} />
      <Monitor agent={agent} />
      {big && (
        <group position={[-0.78, 1.1, -0.15]} rotation={[0, 18 * DEG, 0]}>
          <B at={[0, -0.27, 0]} size={[0.08, 0.16, 0.08]} colour={METAL} rough={0.5} />
          <B at={[0, 0, 0]} size={[0.68, 0.44, 0.04]} colour={BEZEL} rough={0.4} />
          <mesh position={[0, 0, 0.023]}>
            <planeGeometry args={[0.62, 0.38]} />
            <meshBasicMaterial color="#2E7A66" toneMapped={false} />
          </mesh>
        </group>
      )}
      <B at={[0, 0.775, 0.12]} size={[0.44, 0.02, 0.14]} colour={BEZEL} rough={0.4} />
      <C at={[-0.5, 0.82, 0.05]} size={[0.08, 0.1, 0.08]} colour="#F2F2EB" rough={0.5} />
      <B at={[0.42, 0.775, -0.05]} size={[0.24, 0.02, 0.32]} colour="#EDCC80" rot={[0, -12 * DEG, 0]} />

      <Nameplate agent={agent} at={[w / 2 - 0.36, 0.86, d / 2 - 0.08]} />

      <C at={[lampX, 0.78, -0.22]} size={[0.14, 0.03, 0.14]} colour={METAL} rough={0.5} />
      <B at={[lampX, 0.98, -0.18]} size={[0.025, 0.4, 0.025]} colour={METAL} rough={0.5} rot={[12 * DEG, 0, 0]} />
      <Lamp agent={agent} at={[lampX, 1.17, -0.1]} />

      {/* Chair. */}
      <B at={[0, 0.44, chairZ]} size={[0.48, 0.07, 0.46]} colour={FABRIC} />
      <B at={[0, 0.78, chairZ + 0.24]} size={[0.46, 0.55, 0.06]} colour={FABRIC} rot={[8 * DEG, 0, 0]} />
      <C at={[0, 0.22, chairZ]} size={[0.06, 0.4, 0.06]} colour={METAL} rough={0.5} />
      <B at={[0, 0.03, chairZ]} size={[0.55, 0.04, 0.06]} colour={METAL} rough={0.5} />
      <B at={[0, 0.03, chairZ]} size={[0.06, 0.04, 0.55]} colour={METAL} rough={0.5} />
    </group>
  );
}

function Monitor({ agent }: { agent: AgentState | undefined }) {
  const status = agent?.status ?? 'Idle';
  const away = !agent || (!agent.present && !agent.isLead);
  const key = agent
    ? [status, away, agent.currentTask, agent.activity, agent.toolCount, agent.filesTouched.size].join('|')
    : 'empty';
  const texture = useCanvasTexture(384, 236, key, (ctx, w, h) => {
    const tint = new THREE.Color('#141F29').lerp(new THREE.Color(statusColour(status)), status === 'Idle' ? 0.05 : 0.22);
    ctx.fillStyle = `#${tint.getHexString()}`;
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'top';
    if (!agent) return;
    if (away) {
      ctx.fillStyle = '#8C7B6B';
      ctx.font = '26px MergeOne';
      fitText(ctx, 'Wala pa · not here yet', 14, 14, w - 28);
      return;
    }
    ctx.fillStyle = statusColour(status);
    ctx.font = '34px LilitaOne';
    fitText(ctx, statusText(status).toUpperCase(), 14, 10, w - 28);
    let y = 54;
    if (agent.currentTask) {
      ctx.fillStyle = '#F8D5A6';
      ctx.font = '22px MergeOne';
      for (const line of wrapText(ctx, agent.currentTask, w - 28, 2)) {
        ctx.fillText(line, 14, y);
        y += 26;
      }
    }
    if (agent.activity) {
      ctx.fillStyle = '#FDEACF';
      ctx.font = '24px MergeOne';
      for (const line of wrapText(ctx, agent.activity, w - 28, 2)) {
        ctx.fillText(line, 14, y + 4);
        y += 28;
      }
    }
    ctx.fillStyle = '#B8A48C';
    ctx.font = '20px MergeOne';
    ctx.fillText(`tools ${agent.toolCount} · files ${agent.filesTouched.size}`, 14, h - 30);
  });
  // A sleeping monitor is dim; work makes it bright.
  const glow = status === 'Idle' ? 0.5 : status === 'Working' ? 1.0 : 0.82;
  return (
    <mesh position={[0, 1.1, -0.177]}>
      <planeGeometry args={[0.62, 0.38]} />
      <meshBasicMaterial map={texture} color={new THREE.Color(glow, glow, glow)} toneMapped={false} />
    </mesh>
  );
}

function Nameplate({ agent, at }: { agent: AgentState | undefined; at: [number, number, number] }) {
  const texture = useCanvasTexture(330, 100, agent ? `${agent.name}|${agent.entry.role}` : 'none', (ctx, w, h) => {
    ctx.fillStyle = '#F7EDD6';
    ctx.fillRect(0, 0, w, h);
    if (!agent) return;
    ctx.fillStyle = '#2E1F14';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '46px LilitaOne';
    fitText(ctx, agent.name, w / 2, h * 0.38, w - 16);
    ctx.font = '24px MergeOne';
    fitText(ctx, agent.entry.role, w / 2, h * 0.78, w - 16);
  });
  return (
    <group position={at} rotation={[12 * DEG, 0, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.66, 0.2, 0.03]} />
        <meshStandardMaterial color="#F7EDD6" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[0.66, 0.2]} />
        <meshStandardMaterial map={texture} roughness={0.8} />
      </mesh>
      <B at={[0, -0.1, 0.02]} size={[0.66, 0.035, 0.035]} colour={agent?.entry.color ?? '#999999'} />
    </group>
  );
}

const WARM = new THREE.Color(1, 0.8, 0.55);
const RED = new THREE.Color(1, 0.2, 0.15);
const YELLOW = new THREE.Color(1, 0.85, 0.3);

function Lamp({ agent, at }: { agent: AgentState | undefined; at: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  const bulb = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFE6B3', emissive: WARM.clone(), emissiveIntensity: 1.2 }), []);
  useFrame(() => {
    const s = agent?.status ?? 'Idle';
    const present = !!agent && (agent.present || agent.isLead);
    const colour = s === 'Error' ? RED : s === 'Waiting' ? YELLOW : WARM;
    const alarm = s === 'Error' || s === 'Waiting';
    if (light.current) {
      light.current.color.copy(colour);
      light.current.intensity = alarm ? 5 : present ? 1.6 : 0.3;
    }
    bulb.emissive.copy(colour);
    bulb.emissiveIntensity = alarm ? 3 : present ? 1.6 : 0.25;
  });
  return (
    <group position={at}>
      <S at={[0, 0, 0]} size={[0.09, 0.09, 0.09]} colour="#FFE6B3" material={bulb} shadow={false} />
      <pointLight ref={light} position={[0, -0.05, 0.08]} distance={2.6} decay={2} intensity={1.6} />
    </group>
  );
}
