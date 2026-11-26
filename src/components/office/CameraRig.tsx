'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Director } from '@/lib/director';
import { officeBus } from '../officeBus';
import { DESKS } from './layout';

const PITCH = 38 * (Math.PI / 180);
const DISTANCE = 40;
const HOME = { yaw: 32, target: new THREE.Vector3(0, 0.6, -0.5), size: 9.5 };
const SIZE_RANGE: [number, number] = [2.5, 14];
const BOUNDS = { x: 12, z: 8 };

/**
 * The isometric office camera, ported from the Unity HQ's OfficeCamera: orthographic with a fixed tilt. Right-drag or Q/E
 * orbits, the wheel zooms, middle-drag or WASD/arrows pan, F frames the room. A left click picks the responder nearest the
 * pointer on screen (within about 70 px), as the figures are small when zoomed out. It also moves the "needs you" badges
 * every frame: over the head when the person is in view, pinned to the screen edge when not.
 */
export function CameraRig({ director, onPick, reducedMotion }: { director: Director; onPick: (key: string) => void; reducedMotion: boolean }) {
  const { camera, gl, size } = useThree();
  const rig = useMemo(
    () => ({
      yaw: HOME.yaw,
      target: HOME.target.clone(),
      size: HOME.size,
      goalYaw: HOME.yaw,
      goalTarget: HOME.target.clone(),
      goalSize: HOME.size,
      inset: 0,
      keys: new Set<string>(),
      drag: null as null | { button: number; x: number; y: number },
      /** Moves the aim point by screen pixels (dx right, dy up), at the given metres per pixel. */
      pan(dx: number, dy: number, unitsPerPixel: number) {
        const yaw = this.yaw * (Math.PI / 180);
        const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
        const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
        // Screen height covers ground depth stretched by the tilt.
        this.goalTarget.addScaledVector(right, dx * unitsPerPixel).addScaledVector(forward, (dy * unitsPerPixel) / Math.sin(PITCH));
      },
    }),
    [],
  );

  useEffect(() => {
    const el = gl.domElement;
    officeBus.frameAll = () => {
      rig.goalTarget.copy(HOME.target);
      rig.goalSize = HOME.size;
    };
    officeBus.focusAgent = key => {
      const r = officeBus.responders.get(key);
      const point = new THREE.Vector3();
      if (r && r.visible()) r.root.getWorldPosition(point).add(new THREE.Vector3(0, 0.9, 0));
      else {
        const agent = director.state.get(key);
        const desk = DESKS.find(d => d.slot === agent?.entry.desk);
        if (!desk) return;
        point.set(desk.x, 0.9, desk.z);
      }
      rig.goalTarget.copy(point);
      rig.goalSize = 3.4;
    };

    const pick = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best = (70 * rect.height) / 1080;
      let found: string | null = null;
      const v = new THREE.Vector3();
      for (const [key, r] of officeBus.responders) {
        if (!r.visible()) continue;
        r.root.getWorldPosition(v);
        v.y += r.headTop * 0.6;
        v.project(camera);
        const sx = ((v.x + 1) / 2) * rect.width;
        const sy = ((1 - v.y) / 2) * rect.height;
        const dist = Math.hypot(sx - mx, sy - my);
        if (dist < best) {
          best = dist;
          found = key;
        }
      }
      if (found) onPick(found);
    };
    const down = (e: PointerEvent) => {
      if (e.button === 0) pick(e);
      else if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        rig.drag = { button: e.button, x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!rig.drag) return;
      const dx = e.clientX - rig.drag.x;
      const dy = e.clientY - rig.drag.y;
      rig.drag.x = e.clientX;
      rig.drag.y = e.clientY;
      if (rig.drag.button === 2) rig.goalYaw += dx * 0.25;
      else rig.pan(-dx, dy, (2 * rig.size) / Math.max(1, el.clientHeight));
    };
    const up = (e: PointerEvent) => {
      if (rig.drag) el.releasePointerCapture?.(e.pointerId);
      rig.drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const notches = Math.max(-3, Math.min(3, e.deltaY / 100));
      rig.goalSize = clamp(rig.goalSize * Math.pow(1.1, notches), SIZE_RANGE[0], SIZE_RANGE[1]);
    };
    const menu = (e: Event) => e.preventDefault();
    const keyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') officeBus.frameAll();
      else rig.keys.add(k);
    };
    const keyUp = (e: KeyboardEvent) => rig.keys.delete(e.key.toLowerCase());
    const blur = () => rig.keys.clear();

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [camera, director, gl, onPick, rig]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const keys = rig.keys;
    if (keys.has('q')) rig.goalYaw -= 90 * dt;
    if (keys.has('e')) rig.goalYaw += 90 * dt;
    const speed = rig.size * 1.2 * dt;
    let px = 0;
    let pz = 0;
    if (keys.has('a') || keys.has('arrowleft')) px -= 1;
    if (keys.has('d') || keys.has('arrowright')) px += 1;
    if (keys.has('w') || keys.has('arrowup')) pz += 1;
    if (keys.has('s') || keys.has('arrowdown')) pz -= 1;
    if (px || pz) rig.pan(px * speed, pz * speed * Math.sin(PITCH), 1);
    rig.goalTarget.x = clamp(rig.goalTarget.x, -BOUNDS.x, BOUNDS.x);
    rig.goalTarget.z = clamp(rig.goalTarget.z, -BOUNDS.z, BOUNDS.z);

    const k = reducedMotion ? 1 : 1 - Math.exp(-8 * dt);
    rig.yaw += (rig.goalYaw - rig.yaw) * k;
    rig.size += (rig.goalSize - rig.size) * k;
    rig.target.lerp(rig.goalTarget, k);

    const yaw = rig.yaw * (Math.PI / 180);
    const forward = tmp.set(Math.sin(yaw) * Math.cos(PITCH), -Math.sin(PITCH), -Math.cos(yaw) * Math.cos(PITCH));
    camera.position.copy(rig.target).addScaledVector(forward, -DISTANCE);
    camera.lookAt(rig.target);
    const ortho = camera as THREE.OrthographicCamera;
    const zoom = size.height / (2 * rig.size);
    // Shift the picture left by half the covered strip, so what is in the middle of the free space is the aim point.
    const inset = size.width > 700 ? Math.round(officeBus.rightInset / 2) : 0;
    rig.inset += (inset - rig.inset) * k;
    const shift = Math.round(rig.inset);
    if (Math.abs(ortho.zoom - zoom) > 1e-4 || ortho.view?.offsetX !== shift || ortho.view?.fullWidth !== size.width || ortho.view?.fullHeight !== size.height) {
      ortho.zoom = zoom;
      ortho.setViewOffset(size.width, size.height, shift, 0, size.width, size.height);
    }
    moveBadges(camera, size.width, size.height);
  });

  return null;
}

const badgePoint = new THREE.Vector3();

function moveBadges(camera: THREE.Camera, width: number, height: number) {
  for (const [key, el] of officeBus.badges) {
    const r = officeBus.responders.get(key);
    if (!r || !r.visible() || !r.root) {
      el.style.visibility = 'hidden';
      continue;
    }
    r.root.getWorldPosition(badgePoint);
    badgePoint.y += r.headTop + 1.9;
    badgePoint.project(camera);
    let vx = (badgePoint.x + 1) / 2;
    let vy = (1 - badgePoint.y) / 2;
    if (badgePoint.z > 1) {
      vx = 1 - vx;
      vy = 1 - vy;
    }
    // The strip under the agent cards counts as off-screen, so a badge never hides behind them.
    const right = width > 700 ? 1 - officeBus.rightInset / width : 1;
    const onScreen = vx > 0.04 && vx < right - 0.04 && vy > 0.06 && vy < 0.94;
    const arrow = onScreen ? '' : vx <= 0.04 ? '◀ ' : vx >= right - 0.04 ? '▶ ' : vy <= 0.06 ? '▲ ' : '▼ ';
    const text = `${arrow}! ${el.dataset.name ?? key} needs you`;
    if (el.textContent !== text) el.textContent = text;
    const x = clamp(vx, 0.07, right - 0.1) * width;
    const y = clamp(vy, 0.1, 0.92) * height;
    el.style.transform = `translate(${Math.round(x - el.offsetWidth / 2)}px, ${Math.round(y - el.offsetHeight)}px)`;
    el.style.visibility = 'visible';
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
