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

// A handful of major world cities used by the "Demo" button to fire a fake
// arc so the visitor can see what a real download looks like even when
// only one or two real downloads exist in the database.
const DEMO_CITIES: Array<{ name: string; country: string; continent: string; lat: number; lng: number }> = [
  { name: 'New York',     country: 'United States',  continent: 'North America', lat:  40.71, lng:  -74.01 },
  { name: 'London',       country: 'United Kingdom', continent: 'Europe',        lat:  51.51, lng:   -0.13 },
  { name: 'Berlin',       country: 'Germany',        continent: 'Europe',        lat:  52.52, lng:   13.40 },
  { name: 'Paris',        country: 'France',         continent: 'Europe',        lat:  48.86, lng:    2.35 },
  { name: 'Tokyo',        country: 'Japan',          continent: 'Asia',          lat:  35.69, lng:  139.69 },
  { name: 'Sydney',       country: 'Australia',      continent: 'Oceania',       lat: -33.87, lng:  151.21 },
  { name: 'São Paulo',    country: 'Brazil',         continent: 'South America', lat: -23.55, lng:  -46.63 },
  { name: 'Cape Town',    country: 'South Africa',   continent: 'Africa',        lat: -33.92, lng:   18.42 },
  { name: 'Mumbai',       country: 'India',          continent: 'Asia',          lat:  19.08, lng:   72.88 },
  { name: 'Mexico City',  country: 'Mexico',         continent: 'North America', lat:  19.43, lng:  -99.13 },
];

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

  const [events, setEvents] = useState<EventRow[]>([]);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [range, setRange] = useState<RangeKey>('7d');
  const [paper, setPaper] = useState<string>(''); // '' = all papers
  const [loading, setLoading] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [demoNote, setDemoNote] = useState<string | null>(null);

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
        // Realistic Earth: day texture in light mode, night texture (city
        // lights, ink-on-blue) in dark mode. Bump map adds subtle terrain
        // shadowing on top of either.
        .globeImageUrl(colors?.isDark ? EARTH_NIGHT_URL : EARTH_DAY_URL)
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

      // Load Natural Earth country outlines for the borders layer + label centroids
      let countryLabels: Array<{ kind: 'country'; text: string; lat: number; lng: number }> = [];
      try {
        const r = await fetch(COUNTRIES_URL);
        if (r.ok) {
          const geo = await r.json();
          if (alive && geo?.features) {
            g.polygonsData(geo.features);
            // Compute a crude centroid per country for the label layer
            countryLabels = geo.features
              .map((f: any) => {
                const name =
                  f.properties?.NAME ||
                  f.properties?.name ||
                  f.properties?.ADMIN ||
                  f.properties?.NAME_LONG;
                if (!name) return null;
                const c = polygonCentroid(f.geometry);
                if (!c) return null;
                return { kind: 'country' as const, text: String(name).toUpperCase(), lat: c.lat, lng: c.lng };
              })
              .filter(Boolean);
          }
        }
      } catch {
        // Network blocked — globe still works, just without borders/labels.
      }

      // Label data assembled — actual rendering + zoom listener are wired
      // after `controls` is set up below so we can hook into camera-change.
      const allLabels = [...CONTINENT_LABELS, ...countryLabels];

      // (No more THREE.Points cloud — the realistic earth texture above
      //  carries continent shapes directly. Country borders + zoom-driven
      //  labels still ride above as editorial chrome.)
      const earthPoints: any = null;

      // Add a soft ambient light so the night-side / dark-mode texture is
      // never crushed to pure black. globe.gl's built-in lighting is
      // directional — without an ambient pass the unlit hemisphere
      // disappears, especially with the city-lights night texture.
      const ambient = new (THREE as any).AmbientLight(0xa8b0c8, 0.65);
      g.scene().add(ambient);

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

      // Continent labels only, by default. Country labels were causing
      // visual chaos on smaller viewports (190 names rendered on top of
      // each other and they didn't read as anchored to specific places).
      // The continent labels alone give enough orientation; the data is
      // still computed in countryLabels above so we can re-introduce a
      // filtered subset later if we want.
      const visibleLabels = allLabels.filter((l: any) => l.kind === 'continent');
      g.htmlElementsData(visibleLabels)
        .htmlLat((d: any) => d.lat)
        .htmlLng((d: any) => d.lng)
        .htmlAltitude(0.012)
        .htmlElement((d: any) => {
          const el = document.createElement('div');
          el.className = `gl-label gl-label-${d.kind}`;
          el.textContent = d.text;
          el.dataset.kind = d.kind;
          return el;
        })
        .htmlElementVisibilityModifier((el: any, hidden: boolean) => {
          el.style.visibility = hidden ? 'hidden' : 'visible';
        });

      const updateLabelOpacities = () => {
        const dist = (controls as any).getDistance ? (controls as any).getDistance() : 400;
        let continentOp = 1;
        if (dist < ZOOM_NEAR) continentOp = 0;
        else if (dist < ZOOM_FAR) continentOp = (dist - ZOOM_NEAR) / (ZOOM_FAR - ZOOM_NEAR);
        let countryOp = 0;
        if (dist < ZOOM_NEAR) countryOp = 1;
        else if (dist < ZOOM_FAR) countryOp = 1 - (dist - ZOOM_NEAR) / (ZOOM_FAR - ZOOM_NEAR);

        const root = containerRef.current;
        if (!root) return;
        root.querySelectorAll<HTMLElement>('.gl-label-continent').forEach((el) => {
          el.style.opacity = String(continentOp * 0.32);
        });
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
        // Swap the earth texture between day and night
        g.globeImageUrl(c.isDark ? EARTH_NIGHT_URL : EARTH_DAY_URL);
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

    // Arcs: one per download event, from Ariel -> reader city. Each arc is
    // rendered as TWO entries — a wide soft halo behind a thinner bright
    // core — to fake a glow without three.js post-processing.
    const downloads = placed.filter((e) => e.kind === 'download');
    const arcs: any[] = [];
    for (const e of downloads) {
      const hex = colorForPaper(e.paper_slug);
      const halo = {
        startLat: ARIEL_LAT,
        startLng: ARIEL_LNG,
        endLat: Number(e.lat),
        endLng: Number(e.lng),
        color: [withAlpha(hex, 0.35), withAlpha(hex, 0.10)] as [string, string],
        __stroke: 2.4,
        __event: e,
        __paperColor: hex,
        __isHalo: true,
      };
      const core = {
        startLat: ARIEL_LAT,
        startLng: ARIEL_LNG,
        endLat: Number(e.lat),
        endLng: Number(e.lng),
        color: [withAlpha(hex, 1.0), withAlpha(hex, 0.85)] as [string, string],
        __stroke: 0.7,
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

    // Rings: stagger entrance so we don't pulse all at once on load
    if (reduced) {
      g.ringsData([]);
    } else {
      g.ringsData([])
        .ringColor((r: any) => () => r.color)
        .ringMaxRadius((r: any) => r.maxR)
        .ringPropagationSpeed((r: any) => r.speed)
        .ringRepeatPeriod(0);

      const cap = Math.min(placed.length, 80); // never animate more than 80 at a time
      const subset = placed.slice(0, cap);

      let cancelled = false;
      const timers: number[] = [];
      subset.forEach((e, i) => {
        const cls = e.visitor_class as keyof typeof palette;
        const def = palette[cls] || palette.first_time;
        const style = PIN_STYLES[e.visitor_class] || PIN_STYLES.first_time;
        const delay = Math.random() * 800 + i * 25;
        const t = window.setTimeout(() => {
          if (cancelled) return;
          const data = g.ringsData() || [];
          const ringEntry = {
            lat: Number(e.lat),
            lng: Number(e.lng),
            color: withAlpha(def.color, 0.95),
            maxR: style.ringRadius,
            speed: style.ringRadius / (style.ringDurationMs / 1000),
          };
          g.ringsData([...data, ringEntry]);
          // Downloader gets a second concentric ring offset by 300ms — the spec's
          // "two concentric rings" treatment that signals the strongest engagement.
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
          // Drop the primary ring after its lifetime so the array doesn't accumulate
          const t2 = window.setTimeout(() => {
            if (cancelled) return;
            const next = (g.ringsData() || []).filter((r: any) => r !== ringEntry);
            g.ringsData(next);
          }, style.ringDurationMs + 200);
          timers.push(t2);
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

  // Fire a synthetic download arc so the visitor can see what a real
   // download event looks like. The arc is added directly to globe.gl's
   // arcsData (not React state) so it animates immediately, and is removed
   // after a few seconds. Does NOT touch D1 — purely visual.
  const fireDemoArc = (opts: { silent?: boolean } = {}) => {
    const g = globeRef.current;
    if (!g) return;
    const city = DEMO_CITIES[Math.floor(Math.random() * DEMO_CITIES.length)];
    const paper = papers.length ? papers[Math.floor(Math.random() * papers.length)] : null;
    const slug = paper?.slug || 'demo';
    const title = paper?.title || 'Demo paper';
    const hex = colorForPaper(slug);
    const evRow: EventRow = {
      ts: Math.floor(Date.now() / 1000),
      kind: 'download',
      visitor_class: 'downloader',
      paper_slug: slug,
      paper_title: title,
      page_path: null,
      country: null,
      country_name: city.country,
      continent: null,
      continent_name: city.continent,
      city: city.name,
      lat: city.lat,
      lng: city.lng,
    };
    const halo: any = {
      startLat: ARIEL_LAT, startLng: ARIEL_LNG,
      endLat: city.lat, endLng: city.lng,
      color: [withAlpha(hex, 0.35), withAlpha(hex, 0.10)] as [string, string],
      __stroke: 2.4,
      __isDemo: true, __isHalo: true, __event: evRow,
    };
    const core: any = {
      startLat: ARIEL_LAT, startLng: ARIEL_LNG,
      endLat: city.lat, endLng: city.lng,
      color: [withAlpha(hex, 1.0), withAlpha(hex, 0.85)] as [string, string],
      __stroke: 0.7,
      __isDemo: true, __event: evRow,
    };
    const current = g.arcsData() || [];
    g.arcsData([...current, halo, core]);

    // Status note in the filter bar (suppressed in silent / auto-loop mode)
    if (!opts.silent) {
      setDemoNote(`Demo · "${title.length > 36 ? title.slice(0, 33) + '…' : title}" → ${city.name}`);
    }

    // Pulse a ring at the destination too, so the arrival is visible
    if (!reduced) {
      const ringEntry: any = {
        lat: city.lat,
        lng: city.lng,
        color: withAlpha(hex, 0.95),
        maxR: 3,
        speed: 2.5,
      };
      const ringsBefore = g.ringsData() || [];
      g.ringsData([...ringsBefore, ringEntry]);
      setTimeout(() => {
        const after = (g.ringsData() || []).filter((r: any) => r !== ringEntry);
        g.ringsData(after);
      }, 1500);
    }

    // Remove the arc pair after enough time to fully animate + linger
    setTimeout(() => {
      const after = (g.arcsData() || []).filter((a: any) => a !== halo && a !== core);
      g.arcsData(after);
      if (!opts.silent) setDemoNote(null);
    }, 6000);
  };

  // Continuous demo loop — keeps the page feeling alive between real
  // downloads. Fires a silent synthetic arc every ~4 seconds. Pauses when
  // the tab is hidden so we don't burn cycles when no one's looking.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!globeRef.current) return;
      fireDemoArc({ silent: true });
    };
    // Stagger the first call slightly so the page doesn't blast on load
    const startTimer = window.setTimeout(tick, 1500);
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers.length]);

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
        <button
          type="button"
          onClick={fireDemoArc}
          className="inline-flex items-center gap-1.5 hover:opacity-100 transition-opacity"
          style={{ opacity: 0.65, borderBottom: '1px dashed currentColor', paddingBottom: '2px' }}
          title="Fire a synthetic download arc so you can see the animation"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }}></span>
          Demo arc
        </button>
        {loading && <span className="opacity-50">Loading…</span>}
        {demoNote && (
          <span className="opacity-80" style={{ borderLeft: '1px solid currentColor', paddingLeft: '0.75rem', marginLeft: '0.25rem' }}>
            {demoNote}
          </span>
        )}
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
      {selected && <PinCard event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PinCard({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const place = [event.city, event.country_name, event.continent_name].filter(Boolean).join(' · ');
  const isDownload = event.kind === 'download';
  return (
    <div
      className="fixed bottom-6 right-6 max-w-sm p-5 z-40"
      style={{
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        background: 'rgba(0,0,0,0.45)',
        color: 'var(--text, #fff)',
        border: '1px solid var(--divider, rgba(255,255,255,0.18))',
      }}
      role="dialog"
      aria-label="Event details"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 opacity-70 hover:opacity-100 text-xs"
        aria-label="Close"
      >
        ✕
      </button>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-2">
        {isDownload ? 'Download' : 'Visit'} · {timeAgo(event.ts)}
      </div>
      <div className="font-display text-lg leading-snug mb-3">{place || 'Unknown location'}</div>
      {isDownload && event.paper_title && event.paper_slug && (
        <a
          href={`/publications/${event.paper_slug}`}
          className="text-sm underline opacity-90 hover:opacity-100"
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
