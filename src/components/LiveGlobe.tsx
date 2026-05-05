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
    const accentSoft = cs.getPropertyValue('--color-accent-soft').trim() || '#A85368';
    const accentOnDark = cs.getPropertyValue('--color-accent-on-dark').trim() || '#D98B9A';
    return {
      isDark,
      // Earth dots: lighter in dark mode (cream on near-black), denser ink in light mode (charcoal on cream)
      hexDot: textWithAlpha(text, isDark ? 0.55 : 0.45),
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
        // Denser halftone: bump resolution to 4 (denser grid), drop margin to 0.2
        // (smaller gaps between dots), drop altitude so dots sit on the sphere.
        // Result: continents read as recognisable silhouettes instead of patches.
        .hexPolygonResolution(4)
        .hexPolygonMargin(0.2)
        .hexPolygonAltitude(0.001)
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

      // Watch for theme changes and recolor everything theme-aware
      const obs = new MutationObserver(() => {
        const c = readThemeColors();
        if (!c) return;
        g.atmosphereColor(c.atmosphere);
        g.hexPolygonColor(() => c.hexDot);
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
