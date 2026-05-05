// Build-time generator for the live-globe halftone earth.
//
// Produces a JSON file containing a Fibonacci-lattice of points on the
// sphere, filtered to those that fall on land (per Natural Earth).
//
// The runtime (LiveGlobe.tsx) fetches this JSON once at page load and
// renders it as the dotted earth — far more uniform than globe.gl's
// hex-polygon mode, which is what we need for the magazine-print feel.
//
// Run: node scripts/build-land-points.mjs
// Output: public/data/land-points.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// Natural Earth 110m countries — same GeoJSON the runtime fetches today.
const GEO_URL =
  'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';

// How many evenly-spaced points to start from. Higher = denser earth, larger JSON.
// 8000 → roughly 2,800 land points → ~70KB JSON. Sweet spot.
const FIB_POINTS = 8000;

console.log(`[build-land-points] fetching ${GEO_URL}`);
const res = await fetch(GEO_URL);
if (!res.ok) {
  console.error(`Failed to fetch: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const geo = await res.json();
const features = geo.features || [];
console.log(`[build-land-points] loaded ${features.length} country features`);

// Pre-compute each country's bounding box once. We use it as a cheap
// pre-filter: a point can only be inside a polygon whose bbox contains it.
const countries = features.map((f) => {
  const polys = featureToPolygons(f.geometry);
  const bbox = bboxOfPolygons(polys);
  return { polys, bbox };
});

// Generate a Fibonacci sphere lattice. This is the gold standard for
// "uniformly distributed points on a sphere" — produces no clustering
// at the poles, which is what equirectangular grids suffer from.
function fibSphere(n) {
  const out = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2; // y goes from 1 to -1
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    out.push([x, y, z]);
  }
  return out;
}

function xyzToLatLng([x, y, z]) {
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lng = (Math.atan2(z, x) * 180) / Math.PI;
  return [lat, lng];
}

function featureToPolygons(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function bboxOfPolygons(polys) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

// Ray-casting point-in-polygon. `point` and `ring` are arrays of [lng, lat].
function pointInRing(point, ring) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// A point is inside a polygon if it's inside the outer ring AND outside all
// holes (inner rings). MultiPolygon is just multiple polygons OR'd.
function pointInPolygons(point, polys) {
  for (const poly of polys) {
    if (poly.length === 0) continue;
    const outer = poly[0];
    if (!pointInRing(point, outer)) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(point, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

// Main filter loop
console.log(`[build-land-points] generating ${FIB_POINTS} candidate points`);
const candidates = fibSphere(FIB_POINTS);
const land = [];

let checked = 0;
for (const xyz of candidates) {
  const [lat, lng] = xyzToLatLng(xyz);
  const point = [lng, lat]; // GeoJSON convention is [lng, lat]
  // bbox pre-filter: only test against countries whose bbox contains this point
  for (const c of countries) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (pointInPolygons(point, c.polys)) {
      land.push([Number(lat.toFixed(3)), Number(lng.toFixed(3))]);
      break;
    }
  }
  checked++;
  if (checked % 1000 === 0) {
    console.log(`  ...checked ${checked} / ${FIB_POINTS}, kept ${land.length} so far`);
  }
}

console.log(`[build-land-points] kept ${land.length} land points`);

const out = {
  generatedAt: new Date().toISOString(),
  source: GEO_URL,
  fibPoints: FIB_POINTS,
  count: land.length,
  // Compact array of [lat, lng] tuples — clients reconstitute as needed
  points: land,
};

const outPath = resolve(ROOT, 'public/data/land-points.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
const bytes = JSON.stringify(out).length;
console.log(`[build-land-points] wrote ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
