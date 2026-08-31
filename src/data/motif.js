/**
 * Geometry for the "organizational network" motif — nodes joined by ties.
 *
 * Shared, not duplicated: the figure appears in the page hero
 * (src/components/NetworkMotif.astro) and in the rendered invitation cards
 * (scripts/render-invitation-card.mjs). Two hand-copied versions would drift
 * the moment either is adjusted.
 *
 * Hand-placed rather than generated, so the cluster reads as a group with
 * satellites rather than as noise. Coordinates are in the 0–400 viewBox.
 */

export const NODES = [
  { x: 200, y: 96, r: 15 },
  { x: 118, y: 178, r: 9 },
  { x: 282, y: 178, r: 9 },
  { x: 200, y: 214, r: 22 },
  { x: 96, y: 292, r: 11 },
  { x: 304, y: 292, r: 11 },
  { x: 200, y: 330, r: 7 },
];

export const LINKS = [
  [0, 1], [0, 2], [0, 3], [1, 3], [2, 3],
  [1, 4], [2, 5], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6],
];

/** Concentric rings: the wider field the group sits in. */
export const RINGS = [
  { r: 176, opacity: 0.18 },
  { r: 128, opacity: 0.13 },
  { r: 78, opacity: 0.1 },
];

export const RING_CENTER = { x: 200, y: 212 };

/**
 * The motif as a standalone SVG string, for contexts that build HTML by hand
 * (the card renderer). The Astro component draws the same data as real markup.
 */
export function motifSvg({ color = 'currentColor', opacity = 1 } = {}) {
  const rings = RINGS.map(
    (ring) =>
      `<circle cx="${RING_CENTER.x}" cy="${RING_CENTER.y}" r="${ring.r}" stroke="${color}" stroke-width="1" fill="none" opacity="${ring.opacity}"/>`
  ).join('');
  const links = LINKS.map(
    ([a, b]) =>
      `<line x1="${NODES[a].x}" y1="${NODES[a].y}" x2="${NODES[b].x}" y2="${NODES[b].y}" stroke="${color}" stroke-width="1" opacity="0.28"/>`
  ).join('');
  const nodes = NODES.map(
    (n) => `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${color}" opacity="0.5"/>`
  ).join('');
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" opacity="${opacity}" aria-hidden="true">${rings}${links}${nodes}</svg>`;
}
