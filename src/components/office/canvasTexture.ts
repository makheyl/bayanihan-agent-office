'use client';

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

let fontsReady: Promise<void> | null = null;

/** Resolves once the game fonts can be drawn into a canvas (they load lazily, like any web font). */
export function loadFonts(): Promise<void> {
  fontsReady ??= Promise.all([document.fonts.load('40px LilitaOne'), document.fonts.load('40px MergeOne')])
    .then(() => undefined)
    .catch(() => undefined);
  return fontsReady;
}

/** True once loadFonts() has finished, so canvas text redraws in the right font. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/**
 * A texture drawn with the 2D canvas API, for every bit of text in the room (monitors, nameplates, the whiteboard, the
 * signal board, the banner, the map). It redraws only when `key` changes, so text that updates a few times a second
 * costs nothing when nothing changed.
 */
export function useCanvasTexture(width: number, height: number, key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const fonts = useFontsReady();
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [width, height]);

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    texture.needsUpdate = true;
    // draw is a fresh closure every render; key says when its output changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, key, fonts, width, height]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Writes text cut to fit maxWidth with an ellipsis. Returns the width used. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): number {
  let t = text;
  if (ctx.measureText(t).width > maxWidth) {
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    t += '…';
  }
  ctx.fillText(t, x, y);
  return ctx.measureText(t).width;
}

/** Splits text into at most maxLines lines that fit maxWidth, the last one cut with an ellipsis. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}
