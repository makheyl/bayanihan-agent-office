// Makes public/mabuhay-map.json for the office's map table from the game's OpenStreetMap snapshot,
// ../Game/Docs/Maps/mabuhay-carmona.geojson (read only; the game's files are never changed).
//
// The output is what the Unity HQ's map table drew: the barangay boundary, roads by class, waterways and landmarks, in
// metres east (x) and north (y) of Mabuhay Barangay Hall, the same origin the game's layout uses. Buildings are left out.
// If the snapshot can't be read the table shows plain paper, so a missing file never stops the build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HQ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.HQ_MAP_SOURCE || path.resolve(HQ, '..', 'Game', 'Docs', 'Maps', 'mabuhay-carmona.geojson');
const OUT = path.join(HQ, 'public', 'mabuhay-map.json');

// Landmark categories a flood response leans on (Game/Assets/Scripts/Map/MapFeatures.cs, IsEssential).
const ESSENTIAL = new Set([
  'barangay_hall', 'city_hall', 'evacuation_centre', 'school', 'court', 'sports_hall', 'community_centre', 'hospital',
  'health_centre', 'fire_station', 'police', 'barangay_outpost', 'water_supply', 'dam', 'assembly_point', 'emergency_access',
]);
const MAIN_ROADS = new Set(['trunk', 'primary', 'secondary', 'trunk_link', 'primary_link', 'secondary_link']);

let geo;
try {
  geo = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
} catch (err) {
  console.warn(`[build-map] could not read ${SOURCE}: ${err.message}. Writing an empty map.`);
  write({ source: null, boundary: [], roads: [], waterways: [], landmarks: [] });
  process.exit(0);
}

const origin = geo.metadata && geo.metadata.origin ? geo.metadata.origin : { lat: 14.3116367, lon: 121.0499152 };
const phi = (origin.lat * Math.PI) / 180;
// Metres per degree at the barangay's latitude (WGS84 series), close enough for a table-top plan.
const mPerLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const mPerLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
const toLocal = ([lon, lat]) => [round((lon - origin.lon) * mPerLon), round((lat - origin.lat) * mPerLat)];

const boundary = [];
const roads = [];
const waterways = [];
const landmarks = [];

for (const f of geo.features || []) {
  const p = f.properties || {};
  const g = f.geometry;
  if (!g) continue;
  if (p.layer === 'boundary') {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly) boundary.push(ring.map(toLocal));
  } else if (p.layer === 'road' && g.type === 'LineString') {
    roads.push({ main: MAIN_ROADS.has(p.class), points: g.coordinates.map(toLocal) });
  } else if (p.layer === 'waterway' && g.type === 'LineString') {
    waterways.push({ wide: p.kind === 'river' || p.kind === 'canal', points: g.coordinates.map(toLocal) });
  } else if (p.layer === 'landmark' && g.type === 'Point') {
    const at = toLocal(g.coordinates);
    const shelter = !!p.evacuation && p.evacuation !== 'none';
    landmarks.push({ name: p.name || '', at, shelter, essential: shelter || ESSENTIAL.has(p.category) });
  }
}

const inside = landmarks.filter(l => boundary.some(ring => pointInRing(l.at, ring)));
write({
  source: 'OpenStreetMap contributors (ODbL), via Game/Docs/Maps/mabuhay-carmona.geojson',
  boundary,
  roads,
  waterways,
  landmarks: inside,
});
console.log(`[build-map] ${boundary.length} boundary ring(s), ${roads.length} roads, ${waterways.length} waterways, ${inside.length} landmarks -> public/mabuhay-map.json`);

function write(data) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
}

function round(v) {
  return Math.round(v * 10) / 10;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
