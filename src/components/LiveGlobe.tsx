import { useEffect, useMemo, useRef, useState } from 'react';
import { PIN_STYLES, withAlpha, type VisitorClass } from '../lib/globePalette';
import GlobeHUD from './GlobeHUD';

// We rely on a runtime import for globe.gl because it's a DOM-bound library
// (depends on three.js, WebGL canvas, etc). Astro builds this island with
// client:only="react", so this code only runs in the browser.
//
// `globe.gl` doesn't ship strong types — we type the instance loosely.
type GlobeInstance = any;

interface EventRow {
  ts: number;
  kind: 'visit' | 'download';
  visitor_class: VisitorClass;
  paper_slug: string | null;
  paper_title: string | null;
  page_path: string | null;
  country: string | null;
  country_name: string | null;
  continent: string | null;
  continent_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

interface TotalsResponse {
  sinceLaunch: { total: number; countries: number; continents: number };
  today: { visits: number; downloads: number };
  topCountries: Array<{ country: string; country_name: string; n: number }>;
  topContinents: Array<{ continent: string; continent_name: string; n: number }>;
  mostRecent: EventRow | null;
  launchTs: number | null;
  serverNow: number;
}

interface PaperOption {
  slug: string;
  title: string;
}

interface Props {
  papers: PaperOption[];
}

type RangeKey = '24h' | '7d' | '30d' | 'all';

const RANGE_LABELS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All' },
];

const COUNTRIES_URL =
  'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';

// Realistic Earth textures (NASA Blue Marble derivatives, public domain),
// hosted by the three-globe ecosystem on unpkg. The day texture is used in
// light mode; the night texture (lit cities) is used in dark mode and reads
// as the editorial "ink in water" version of the same earth.
const EARTH_DAY_URL = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const EARTH_NIGHT_URL = '//unpkg.com/three-globe/example/img/earth-night.jpg';
const EARTH_BUMP_URL = '//unpkg.com/three-globe/example/img/earth-topology.png';

// Origin point for arcs — Yariv's affiliation. Every download draws an arc
// from here to the reader's city.
const ARIEL_LAT = 32.103;
const ARIEL_LNG = 35.211;
const ARIEL_LABEL = 'Ariel University, Israel';

// Fixed colors for visit-class arcs (download arcs use the per-paper hash).
// Hierarchy: first-time = quiet pink, returning = warmer rose, download = vivid.
const VISIT_COLORS = {
  first_time: '#D98B9A',
  returning:  '#A85368',
} as const;

// Vivid warm palette for arc colors — saturated enough to glow against
// the satellite earth, kept in the red/pink/orange/gold range so they
// extend the site's existing maroon/rose vocabulary instead of fighting it.
// One hue per paper, deterministically hashed below so the same paper
// always renders the same color across reloads.
const PAPER_HUES = [
  '#FF3B7A', // vivid magenta
  '#FF5E3A', // electric coral
  '#FFB347', // warm gold
  '#FF77B7', // hot pink
  '#E8174D', // ruby
  '#FFA500', // amber
  '#FF8C8C', // salmon
  '#D8265E', // cherry
];

function colorForPaper(slug: string | null | undefined): string {
  if (!slug) return PAPER_HUES[0];
  // Cheap deterministic hash so the same paper always maps to the same hue
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return PAPER_HUES[h % PAPER_HUES.length];
}

// Continent labels — always present, low opacity, big and quiet.
// Coordinates are rough geographic centroids that read well on a globe.
const CONTINENT_LABELS: Array<{ kind: 'continent'; text: string; lat: number; lng: number }> = [
  { kind: 'continent', text: 'AFRICA',        lat:   2, lng:  20 },
  { kind: 'continent', text: 'EUROPE',        lat:  50, lng:  15 },
  { kind: 'continent', text: 'ASIA',          lat:  45, lng:  90 },
  { kind: 'continent', text: 'NORTH AMERICA', lat:  45, lng:-100 },
  { kind: 'continent', text: 'SOUTH AMERICA', lat: -15, lng: -60 },
  { kind: 'continent', text: 'OCEANIA',       lat: -25, lng: 135 },
];

// Camera-distance thresholds (globe.gl camera distance, default range ~200..800).
// Country labels only appear when the user has actively zoomed in close —
// otherwise 190 names render at once and the page becomes unreadable.
// Continent labels stay at low opacity always (they help orient at first glance).
const ZOOM_NEAR = 195;   // country labels at peak
const ZOOM_FAR  = 235;   // country labels start to appear here
const MIN_DIST  = 195;   // can't zoom closer than this — prevents texture pixelation
const MAX_DIST  = 800;

export default function LiveGlobe({ papers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const dragTimerRef = useRef<number | null>(null);
  const themeObserverRef = useRef<MutationObserver | null>(null);
  const breathFrameRef = useRef<number | null>(null);
  // Country centroids keyed by ISO-2 code AND by uppercase name for fallback
  // matching against event.country / event.country_name. Populated once when
  // the GeoJSON loads, then read by the events useEffect to surface a label
  // for every country that has actual activity.
  const countryCentroidsRef = useRef<Map<string, { lat: number; lng: number; name: string }>>(new Map());

  const [events, setEvents] = useState<EventRow[]>([]);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [range, setRange] = useState<RangeKey>('7d');
  const [paper, setPaper] = useState<string>(''); // '' = all papers
  const [loading, setLoading] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  // When set, the card is auto-displayed because an arc just fired.
  // Set to null when the user pins (clicks) the card or it auto-dismisses.
  const [autoUntil, setAutoUntil] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Detect prefers-reduced-motion + observe live changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // Track parent size for responsive globe canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(320, r.width), h: Math.max(380, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Read current theme colors from CSS vars
  const readThemeColors = () => {
    if (typeof window === 'undefined') return null;
    const cs = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.classList.contains('dark');
    const text = cs.getPropertyValue('--text').trim() || (isDark ? '#F4EFE6' : '#1A1612');
    const accentSoft = cs.getPropertyValue('--color-accent-soft').trim() || '#A85368';
    const accentOnDark = cs.getPropertyValue('--color-accent-on-dark').trim() || '#D98B9A';
    return {
      isDark,
      // Hex form for THREE.Color — without alpha
      dotHex: text,
      // RGBA fallback for non-three layers
      hexDot: textWithAlpha(text, isDark ? 0.62 : 0.55),
      // Hairline country borders: soft, never compete with the dots
      border: textWithAlpha(text, isDark ? 0.18 : 0.20),
      // Atmosphere: use the softer accent so it harmonises with the editorial cream/ink
      // rather than the raw deep maroon, which reads as a "dirty halo" in light mode
      atmosphere: isDark ? accentOnDark : accentSoft,
    };
  };

  // Theme-aware pin colors. The hierarchy (first-time → returning → downloader)
  // stays intact in both modes; we lift each class one step in dark mode so the
  // deep maroon doesn't vanish into the near-black background.
  const readPinPalette = (isDark: boolean) => {
    if (isDark) {
      return {
        first_time: { color: '#F2C3CC', floor: 0.40 },
        returning:  { color: '#D98B9A', floor: 0.55 },
        downloader: { color: '#A85368', floor: 0.75 },
      } as const;
    }
    return {
      first_time: { color: '#D98B9A', floor: 0.40 },
      returning:  { color: '#A85368', floor: 0.60 },
      downloader: { color: '#7A1E2B', floor: 0.85 },
    } as const;
  };

  // Fetch events whenever range or paper filter changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('range', range);
    if (paper) params.set('paper', paper);
    fetch(`/live/events?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events || []);
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, paper]);

  // Fetch totals once on mount, then refresh every 30s
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/live/totals')
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setTotals(data);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Initialize the globe.gl instance once
  useEffect(() => {
    if (!containerRef.current) return;
    let alive = true;

    (async () => {
      const mod = await import('globe.gl');
      const Globe = (mod as any).default || (mod as any);

      if (!alive || !containerRef.current) return;

      const colors = readThemeColors();
      const THREE = await import('three');

      const g: GlobeInstance = Globe()(containerRef.current)
        .backgroundColor('rgba(0,0,0,0)')
        // Always use the day texture so continents stay visible. In dark
        // mode we tint the material below to give the "deep twilight" feel
        // without losing legibility — the literal night texture (city
        // lights only) was too dark to make sense of.
        .globeImageUrl(EARTH_DAY_URL)
        .bumpImageUrl(EARTH_BUMP_URL)
        .showAtmosphere(true)
        .atmosphereColor(colors?.atmosphere || '#7A1E2B')
        .atmosphereAltitude(0.13)
        // Country outlines as faint hairlines — drop them lower in the
        // visual hierarchy now that the texture carries continent shapes.
        .polygonAltitude(0.0025)
        .polygonCapColor(() => 'rgba(0,0,0,0)')
        .polygonSideColor(() => 'rgba(0,0,0,0)')
        .polygonStrokeColor(() => colors?.border || 'rgba(244,239,230,0.10)')
        // Arcs: bright glowing lines, paired with a soft halo for bloom.
        // Per-arc stroke width comes from the data (`__stroke`) so we can
        // render a wider translucent halo behind each main arc.
        .arcAltitudeAutoScale(0.6)
        .arcStroke((d: any) => d?.__stroke ?? 0.7)
        .arcDashLength(0.6)
        .arcDashGap(0.5)
        .arcDashAnimateTime(1500)
        .arcsTransitionDuration(0)
        // Pin styling for visit dots
        .pointAltitude(0.012)
        .pointRadius(0.25)
        .pointResolution(8)
        .pointsTransitionDuration(0)
        // Ring styling for fresh event pulses
        .ringAltitude(0.008)
        .ringResolution(64)
        .ringPropagationSpeed(2)
        .ringRepeatPeriod(0);

      // Load Natural Earth country outlines + populate the centroid lookup
      // used by the events-driven label layer (one label per country with
      // actual activity).
      try {
        const r = await fetch(COUNTRIES_URL);
        if (r.ok) {
          const geo = await r.json();
          if (alive && geo?.features) {
            g.polygonsData(geo.features);
            const map = countryCentroidsRef.current;
            for (const f of geo.features) {
              const props = f.properties || {};
              const name = props.NAME || props.name || props.ADMIN || props.NAME_LONG;
              if (!name) continue;
              const c = polygonCentroid(f.geometry);
              if (!c) continue;
              const entry = { lat: c.lat, lng: c.lng, name: String(name) };
              const iso2 = props.ISO_A2 || props.iso_a2;
              if (iso2 && iso2 !== '-99') map.set(String(iso2).toUpperCase(), entry);
              map.set(String(name).toUpperCase(), entry);
            }
          }
        }
      } catch {
        // Network blocked — globe still works, just without borders/labels.
      }

      // (No more THREE.Points cloud — the realistic earth texture above
      //  carries continent shapes directly. Country borders + zoom-driven
      //  labels still ride above as editorial chrome.)
      const earthPoints: any = null;

      // Add a soft ambient light so the unlit hemisphere is never crushed
      // to pure black. globe.gl's built-in lighting is directional — without
      // an ambient pass the back of the sphere disappears.
      const ambient = new (THREE as any).AmbientLight(0xb8c4dc, 0.85);
      g.scene().add(ambient);

      // Theme tint: in light mode we want the day texture at full color;
      // in dark mode we tint the globe material with a deep blue-grey so
      // continents read as a moonlit/twilight earth instead of generic
      // bright daylight. Texture × tint = the dark-mode look.
      const setEarthTint = (isDark: boolean) => {
        const mat: any = g.globeMaterial();
        if (!mat || !mat.color) return;
        mat.color.set(isDark ? 0x4d5d7a : 0xffffff);
        if ('shininess' in mat) mat.shininess = isDark ? 4 : 12;
      };
      setEarthTint(!!colors?.isDark);

      // Configure controls — auto-rotate, paused on user drag
      const controls = g.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = true;
      controls.minDistance = MIN_DIST;
      controls.maxDistance = MAX_DIST;

      const onStart = () => {
        controls.autoRotate = false;
        if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
      };
      const onEnd = () => {
        if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
        dragTimerRef.current = window.setTimeout(() => {
          controls.autoRotate = !reduced;
        }, 4000);
      };
      controls.addEventListener('start', onStart);
      controls.addEventListener('end', onEnd);

      // Start/freeze rotation based on reduced-motion
      controls.autoRotate = !reduced;

      // Open at a comfortable distance — well above ZOOM_FAR so the page
      // doesn't render with country labels stacked on top of each other.
      // Phone canvases otherwise auto-fit the globe much closer than
      // desktop, which is why the same code rendered fine on desktop and
      // exploded on mobile.
      g.pointOfView({ lat: 22, lng: 25, altitude: 2.8 }, 0);

      // Three label tiers:
      //   continent  → always visible at low opacity (spatial anchor)
      //   country-active → always visible (countries with real events)
      //   country    → fades in only when the user zooms close
      // The events useEffect below populates which countries are "active"
      // and re-renders the layer; here we just configure the layer once.
      g.htmlElementsData([...CONTINENT_LABELS])
        .htmlLat((d: any) => d.lat)
        .htmlLng((d: any) => d.lng)
        .htmlAltitude(0.012)
        .htmlElement((d: any) => {
          const el = document.createElement('div');
          const kindClass = d.__active
            ? 'gl-label-country-active'
            : `gl-label-${d.kind}`;
          el.className = `gl-label ${kindClass}`;
          el.textContent = d.text;
          el.dataset.kind = d.kind;
          return el;
        })
        .htmlElementVisibilityModifier((el: any, hidden: boolean) => {
          el.style.visibility = hidden ? 'hidden' : 'visible';
        });

      const updateLabelOpacities = () => {
        const dist = (controls as any).getDistance ? (controls as any).getDistance() : 400;
        // Inactive country labels fade in only as the user zooms close
        let countryOp = 0;
        if (dist < ZOOM_NEAR) countryOp = 1;
        else if (dist < ZOOM_FAR) countryOp = 1 - (dist - ZOOM_NEAR) / (ZOOM_FAR - ZOOM_NEAR);

        const root = containerRef.current;
        if (!root) return;
        // Continents stay at a constant low opacity regardless of zoom
        root.querySelectorAll<HTMLElement>('.gl-label-continent').forEach((el) => {
          el.style.opacity = '0.32';
        });
        // Active countries (events-driven) — always visible, brighter
        root.querySelectorAll<HTMLElement>('.gl-label-country-active').forEach((el) => {
          el.style.opacity = '0.85';
        });
        // Inactive countries fade in/out with zoom
        root.querySelectorAll<HTMLElement>('.gl-label-country').forEach((el) => {
          el.style.opacity = String(countryOp * 0.5);
        });
      };
      updateLabelOpacities();
      controls.addEventListener('change', updateLabelOpacities);

      // The "liquid" feel: a slow breathing oscillation on the earth + atmosphere.
      // Scale modulates by ±0.2% over 8s, atmosphere altitude by ±2.5%. Sub-
      // perceptual on its own; the page just feels alive instead of static.
      // Skipped entirely under prefers-reduced-motion.
      const breatheStart = performance.now();
      const breathe = () => {
        if (!alive) return;
        if (!reduced) {
          const t = ((performance.now() - breatheStart) / 8000) % 1;
          const s = Math.sin(t * 2 * Math.PI);
          if (earthPoints) earthPoints.scale.setScalar(1.0 + 0.002 * s);
          g.atmosphereAltitude(0.121 + 0.003 * s);
        }
        breathFrameRef.current = requestAnimationFrame(breathe);
      };
      breathFrameRef.current = requestAnimationFrame(breathe);

      // Click handlers — point or arc both reveal the paper / reader card
      g.onPointClick((pt: any) => {
        if (pt && pt.__event) setSelected(pt.__event as EventRow);
      });
      g.onArcClick((arc: any) => {
        if (arc && arc.__event) setSelected(arc.__event as EventRow);
      });
      g.onArcHover((arc: any) => {
        if (containerRef.current) {
          containerRef.current.style.cursor = arc ? 'pointer' : '';
        }
      });

      globeRef.current = g;

      // Watch for theme changes and recolor everything theme-aware
      const obs = new MutationObserver(() => {
        const c = readThemeColors();
        if (!c) return;
        // Day texture stays; we just retint the material color
        setEarthTint(c.isDark);
        g.atmosphereColor(c.atmosphere);
        g.polygonStrokeColor(() => c.border);
        // Re-tint existing pins for the new theme
        const pal = readPinPalette(c.isDark);
        const data = g.pointsData() || [];
        data.forEach((p: any) => {
          const ev = p.__event as EventRow | undefined;
          if (!ev) return;
          const def = pal[ev.visitor_class as keyof typeof pal] || pal.first_time;
          p.color = withAlpha(def.color, def.floor);
        });
        g.pointsData([...data]).pointColor((p: any) => p.color);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      themeObserverRef.current = obs;
    })();

    return () => {
      alive = false;
      if (themeObserverRef.current) themeObserverRef.current.disconnect();
      if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
      if (breathFrameRef.current) cancelAnimationFrame(breathFrameRef.current);
      // globe.gl exposes _destructor on newer versions
      const g: any = globeRef.current;
      if (g && typeof g._destructor === 'function') g._destructor();
      globeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update globe size when container resizes
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.width(size.w);
    g.height(size.h);
  }, [size]);

  // Honor reduced-motion live
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = !reduced;
  }, [reduced]);

  // Build the label set: continents + every country (with __active=true for
  // those with real events, __active=false for the rest). Re-runs whenever
  // events change, so a new download from Berlin instantly highlights
  // GERMANY's label on the globe.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const centroids = countryCentroidsRef.current;
    if (!centroids.size) return;

    // Set of countries with actual events (by ISO-2 code AND uppercase name —
    // we accept either as a key into the centroid map)
    const active = new Set<string>();
    for (const e of events) {
      if (e.country) active.add(String(e.country).toUpperCase());
      if (e.country_name) active.add(String(e.country_name).toUpperCase());
    }

    // De-dupe by name so we don't render the same country twice when both
    // ISO-2 and name aliases map to it.
    const seen = new Set<string>();
    const countryLabels: Array<any> = [];
    centroids.forEach((entry, key) => {
      if (seen.has(entry.name.toUpperCase())) return;
      seen.add(entry.name.toUpperCase());
      const isActive = active.has(entry.name.toUpperCase()) || active.has(key);
      countryLabels.push({
        kind: 'country' as const,
        text: entry.name.toUpperCase(),
        lat: entry.lat,
        lng: entry.lng,
        __active: isActive,
      });
    });

    g.htmlElementsData([...CONTINENT_LABELS, ...countryLabels]);

    // Trigger an opacity recompute so freshly-rendered DOM nodes get
    // their initial opacity right away (without waiting for camera movement)
    requestAnimationFrame(() => {
      const root = containerRef.current;
      if (!root) return;
      root.querySelectorAll<HTMLElement>('.gl-label-continent').forEach((el) => {
        el.style.opacity = '0.32';
      });
      root.querySelectorAll<HTMLElement>('.gl-label-country-active').forEach((el) => {
        el.style.opacity = '0.85';
      });
      // Inactive countries: opacity is camera-distance-driven, but at first
      // render we want them invisible until the user zooms in.
      const dist = (g.controls() as any).getDistance ? (g.controls() as any).getDistance() : 400;
      let countryOp = 0;
      if (dist < ZOOM_NEAR) countryOp = 1;
      else if (dist < ZOOM_FAR) countryOp = 1 - (dist - ZOOM_NEAR) / (ZOOM_FAR - ZOOM_NEAR);
      root.querySelectorAll<HTMLElement>('.gl-label-country').forEach((el) => {
        el.style.opacity = String(countryOp * 0.5);
      });
    });
  }, [events]);

  // Push events into the globe as points (visits) + arcs (downloads) + rings (entrance pulses).
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    const placed = events.filter((e) => isFinite(Number(e.lat)) && isFinite(Number(e.lng)));
    const themeColors = readThemeColors();
    const palette = readPinPalette(!!themeColors?.isDark);

    // Tag each event so click handler can recover it
    const points = placed.map((e) => {
      const cls = e.visitor_class as keyof typeof palette;
      const def = palette[cls] || palette.first_time;
      const style = PIN_STYLES[e.visitor_class] || PIN_STYLES.first_time;
      // Floor the steady-state opacity so history pins remain visible against the dotted earth
      return {
        lat: Number(e.lat),
        lng: Number(e.lng),
        color: withAlpha(def.color, def.floor),
        radius: 0.32 + style.dotRadius * 0.08,
        __event: e,
      };
    });

    g.pointsData(points)
      .pointColor((p: any) => p.color)
      .pointRadius((p: any) => p.radius);

    // Arcs: one per event, from Ariel -> reader city. EVERY event gets an
    // arc now — first-time visits, returning visits, and downloads — so the
    // page reflects all real activity, not just downloads.
    //
    // Visual hierarchy:
    //   first-time → thin pale pink (quietest)
    //   returning  → mid rose (warmer, slightly thicker)
    //   download   → vivid per-paper hue with strong glow (loudest)
    //
    // Each arc renders as TWO entries — a wide soft halo behind a thinner
    // bright core — to fake a glow without three.js post-processing.
    const arcs: any[] = [];
    for (const e of placed) {
      const isDownload = e.kind === 'download';
      const isReturning = e.visitor_class === 'returning';
      const hex = isDownload
        ? colorForPaper(e.paper_slug)
        : (isReturning ? VISIT_COLORS.returning : VISIT_COLORS.first_time);

      // Stroke + alpha hierarchy. Halo is generous so clicks always register.
      const haloStroke = isDownload ? 3.5 : isReturning ? 2.6 : 2.0;
      const coreStroke = isDownload ? 0.9 : isReturning ? 0.7 : 0.55;
      const haloAlpha:  [number, number] = isDownload ? [0.40, 0.12] : [0.28, 0.08];
      const coreAlpha:  [number, number] = isDownload ? [1.00, 0.85] : isReturning ? [0.85, 0.55] : [0.70, 0.40];

      const halo = {
        startLat: ARIEL_LAT,
        startLng: ARIEL_LNG,
        endLat: Number(e.lat),
        endLng: Number(e.lng),
        color: [withAlpha(hex, haloAlpha[0]), withAlpha(hex, haloAlpha[1])] as [string, string],
        __stroke: haloStroke,
        __event: e,
        __paperColor: hex,
        __isHalo: true,
      };
      const core = {
        startLat: ARIEL_LAT,
        startLng: ARIEL_LNG,
        endLat: Number(e.lat),
        endLng: Number(e.lng),
        color: [withAlpha(hex, coreAlpha[0]), withAlpha(hex, coreAlpha[1])] as [string, string],
        __stroke: coreStroke,
        __event: e,
        __paperColor: hex,
      };
      arcs.push(halo, core);
    }
    g.arcsData(arcs)
      .arcColor((d: any) => d.color)
      .arcStartLat((d: any) => d.startLat)
      .arcStartLng((d: any) => d.startLng)
      .arcEndLat((d: any) => d.endLat)
      .arcEndLng((d: any) => d.endLng);

    // Rings + auto-cards: stagger each event's "entrance" so they fire one
    // after another (not all at once on load). Each entrance:
    //   1. Pulses a ring at the destination
    //   2. Auto-pops a transient PinCard for that event (5s lifetime)
    // Stagger interval: ~2 seconds between events. Slow enough that each
    // card is tappable before the next one replaces it.
    if (reduced) {
      g.ringsData([]);
    } else {
      g.ringsData([])
        .ringColor((r: any) => () => r.color)
        .ringMaxRadius((r: any) => r.maxR)
        .ringPropagationSpeed((r: any) => r.speed)
        .ringRepeatPeriod(0);

      const cap = Math.min(placed.length, 80);
      const subset = placed.slice(0, cap);

      let cancelled = false;
      const timers: number[] = [];
      const STAGGER_MS = 2000; // gap between event entrances
      const CARD_AUTO_MS = 5000; // how long an auto-card stays before fading

      subset.forEach((e, i) => {
        const cls = e.visitor_class as keyof typeof palette;
        const def = palette[cls] || palette.first_time;
        const style = PIN_STYLES[e.visitor_class] || PIN_STYLES.first_time;
        const delay = i * STAGGER_MS + Math.random() * 250; // slight jitter
        const t = window.setTimeout(() => {
          if (cancelled) return;

          // Ring pulse at the destination
          const data = g.ringsData() || [];
          const ringEntry = {
            lat: Number(e.lat),
            lng: Number(e.lng),
            color: withAlpha(def.color, 0.95),
            maxR: style.ringRadius,
            speed: style.ringRadius / (style.ringDurationMs / 1000),
          };
          g.ringsData([...data, ringEntry]);
          if (style.ringCount >= 2) {
            const t3 = window.setTimeout(() => {
              if (cancelled) return;
              const data2 = g.ringsData() || [];
              const ring2 = {
                lat: ringEntry.lat,
                lng: ringEntry.lng,
                color: withAlpha(def.color, 0.55),
                maxR: style.ringRadius * 0.7,
                speed: ringEntry.speed,
              };
              g.ringsData([...data2, ring2]);
              const t4 = window.setTimeout(() => {
                if (cancelled) return;
                const next = (g.ringsData() || []).filter((r: any) => r !== ring2);
                g.ringsData(next);
              }, style.ringDurationMs + 200);
              timers.push(t4);
            }, 300);
            timers.push(t3);
          }
          const t2 = window.setTimeout(() => {
            if (cancelled) return;
            const next = (g.ringsData() || []).filter((r: any) => r !== ringEntry);
            g.ringsData(next);
          }, style.ringDurationMs + 200);
          timers.push(t2);

          // Auto-card: pop a transient PinCard for this event. User can tap
          // it during the 5-second window to "pin" it (cancel auto-dismiss).
          const dismissAt = Date.now() + CARD_AUTO_MS;
          setSelected(e);
          setAutoUntil(dismissAt);
        }, delay);
        timers.push(t);
      });

      return () => {
        cancelled = true;
        timers.forEach((t) => window.clearTimeout(t));
        g.ringsData([]);
      };
    }
  }, [events, reduced]);

  // Auto-dismiss the card after its window expires, unless the user has
  // already pinned it (autoUntil cleared by clicking the card).
  useEffect(() => {
    if (!autoUntil) return;
    const remaining = Math.max(0, autoUntil - Date.now());
    const id = window.setTimeout(() => {
      setSelected(null);
      setAutoUntil(null);
    }, remaining);
    return () => window.clearTimeout(id);
  }, [autoUntil]);

  // Pre-pick the visit/download counts within current event window for the activity panel
  const activity = useMemo(() => {
    const visits = events.filter((e) => e.kind === 'visit');
    const downloads = events.filter((e) => e.kind === 'download');
    const firstTime = visits.filter((e) => e.visitor_class === 'first_time').length;
    const returning = visits.filter((e) => e.visitor_class === 'returning').length;
    const papersTouched = new Set(downloads.map((e) => e.paper_slug).filter(Boolean)).size;
    return { visits: visits.length, firstTime, returning, downloads: downloads.length, papersTouched };
  }, [events]);

  return (
    <div className="relative w-full">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-8 font-mono text-xs uppercase tracking-widest text-soft">
        <div className="flex items-center gap-3">
          <span className="opacity-60">Range</span>
          {RANGE_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className="hover:opacity-100 transition-opacity"
              style={{ opacity: range === key ? 1 : 0.55, borderBottom: range === key ? '1px solid currentColor' : '1px solid transparent', paddingBottom: '2px' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="opacity-60">Paper</span>
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value)}
            className="bg-transparent border-b border-current border-opacity-40 font-mono text-xs uppercase tracking-widest pr-6 py-1 hover:border-opacity-100 transition"
            style={{ color: 'inherit' }}
          >
            <option value="">All papers</option>
            {papers.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title.length > 60 ? p.title.slice(0, 57) + '…' : p.title}
              </option>
            ))}
          </select>
        </div>
        {loading && <span className="opacity-50">Loading…</span>}
      </div>

      {/* Legend explaining the three arc colors — frosted-glass mini panel */}
      <div
        className="mb-6 px-4 py-3 inline-flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-widest"
        style={{
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          background: 'color-mix(in srgb, var(--bg) 35%, transparent)',
          border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
          color: 'var(--text)',
          boxShadow:
            '0 6px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
        aria-label="Arc color legend"
      >
        <span className="inline-flex items-center gap-2">
          <ArcSwatch color="#D98B9A" thickness={2} />
          <span>first-time visit</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <ArcSwatch color="#A85368" thickness={2.5} />
          <span>returning visit</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <ArcSwatch color="#FF3B7A" thickness={3.5} glow />
          <span>download <span className="opacity-60">(colour = paper)</span></span>
        </span>
      </div>

      {/* Globe canvas */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: 'min(72vh, 720px)' }}
        aria-label={`Globe showing ${events.length} events from ${totals?.sinceLaunch?.countries ?? 0} countries.`}
      />

      {/* HUD */}
      <GlobeHUD totals={totals} activity={activity} />

      {/* Click-pin card */}
      {selected && (
        <PinCard
          event={selected}
          isAuto={!!autoUntil}
          onPin={() => setAutoUntil(null)}
          onClose={() => { setSelected(null); setAutoUntil(null); }}
        />
      )}
    </div>
  );
}

// A tiny SVG arc rendered in the legend so the swatches visually echo the
// arcs flying around on the globe — same gradient + halo treatment, just
// flattened to a side-on view.
function ArcSwatch({ color, thickness, glow }: { color: string; thickness: number; glow?: boolean }) {
  const halo = glow ? thickness * 2.8 : thickness * 2.0;
  return (
    <svg
      width="36"
      height="14"
      viewBox="0 0 36 14"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`arc-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* Halo */}
      <path
        d="M 2 12 Q 18 -2 34 12"
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={halo}
        fill="none"
        strokeLinecap="round"
      />
      {/* Core */}
      <path
        d="M 2 12 Q 18 -2 34 12"
        stroke={`url(#arc-grad-${color.replace('#', '')})`}
        strokeWidth={thickness}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinCard({
  event,
  isAuto,
  onPin,
  onClose,
}: {
  event: EventRow;
  isAuto: boolean;
  onPin: () => void;
  onClose: () => void;
}) {
  const place = [event.city, event.country_name, event.continent_name].filter(Boolean).join(' · ');
  const isDownload = event.kind === 'download';
  const isReturning = event.visitor_class === 'returning';
  // Match the swatch + kicker color to the arc's color, so the card identifies
  // visually which kind of arc the user clicked or which arc just fired.
  const arcColor = isDownload
    ? colorForPaper(event.paper_slug)
    : (isReturning ? VISIT_COLORS.returning : VISIT_COLORS.first_time);
  const kicker = isDownload
    ? 'Download'
    : isReturning
      ? 'Returning visit'
      : 'First-time visit';
  return (
    <div
      className="fixed bottom-6 right-6 max-w-sm p-5 z-40 cursor-pointer pin-card"
      style={{
        // Frosted milky glass: heavy blur + saturation boost amplifies
        // whatever's behind the card, then a low-fill linear gradient gives
        // the surface a subtle "sign" sheen (top brighter than bottom).
        backdropFilter: 'blur(28px) saturate(170%) brightness(106%)',
        WebkitBackdropFilter: 'blur(28px) saturate(170%) brightness(106%)',
        background:
          'linear-gradient(140deg, color-mix(in srgb, var(--bg) 22%, transparent), color-mix(in srgb, var(--bg) 42%, transparent))',
        color: 'var(--text, #fff)',
        border: '1px solid color-mix(in srgb, var(--text) 16%, transparent)',
        // Left edge tinted in the arc's color so each card is visually
        // tied to its arc on the globe.
        borderLeft: `3px solid ${arcColor}`,
        // Depth: drop shadow makes the sign float; inset highlights/shadows
        // suggest physical edge thickness like a 3D placard.
        boxShadow: [
          '0 16px 44px rgba(0, 0, 0, 0.35)',
          '0 4px 12px rgba(0, 0, 0, 0.18)',
          'inset 0 1px 0 rgba(255, 255, 255, 0.22)',
          'inset 0 -1px 0 rgba(0, 0, 0, 0.18)',
        ].join(', '),
        animation: 'pinCardIn 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      role="dialog"
      aria-label="Event details"
      onClick={() => { if (isAuto) onPin(); }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-3 right-3 opacity-70 hover:opacity-100 text-xs"
        aria-label="Close"
      >
        ✕
      </button>
      <div className="font-mono text-[10px] uppercase tracking-widest mb-2 inline-flex items-center gap-2">
        <span
          className="inline-block"
          style={{ width: '10px', height: '10px', borderRadius: '50%', background: arcColor, boxShadow: `0 0 8px ${arcColor}` }}
        />
        <span style={{ color: arcColor }}>{kicker}</span>
        <span className="opacity-50">· {timeAgo(event.ts)}</span>
        {isAuto && <span className="opacity-50 ml-1">· tap to keep</span>}
      </div>
      <div className="font-display text-lg leading-snug mb-3">{place || 'Unknown location'}</div>
      {isDownload && event.paper_title && event.paper_slug && (
        <a
          href={`/publications/${event.paper_slug}`}
          className="text-sm underline opacity-90 hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {event.paper_title}
        </a>
      )}
      {!isDownload && event.page_path && (
        <div className="font-mono text-xs opacity-70">{event.page_path}</div>
      )}
    </div>
  );
}

// Helpers — duplicated from globePalette so we can keep palette free of DOM types
function textWithAlpha(text: string, alpha: number): string {
  // Accept #RRGGBB, #RGB, or rgb()/rgba()
  const t = text.trim();
  if (t.startsWith('#')) {
    const m = t.replace('#', '');
    const expand = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    const r = parseInt(expand.slice(0, 2), 16);
    const g = parseInt(expand.slice(2, 4), 16);
    const b = parseInt(expand.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (t.startsWith('rgb')) {
    // strip alpha if present and re-apply ours
    const nums = t.match(/[\d.]+/g) || [];
    const [r, g, b] = nums.map((n) => Number(n));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(244, 239, 230, ${alpha})`;
}

function timeAgo(unix: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

// Crude centroid of a Polygon / MultiPolygon — average of the outer-ring
// vertices of the largest polygon (by vertex count). Good enough as a label
// anchor for most countries; for Russia/USA the centroid lands somewhere
// reasonable instead of perfect, which is fine at the zoom levels we show.
function polygonCentroid(geom: any): { lat: number; lng: number } | null {
  if (!geom) return null;
  let polys: number[][][][] = [];
  if (geom.type === 'Polygon') polys = [geom.coordinates];
  else if (geom.type === 'MultiPolygon') polys = geom.coordinates;
  else return null;
  // Pick the largest sub-polygon (most outer-ring vertices)
  let best: number[][] | null = null;
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer) continue;
    if (!best || outer.length > best.length) best = outer;
  }
  if (!best) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of best) {
    sx += x;
    sy += y;
  }
  return { lat: sy / best.length, lng: sx / best.length };
}
