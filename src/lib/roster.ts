import { LEAD_KEY } from './event';

/** One desk in the office: who sits there and in what colour. Edited in config/roster.json. */
export interface RosterEntry {
  /** The subagent name from .claude/agents (or "lead" for the main session). */
  key: string;
  /** The Filipino first name on the nameplate. */
  name: string;
  role: string;
  /** Hex colour of the vest, nameplate and cards, e.g. #4E9C2C. */
  color: string;
  /** Desk slot in the office; 0 is the lead's big desk. */
  desk: number;
}

/** The same team as config/roster.json ships with. */
export function defaultRoster(): RosterEntry[] {
  return [
    { key: LEAD_KEY, name: 'Kap. Dado', role: 'Lead / Orchestrator', color: '#F09A47', desk: 0 },
    { key: 'map-level-builder', name: 'Lito', role: 'Map & Level Builder', color: '#4E9C2C', desk: 1 },
    { key: 'gameplay-scripter', name: 'Bea', role: 'Gameplay Scripter', color: '#2E6CC2', desk: 2 },
    { key: 'physics-colliders', name: 'Jun', role: 'Physics & Colliders', color: '#7A4FC2', desk: 3 },
    { key: 'vfx-environment', name: 'Tala', role: 'VFX & Environment', color: '#2BB3C0', desk: 4 },
    { key: 'ui-frontend', name: 'Mika', role: 'UI / Front-end', color: '#E05A9A', desk: 5 },
    { key: 'backend-data', name: 'Rey', role: 'Backend & Data', color: '#E9C12F', desk: 6 },
    { key: 'audio', name: 'Lorna', role: 'Audio', color: '#E07A2E', desk: 7 },
    { key: 'animation-characters', name: 'Kiko', role: 'Animation & Characters', color: '#C23C32', desk: 8 },
    { key: 'qa-tester', name: 'Nena', role: 'QA / Tester', color: '#6B8A99', desk: 9 },
  ];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Reads roster.json's contents (already parsed). The office never fails to open because of a typo in it: a broken or
 * empty file gives the built-in team, a bad colour turns grey, a duplicate key keeps the first entry, and a missing lead
 * is put back at the front.
 */
export function normalizeRoster(raw: unknown): RosterEntry[] {
  const list = raw && typeof raw === 'object' ? (raw as { agents?: unknown }).agents : null;
  if (!Array.isArray(list)) return defaultRoster();
  const seen = new Set<string>();
  const out: RosterEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.key !== 'string' || !o.key || seen.has(o.key)) continue;
    seen.add(o.key);
    out.push({
      key: o.key,
      name: typeof o.name === 'string' && o.name ? o.name : o.key,
      role: typeof o.role === 'string' ? o.role : '',
      color: typeof o.color === 'string' && HEX.test(o.color) ? o.color : '#999999',
      desk: typeof o.desk === 'number' && Number.isInteger(o.desk) ? o.desk : out.length,
    });
  }
  if (out.length === 0) return defaultRoster();
  if (!seen.has(LEAD_KEY)) out.unshift(defaultRoster()[0]);
  return out;
}
