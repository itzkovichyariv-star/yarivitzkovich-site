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

export default function LiveGlobe({ papers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const dragTimerRef = useRef<number | null>(null);
  const themeObserverRef = useRef<MutationObserver | null>(null);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [range, setRange] = useState<RangeKey>('7d');
  const [paper, setPaper] = useState<string>(''); // '' = all papers
  const [loading, setLoading] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [selected, setSelected] = useState<EventRow | null>(null);
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
    const accent = cs.getPropertyValue('--color-accent').trim() || '#7A1E2B';
    const accentOnDark = cs.getPropertyValue('--color-accent-on-dark').trim() || '#D98B9A';
    return {
      isDark,
      // Bump opacity higher so dots actually read against the page bg
      hexDot: textWithAlpha(text, isDark ? 0.55 : 0.65),
      atmosphere: isDark ? accentOnDark : accent,
    };
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
        // Hide the default opaque sphere — only the hex dots should render.
        // Keeps geometry intact so raycasts (clicks) still work via points/rings.
        .globeMaterial(
          new (THREE as any).MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        )
        .showAtmosphere(true)
        .atmosphereColor(colors?.atmosphere || '#7A1E2B')
        .atmosphereAltitude(0.12)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.4)
        .hexPolygonAltitude(0.005)
        .hexPolygonUseDots(true)
        .hexPolygonColor(() => colors?.hexDot || 'rgba(244,239,230,0.55)')
        .pointAltitude(0.012)
        .pointRadius(0.25)
        .pointResolution(8)
        .pointsTransitionDuration(0)
        .ringAltitude(0.008)
        .ringResolution(64)
        .ringPropagationSpeed(2)
        .ringRepeatPeriod(0); // single pulse, not repeating

      // Load Natural Earth land outlines for the halftone dotted earth
      try {
        const r = await fetch(COUNTRIES_URL);
        if (r.ok) {
          const geo = await r.json();
          if (alive && geo?.features) {
            g.hexPolygonsData(geo.features);
          }
        }
      } catch {
        // Network blocked — globe still works, just without continents.
      }

      // Configure controls — auto-rotate, paused on user drag
      const controls = g.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;
      controls.enableZoom = true;
      controls.minDistance = 200;
      controls.maxDistance = 800;

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

      // Click-pin handler
      g.onPointClick((pt: any) => {
        if (pt && pt.__event) setSelected(pt.__event as EventRow);
      });

      globeRef.current = g;

      // Watch for theme changes and recolor
      const obs = new MutationObserver(() => {
        const c = readThemeColors();
        if (!c) return;
        g.atmosphereColor(c.atmosphere);
        g.hexPolygonColor(() => c.hexDot);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      themeObserverRef.current = obs;
    })();

    return () => {
      alive = false;
      if (themeObserverRef.current) themeObserverRef.current.disconnect();
      if (dragTimerRef.current) window.clearTimeout(dragTimerRef.current);
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

  // Push events into the globe as points and rings
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;

    const placed = events.filter((e) => isFinite(Number(e.lat)) && isFinite(Number(e.lng)));

    // Tag each event so click handler can recover it
    const points = placed.map((e) => {
      const style = PIN_STYLES[e.visitor_class] || PIN_STYLES.first_time;
      return {
        lat: Number(e.lat),
        lng: Number(e.lng),
        color: withAlpha(style.color, Math.max(style.fadeOpacity, 0.55)),
        radius: 0.18 + style.dotRadius * 0.04,
        __event: e,
      };
    });

    g.pointsData(points)
      .pointColor((p: any) => p.color)
      .pointRadius((p: any) => p.radius);

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
        const style = PIN_STYLES[e.visitor_class] || PIN_STYLES.first_time;
        const delay = Math.random() * 800 + i * 25;
        const t = window.setTimeout(() => {
          if (cancelled) return;
          const data = g.ringsData() || [];
          const ringEntry = {
            lat: Number(e.lat),
            lng: Number(e.lng),
            color: withAlpha(style.color, 0.85),
            maxR: style.ringRadius,
            speed: style.ringRadius / (style.ringDurationMs / 1000),
          };
          g.ringsData([...data, ringEntry]);
          // Drop the ring after its lifetime so the array doesn't accumulate
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
