'use client';

import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCanvasTexture } from './canvasTexture';
import { KUBO, PLANTS, ROOM, SARI_SARI } from './layout';
import { B, C, DEG, S, mat } from './prims';

const WOOD = '#9E7047';
const PLYWOOD = '#EDD4A8';
const WAINSCOT = '#8C542E';
const TRIM = '#4D301C';

/** The room itself and everything in it that never changes: walls, windows, banner, kubo, sari-sari corner and props. */
export const Room = memo(function Room() {
  const h = ROOM.wallHeight;
  const backWall = useRef<THREE.Group>(null);
  const rightWall = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (backWall.current) backWall.current.visible = camera.position.z > ROOM.backZ;
    if (rightWall.current) rightWall.current.visible = camera.position.x < ROOM.rightX;
  });
  return (
    <group>
      {/* Floor planks with seams every two metres. */}
      <B at={[0, -0.1, 0]} size={[ROOM.width, 0.2, ROOM.depth]} colour={WOOD} rough={0.75} shadow={false} />
      {Array.from({ length: 12 }, (_, i) => -11 + i * 2).map(x => (
        <B key={x} at={[x + 0.5, 0.001, 0]} size={[0.03, 0.002, 16.2]} colour={TRIM} shadow={false} />
      ))}

      {/* Back wall with the doorway near the right corner, and the right wall. The front and left are open to the camera;
          a wall the camera has been orbited behind is hidden, so the people stay in view. */}
      <group ref={backWall}>
        <B at={[-1.2, h / 2, ROOM.backZ]} size={[21.6, h, 0.2]} colour={PLYWOOD} shadow={false} />
        <B at={[11.75, h / 2, ROOM.backZ]} size={[0.7, h, 0.2]} colour={PLYWOOD} shadow={false} />
        <B at={[10.5, 2.75, ROOM.backZ]} size={[1.8, 0.9, 0.2]} colour={PLYWOOD} shadow={false} />
        <B at={[9.55, 1.15, -8.0]} size={[0.12, 2.3, 0.3]} colour={TRIM} />
        <B at={[11.45, 1.15, -8.0]} size={[0.12, 2.3, 0.3]} colour={TRIM} />
        <B at={[10.5, 2.3, -8.0]} size={[2.0, 0.12, 0.3]} colour={TRIM} />
        <B at={[10.5, 1.15, -8.6]} size={[2, 2.3, 0.05]} colour="#FFF2CC" glow="#FFE6B3" glowIntensity={1.2} shadow={false} />
        <B at={[-1.2, 0.5, -7.99]} size={[21.6, 1.0, 0.03]} colour={WAINSCOT} shadow={false} />
        <B at={[-1.2, 1.02, -7.97]} size={[21.6, 0.06, 0.06]} colour={TRIM} shadow={false} />
      </group>
      <group ref={rightWall}>
        <B at={[ROOM.rightX, h / 2, 0]} size={[0.2, h, ROOM.depth]} colour={PLYWOOD} shadow={false} />
        <B at={[11.99, 0.5, 0]} size={[0.03, 1.0, 16.2]} colour={WAINSCOT} shadow={false} />
        <B at={[11.97, 1.02, 0]} size={[0.06, 0.06, 16.2]} colour={TRIM} shadow={false} />
      </group>
      <B at={[0, 0.06, 8.15]} size={[ROOM.width, 0.12, 0.1]} colour={TRIM} shadow={false} />
      <B at={[-12.15, 0.06, 0]} size={[0.1, 0.12, ROOM.depth]} colour={TRIM} shadow={false} />

      {/* Capiz shell windows on the right wall. */}
      {[-4.5, 0, 4.5].map(z => (
        <group key={z}>
          <B at={[11.98, 1.9, z]} size={[0.06, 1.5, 2.3]} colour={TRIM} shadow={false} />
          {Array.from({ length: 24 }, (_, i) => (
            <B
              key={i}
              at={[11.94, 1.33 + Math.floor(i / 6) * 0.36, z - 0.95 + (i % 6) * 0.38]}
              size={[0.02, 0.32, 0.34]}
              colour="#FAF2DB"
              rough={0.4}
              glow="#FFEBBF"
              glowIntensity={0.55}
              shadow={false}
            />
          ))}
        </group>
      ))}

      <Banner />
      <Kubo />
      <SariSari />
      <Props />
    </group>
  );
});

/** "BARANGAY MABUHAY DRRM OPERATIONS CENTER" over the lead's desk. */
function Banner() {
  const texture = useCanvasTexture(1280, 160, 'banner', (ctx, w, h) => {
    ctx.fillStyle = '#1A295C';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FCDB59';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '62px LilitaOne';
    ctx.fillText('BARANGAY MABUHAY DRRM OPERATIONS CENTER', w / 2, h * 0.4);
    ctx.font = '34px LilitaOne';
    ctx.fillText('BAYANIHAN HQ · CARMONA, CAVITE', w / 2, h * 0.78);
  });
  return (
    <group position={[0, 2.62, -7.97]}>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[6.4, 0.8]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      <B at={[0, -0.39, 0.03]} size={[6.4, 0.05, 0.03]} colour="#FAC738" rough={0.6} shadow={false} />
    </group>
  );
}

/** The kubo lounge: a nipa hut with a bamboo papag, a low table with merienda, and two plastic chairs. */
function Kubo() {
  const roof = useMemo(() => {
    // A four-sided cone is a pyramid; turned 45° and stretched to the 3.8 × 3.0 m footprint.
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    return g;
  }, []);
  const bamboo = '#C7A861';
  return (
    <group position={[KUBO[0], 0, KUBO[1]]}>
      {[-1.5, 1.5].flatMap(x => [-1.1, 1.1].map(z => <C key={`${x}${z}`} at={[x, 1.15, z]} size={[0.12, 2.3, 0.12]} colour={bamboo} />))}
      <mesh geometry={roof} material={mat('#9E7A42', 0.95)} position={[0, 2.85, 0]} scale={[3.8, 1.1, 3.0]} castShadow receiveShadow />
      <B at={[0, 0.22, -0.3]} size={[2.2, 0.08, 0.9]} colour={bamboo} />
      {[-1, 1].map(x => (
        <B key={x} at={[x, 0.1, -0.3]} size={[0.08, 0.2, 0.8]} colour={bamboo} />
      ))}
      <C at={[0, 0.35, 0.6]} size={[0.7, 0.04, 0.7]} colour={bamboo} />
      <C at={[0, 0.17, 0.6]} size={[0.08, 0.34, 0.08]} colour={bamboo} />
      <C at={[0.15, 0.47, 0.6]} size={[0.12, 0.2, 0.12]} colour="#CC3326" />
      <S at={[-0.15, 0.42, 0.55]} size={[0.22, 0.12, 0.22]} colour="#B3803F" />
      <PlasticChair at={[-1.1, 0, 1.5]} turn={-30} />
      <PlasticChair at={[0.9, 0, 1.6]} turn={25} />
    </group>
  );
}

function PlasticChair({ at, turn }: { at: [number, number, number]; turn: number }) {
  const c = '#E8EEF2';
  return (
    <group position={at} rotation={[0, turn * DEG, 0]}>
      <B at={[0, 0.42, 0]} size={[0.44, 0.04, 0.42]} colour={c} rough={0.5} />
      <B at={[0, 0.68, -0.2]} size={[0.44, 0.5, 0.04]} colour={c} rough={0.5} rot={[-8 * DEG, 0, 0]} />
      {[-0.19, 0.19].flatMap(x => [-0.18, 0.18].map(z => <B key={`${x}${z}`} at={[x, 0.2, z]} size={[0.04, 0.42, 0.04]} colour={c} rough={0.5} />))}
    </group>
  );
}

/** A sari-sari store corner against the right wall: counter, shelves of goods, hanging snack strips and a sign. */
function SariSari() {
  const sign = useCanvasTexture(640, 112, 'sari-sari', (ctx, w, h) => {
    ctx.fillStyle = '#FAD133';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#B31F1A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '76px LilitaOne';
    ctx.fillText('SARI-SARI STORE', w / 2, h / 2 + 4);
  });
  const wood = '#8C5C33';
  const [x, z] = SARI_SARI;
  const goods = useMemo(
    () =>
      Array.from({ length: 27 }, (_, i) => {
        const row = Math.floor(i / 9);
        const col = i % 9;
        return { row, col, colour: `hsl(${((col * 37 + row * 91) % 100) * 3.6}, 65%, 58%)` };
      }),
    [],
  );
  return (
    <group>
      {/* Counter facing the room. */}
      <B at={[x - 0.6, 0.5, z]} size={[0.6, 1.0, 2.0]} colour={wood} />
      <B at={[x - 0.6, 1.02, z]} size={[0.7, 0.04, 2.1]} colour="#6E4426" />
      {/* Shelves against the wall, goods facing the room. */}
      <B at={[x + 0.8, 1.4, z]} size={[0.08, 1.6, 2.0]} colour={wood} />
      {[0, 1, 2].map(row => (
        <B key={row} at={[x + 0.6, 0.95 + row * 0.45, z]} size={[0.32, 0.04, 2.0]} colour={wood} />
      ))}
      {goods.map(g => (
        <B key={`${g.row}-${g.col}`} at={[x + 0.6, 1.07 + g.row * 0.45, z - 0.88 + g.col * 0.22]} size={[0.16, 0.2, 0.16]} colour={g.colour} rough={0.6} />
      ))}
      {/* Snack strips hanging over the counter. */}
      <B at={[x - 0.9, 2.35, z]} size={[0.03, 0.03, 2.0]} colour={TRIM} />
      {Array.from({ length: 8 }, (_, i) => (
        <B key={i} at={[x - 0.9, 2.05, z - 0.85 + i * 0.24]} size={[0.01, 0.6, 0.12]} colour={`hsl(${(i * 83) % 360}, 75%, 58%)`} rough={0.5} shadow={false} />
      ))}
      <B at={[x + 0.85, 2.55, z]} size={[0.05, 0.36, 2.0]} colour="#FAD133" shadow={false} />
      <mesh position={[x + 0.82, 2.55, z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.98, 0.34]} />
        <meshStandardMaterial map={sign} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Rescue gear by the door, a lifebuoy on the wall, a supply cabinet with a first-aid box, buckets and plants. */
function Props() {
  return (
    <group>
      {/* Rescue gear: a stack of orange life vests and a coil of rope. */}
      <group position={[8.2, 0, -7.4]}>
        {[0, 1, 2, 3].map(i => (
          <B key={i} at={[-0.25, 0.08 + i * 0.13, 0]} size={[0.55, 0.12, 0.4]} colour={i % 2 ? '#F07A1F' : '#E8661A'} rot={[0, (i * 7 - 10) * DEG, 0]} />
        ))}
        <mesh position={[0.4, 0.08, 0.05]} rotation={[-Math.PI / 2, 0, 0]} castShadow material={mat('#D9C79A')}>
          <torusGeometry args={[0.22, 0.06, 8, 18]} />
        </mesh>
        <B at={[0.3, 0.45, -0.25]} size={[0.6, 0.9, 0.12]} colour="#2F5F8F" />
      </group>
      {/* Lifebuoy on the right wall. */}
      <group position={[11.93, 1.8, 2.25]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh castShadow material={mat('#F06424', 0.6)}>
          <torusGeometry args={[0.26, 0.08, 10, 24]} />
        </mesh>
        {[0, 1, 2, 3].map(i => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2 + Math.PI / 4]} material={mat('#F7F7F2', 0.6)}>
            <torusGeometry args={[0.26, 0.085, 10, 4, 0.35]} />
          </mesh>
        ))}
      </group>
      {/* Supply cabinet with a first-aid box on top. */}
      <B at={[-11.3, 0.45, -7.4]} size={[1.2, 0.9, 0.6]} colour="#597A59" />
      <B at={[-11.3, 1.05, -7.4]} size={[0.5, 0.3, 0.35]} colour="#F2F2EE" />
      <B at={[-11.3, 1.05, -7.22]} size={[0.08, 0.2, 0.01]} colour="#CC2A22" shadow={false} />
      <B at={[-11.3, 1.05, -7.22]} size={[0.2, 0.08, 0.01]} colour="#CC2A22" shadow={false} />
      {/* Buckets in the corner beside the door. */}
      <C at={[11.65, 0.2, -6.95]} size={[0.36, 0.4, 0.36]} colour="#2E6CC2" rough={0.5} />
      <C at={[11.7, 0.2, -7.6]} size={[0.36, 0.4, 0.36]} colour="#E9C12F" rough={0.5} />
      {/* Potted plants. */}
      {PLANTS.map(([px, pz]) => (
        <group key={`${px}${pz}`} position={[px, 0, pz]}>
          <C at={[0, 0.22, 0]} size={[0.5, 0.44, 0.5]} colour="#B3613A" />
          <S at={[0, 0.75, 0]} size={[0.75, 0.7, 0.75]} colour="#4E8C3A" rough={0.9} />
          <S at={[0.18, 1.0, 0.1]} size={[0.45, 0.5, 0.45]} colour="#5FA046" rough={0.9} />
        </group>
      ))}
    </group>
  );
}
