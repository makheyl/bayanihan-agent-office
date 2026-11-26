'use client';

import * as THREE from 'three';

/**
 * Low-poly building blocks. Every box, cylinder and sphere in the room shares one unit geometry and one material per
 * colour, so the office is a few hundred cheap meshes rather than a few hundred unique ones.
 */
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const sphere = new THREE.IcosahedronGeometry(0.5, 1);
const materials = new Map<string, THREE.MeshStandardMaterial>();

export type V3 = [number, number, number];

/** A shared lit material for a colour (and optional glow). */
export function mat(colour: string, roughness = 0.8, emissive?: string, emissiveIntensity = 1): THREE.MeshStandardMaterial {
  const key = `${colour}|${roughness}|${emissive ?? ''}|${emissiveIntensity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0 });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    materials.set(key, m);
  }
  return m;
}

interface PrimProps {
  at: V3;
  size: V3;
  colour: string;
  rot?: V3;
  rough?: number;
  glow?: string;
  glowIntensity?: number;
  /** Most furniture casts shadows; flat trim and wall panels don't need to. */
  shadow?: boolean;
  material?: THREE.Material;
}

/** A box of the given size (metres) centred at `at`. */
export function B({ at, size, colour, rot, rough, glow, glowIntensity, shadow = true, material }: PrimProps) {
  return (
    <mesh
      geometry={box}
      material={material ?? mat(colour, rough, glow, glowIntensity)}
      position={at}
      rotation={rot}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  );
}

/** A cylinder: size is [diameter x, height, diameter z]. */
export function C({ at, size, colour, rot, rough, glow, glowIntensity, shadow = true, material }: PrimProps) {
  return (
    <mesh
      geometry={cylinder}
      material={material ?? mat(colour, rough, glow, glowIntensity)}
      position={at}
      rotation={rot}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  );
}

/** A low-poly sphere: size is its diameters. */
export function S({ at, size, colour, rot, rough, glow, glowIntensity, shadow = true, material }: PrimProps) {
  return (
    <mesh
      geometry={sphere}
      material={material ?? mat(colour, rough, glow, glowIntensity)}
      position={at}
      rotation={rot}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  );
}

export const DEG = Math.PI / 180;
