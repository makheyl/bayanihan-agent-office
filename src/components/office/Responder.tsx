'use client';

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Director } from '@/lib/director';
import type { AgentState } from '@/lib/state/agentState';
import { officeBus, type ResponderHandle } from '../officeBus';
import { useDirectorVersion } from '../useDirector';
import { SEAT_HEIGHT, type XZ } from './layout';
import type { NavGrid } from './navGrid';
import { mat } from './prims';
import { ResponderBrain, type BreakCorner } from './responderBrain';

// Body sizes in metres. Standing hips are at 0.93, a hard hat tops out at about 1.82.
const THIGH = 0.42;
const SHIN = 0.4;
const STAND_HIPS = 0.93;
const SIT_HIPS = SEAT_HEIGHT + 0.09;
const NECK = 0.52;

const SKIN = ['#C68E5E', '#B07A4F', '#D19A6A', '#9C6644', '#BF8A5C', '#A8714A', '#C99366', '#8F5E3D'];
const SHIRTS = ['#F2F2EE', '#9FB8D9', '#7A7F87', '#8C3B3B', '#6F7F4F', '#D9CBA3', '#3F5F7F', '#B5655A', '#E3D7C4', '#4F4F5F'];
const PANTS = ['#2F3A52', '#5C5446', '#3B4A63', '#29303B', '#6B5B45'];
const HAIR = ['#1A1410', '#2B1E16', '#14110F'];

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.IcosahedronGeometry(1, 1);
const hatGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const brimGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const diamondGeo = new THREE.OctahedronGeometry(1);
const confettiGeo = new THREE.PlaneGeometry(0.07, 0.045);
const diamondMat = new THREE.MeshBasicMaterial({ color: '#FFD633', depthTest: false, transparent: true, toneMapped: false });
const CONFETTI = 45;

function pick<T>(list: T[], key: string, salt: number): T {
  let h = salt;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

interface Props {
  agent: AgentState;
  seat: XZ;
  nav: NavGrid;
  corner: BreakCorner;
  director: Director;
  reducedMotion: boolean;
}

/**
 * One responder: a low-poly volunteer in a role-colour vest and hard hat, driven by a ResponderBrain. Poses are set in
 * code each frame, the way the game's CharacterPoses bends bones: typing while Working, looking at the screen while
 * Thinking, a hand up while Waiting, slumped on an Error, a wave and confetti when Done, and a walk cycle on the move.
 */
export function Responder({ agent, seat, nav, corner, director, reducedMotion }: Props) {
  useDirectorVersion(director);
  const brain = useMemo(() => new ResponderBrain(agent, seat, nav, corner), [agent, seat, nav, corner]);
  const look = useMemo(
    () => ({
      skin: pick(SKIN, agent.key, 7),
      shirt: pick(SHIRTS, agent.key, 13),
      pants: pick(PANTS, agent.key, 29),
      hair: pick(HAIR, agent.key, 3),
      hat: `#${new THREE.Color(agent.entry.color).lerp(new THREE.Color('#ffffff'), 0.15).getHexString()}`,
      phase: (agent.key.length * 1.7) % 10,
    }),
    [agent],
  );

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const diamond = useRef<THREE.Mesh>(null);
  const confetti = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo(
    () =>
      Array.from({ length: CONFETTI }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        spin: new THREE.Vector3(),
        life: 0,
      })),
    [],
  );
  const fired = useRef(0);
  const headTop = useRef(1.82);

  useEffect(() => {
    const offRebuilt = director.onRebuilt(() => brain.resetToDesk());
    const offSpawn = director.state.onSpawned(a => {
      if (a === agent) brain.onSpawned();
    });
    const handle: ResponderHandle = {
      get root() {
        return root.current!;
      },
      get headTop() {
        return headTop.current;
      },
      visible: () => brain.mode !== 'Hidden' && !!root.current,
    };
    officeBus.responders.set(agent.key, handle);
    return () => {
      offRebuilt();
      offSpawn();
      officeBus.responders.delete(agent.key);
    };
  }, [agent, brain, director]);

  useEffect(() => {
    if (!confetti.current) return;
    const colours = [new THREE.Color('#FFD140'), new THREE.Color(agent.entry.color), new THREE.Color('#FDEACF')];
    for (let i = 0; i < CONFETTI; i++) confetti.current.setColorAt(i, colours[i % colours.length]);
    confetti.current.count = 0;
  }, [agent]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    brain.tick(Date.now(), t, dt);
    const g = root.current;
    if (!g) return;
    g.visible = brain.mode !== 'Hidden';
    if (!g.visible) return;
    g.position.set(brain.x, 0, brain.z);
    g.rotation.y = brain.facing;

    const status = agent.status;
    const k = 1 - Math.exp(-12 * dt);
    const seated = brain.seated;
    const walking = brain.walking;
    const waving = t < brain.waveUntil;
    const phase = brain.walkPhase;
    const swing = walking ? Math.sin(phase) : 0;

    // Targets for every joint (radians), then eased toward.
    let hipY = seated ? SIT_HIPS : STAND_HIPS + (walking ? Math.abs(Math.cos(phase)) * 0.03 : 0);
    let thighL = seated ? -Math.PI / 2 : swing * 0.55;
    let thighR = seated ? -Math.PI / 2 : -swing * 0.55;
    let shinL = seated ? Math.PI / 2 : walking ? Math.max(0, -Math.sin(phase)) * 0.7 : 0;
    let shinR = seated ? Math.PI / 2 : walking ? Math.max(0, Math.sin(phase)) * 0.7 : 0;
    let lean = Math.sin(t * 1.3 + look.phase) * 0.012;
    let headX = 0;
    let headY = 0;
    let uaL = seated ? -0.55 : -swing * 0.45;
    let uaR = seated ? -0.55 : swing * 0.45;
    let uaRz = 0;
    let elL = seated ? -0.7 : walking ? -0.25 : -0.1;
    let elR = seated ? -0.7 : walking ? -0.25 : -0.1;

    if (seated) {
      switch (status) {
        case 'Working': {
          const tt = t * 14 + look.phase;
          uaL = uaR = -0.72;
          elL = -1.0 - 0.14 * Math.max(0, Math.sin(tt * 1.3 + 1.7));
          elR = -1.0 - 0.14 * Math.max(0, Math.sin(tt));
          headX = 0.08;
          break;
        }
        case 'Thinking':
          uaR = -0.45;
          elR = -2.25;
          uaL = -0.7;
          elL = -0.9;
          headX = -0.06;
          headY = Math.sin(t * 0.7 + look.phase) * 0.12;
          break;
        case 'Waiting':
          uaR = -2.95;
          uaRz = -0.12;
          elR = -0.25;
          headX = -0.22;
          break;
        case 'Error':
          lean = 0.36;
          headX = 0.5;
          uaL = uaR = -0.15;
          elL = elR = -0.35;
          break;
      }
    }
    if (waving) {
      uaR = -2.6;
      uaRz = -0.25 + (reducedMotion ? 0 : Math.sin(t * 10) * 0.35);
      elR = -0.45;
    }

    ease(hips.current, 'py', hipY, k);
    ease(legL.current, 'rx', thighL, k);
    ease(legR.current, 'rx', thighR, k);
    ease(kneeL.current, 'rx', shinL, k);
    ease(kneeR.current, 'rx', shinR, k);
    ease(torso.current, 'rx', lean, k);
    ease(head.current, 'rx', headX, k);
    ease(head.current, 'ry', headY, k);
    ease(armL.current, 'rx', uaL, k);
    ease(armR.current, 'rx', uaR, k);
    ease(armR.current, 'rz', uaRz, k);
    ease(elbowL.current, 'rx', elL, k);
    ease(elbowR.current, 'rx', elR, k);
    headTop.current = (hips.current?.position.y ?? STAND_HIPS) + 0.06 + NECK + 0.3;

    // The waiting marker: a yellow diamond that bobs and spins above the head, drawn over everything.
    const d = diamond.current;
    if (d) {
      d.visible = status === 'Waiting';
      if (d.visible) {
        const bob = reducedMotion ? 0 : 0.08 * Math.sin(t * 4);
        d.position.set(0, headTop.current + 0.95 + bob, 0);
        d.rotation.set(0, reducedMotion ? 0 : t * 2.1, 0);
        const s = 0.2 + (reducedMotion ? 0 : 0.035 * Math.sin(t * 8));
        d.scale.set(s * 0.8, s, s * 0.8);
      }
    }

    // Confetti on Done: 45 bits from just above the head, a cone upward, falling under gravity.
    const c = confetti.current;
    if (c) {
      if (brain.celebrations !== fired.current) {
        fired.current = brain.celebrations;
        if (!reducedMotion) {
          for (const p of particles) {
            const a = Math.random() * Math.PI * 2;
            const tilt = Math.random() * 35 * (Math.PI / 180);
            const speed = 1.5 + Math.random() * 1.5;
            p.p.set(brain.x + (Math.random() - 0.5) * 0.1, headTop.current + 0.2, brain.z + (Math.random() - 0.5) * 0.1);
            p.v.set(Math.cos(a) * Math.sin(tilt) * speed, Math.cos(tilt) * speed, Math.sin(a) * Math.sin(tilt) * speed);
            p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
            p.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
            p.life = 1.2 + Math.random() * 0.6;
          }
        }
      }
      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.v.y -= 9.81 * 0.8 * dt;
        p.p.addScaledVector(p.v, dt);
        p.r.x += p.spin.x * dt;
        p.r.y += p.spin.y * dt;
        dummy.position.copy(p.p);
        dummy.rotation.copy(p.r);
        dummy.scale.setScalar(p.life > 0 ? 1 : 0);
        dummy.updateMatrix();
        c.setMatrixAt(alive++, dummy.matrix);
      }
      c.count = alive;
      c.instanceMatrix.needsUpdate = true;
    }
  });

  const vest = mat(agent.entry.color, 0.7);
  const bubble = brain.mode !== 'Hidden' ? brain.bubble : null;
  return (
    <>
      <group ref={root} visible={false}>
        <group ref={hips} position={[0, STAND_HIPS, 0]}>
          <Part at={[0, 0, 0]} size={[0.34, 0.16, 0.2]} colour={look.pants} />
          {(
            [
              [legL, kneeL, -0.09],
              [legR, kneeR, 0.09],
            ] as const
          ).map(([leg, knee, x]) => (
            <group key={x} ref={leg} position={[x, -0.04, 0]}>
              <Part at={[0, -THIGH / 2, 0]} size={[0.15, THIGH, 0.16]} colour={look.pants} />
              <group ref={knee} position={[0, -THIGH, 0]}>
                <Part at={[0, -SHIN / 2, 0]} size={[0.13, SHIN, 0.14]} colour={look.pants} />
                <Part at={[0, -SHIN - 0.03, 0.04]} size={[0.14, 0.07, 0.25]} colour="#2A2420" />
              </group>
            </group>
          ))}
          <group ref={torso} position={[0, 0.06, 0]}>
            <Part at={[0, 0.25, 0]} size={[0.36, 0.48, 0.21]} colour={look.shirt} />
            <mesh geometry={box} material={vest} position={[0, 0.28, 0]} scale={[0.385, 0.36, 0.235]} castShadow />
            <Part at={[0, 0.23, 0]} size={[0.39, 0.05, 0.24]} colour="#EBEBD1" />
            <group ref={head} position={[0, NECK, 0]}>
              <Part at={[0, 0.03, 0]} size={[0.09, 0.08, 0.09]} colour={look.skin} />
              <mesh geometry={ball} material={mat(look.skin, 0.75)} position={[0, 0.15, 0]} scale={[0.11, 0.125, 0.115]} castShadow />
              <mesh geometry={ball} material={mat(look.hair, 0.9)} position={[0, 0.19, -0.02]} scale={[0.115, 0.1, 0.115]} />
              <mesh geometry={hatGeo} material={mat(look.hat, 0.45)} position={[0, 0.215, 0]} scale={[0.135, 0.105, 0.145]} castShadow />
              <mesh geometry={brimGeo} material={mat(look.hat, 0.45)} position={[0, 0.215, 0.02]} scale={[0.16, 0.015, 0.18]} />
            </group>
            {(
              [
                [armL, elbowL, -0.235],
                [armR, elbowR, 0.235],
              ] as const
            ).map(([arm, elbow, x]) => (
              <group key={x} ref={arm} position={[x, 0.45, 0]}>
                <Part at={[0, -0.14, 0]} size={[0.1, 0.3, 0.11]} colour={look.shirt} />
                <group ref={elbow} position={[0, -0.29, 0]}>
                  <Part at={[0, -0.125, 0]} size={[0.085, 0.26, 0.09]} colour={look.skin} />
                  <Part at={[0, -0.29, 0]} size={[0.08, 0.08, 0.09]} colour={look.skin} />
                </group>
              </group>
            ))}
          </group>
        </group>
        <mesh ref={diamond} geometry={diamondGeo} material={diamondMat} renderOrder={10} visible={false} />
        {bubble && (
          <Html position={[0, headTop.current + 0.3, 0]} zIndexRange={[0, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`hq-bubble ${bubble.tone === 'normal' ? '' : bubble.tone}`}>{bubble.text}</div>
          </Html>
        )}
      </group>
      <instancedMesh ref={confetti} args={[confettiGeo, undefined, CONFETTI]} frustumCulled={false}>
        <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function Part({ at, size, colour }: { at: [number, number, number]; size: [number, number, number]; colour: string }) {
  return <mesh geometry={box} material={mat(colour, 0.8)} position={at} scale={size} castShadow />;
}

type Channel = 'py' | 'rx' | 'ry' | 'rz';

function ease(o: THREE.Object3D | null, channel: Channel, target: number, k: number): void {
  if (!o) return;
  switch (channel) {
    case 'py':
      o.position.y += (target - o.position.y) * k;
      break;
    case 'rx':
      o.rotation.x += (target - o.rotation.x) * k;
      break;
    case 'ry':
      o.rotation.y += (target - o.rotation.y) * k;
      break;
    case 'rz':
      o.rotation.z += (target - o.rotation.z) * k;
      break;
  }
}
