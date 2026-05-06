import { useEffect, useMemo, useRef, useState } from 'react';
import { ARC_COLORS } from '../lib/globePalette';

interface DetailEvent {
  id: number;
  ts: number;
  kind: 'visit' | 'download';
  visitor_class: 'first_time' | 'returning' | 'downloader';
  paper_slug: string | null;
  paper_title: string | null;
  page_path: string | null;
  country: string | null;
  country_name: string | null;
  continent: string | null;
  continent_name: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  ua_class: string | null;
  is_bot: number;
}

interface Counts {
  firstTime: number;
  returning: number;
  downloads: number;
  bots: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type RangeKey = '24h' | '7d' | '30d' | '1y' | 'all';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: 'Day' },
  { key: '7d', label: 'Week' },
  { key: '30d', label: 'Month' },
  { key: '1y', label: 'Year' },
  { key: 'all', label: 'All time' },
];

// Same colors as the legend in LiveGlobe — keeps the drawer visually
// tied to the arcs on the globe. (Single source of truth in globePalette.)
const CLASS_COLORS = ARC_COLORS;

export default function BreakdownDrawer({ open, onClose }: Props) {
  const [range, setRange] = useState<RangeKey>('7d');
  const [events, setEvents] = useState<DetailEvent[]>([]);
  const [counts, setCounts] = useState<Counts>({ firstTime: 0, returning: 0, downloads: 0, bots: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch events when the drawer opens or the range changes — and re-poll
  // every 30 seconds while open so the breakdown reflects live activity
  // without requiring the owner to close + reopen the drawer.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = (showSpinner: boolean) => {
      if (showSpinner) {
        setLoading(true);
        setError(null);
      }
      fetch(`/live/details?range=${range}`, { credentials: 'same-origin' })
        .then((r) => {
          if (r.status === 401) throw new Error('unauthorized');
          if (!r.ok) throw new Error(`http_${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (cancelled) return;
          setEvents(data.events || []);
          setCounts(data.counts || { firstTime: 0, returning: 0, downloads: 0, bots: 0 });
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          if (showSpinner) setError(String(e?.message || 'failed'));
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    };

    load(true);
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      load(false);
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, range]);

  // ESC + click-outside dismissal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Group + filter events by class — bots filtered out of the visible columns
  const groups = useMemo(() => {
    const fresh: DetailEvent[] = [];
    const ret: DetailEvent[] = [];
    const dl: DetailEvent[] = [];
    for (const e of events) {
      if (e.is_bot) continue;
      if (e.kind === 'download') dl.push(e);
      else if (e.visitor_class === 'returning') ret.push(e);
      else fresh.push(e);
    }
    return { fresh, ret, dl };
  }, [events]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onClick={(e) => {
        // Click on the dimmed backdrop (not the panel) closes
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
        animation: 'breakdownFadeIn 220ms ease-out',
      }}
      role="dialog"
      aria-label="Activity details"
    >
      <div
        ref={panelRef}
        className="mx-auto my-6 w-full max-w-6xl px-6 md:px-10 py-8 overflow-y-auto rounded-lg md:rounded-xl"
        style={{
          // Fully opaque panel — the WebGL globe behind doesn't blur cleanly
          // through backdrop-filter on Safari, so a translucent panel let
          // download arcs bleed through and made the breakdown text hard to
          // read. Subtle gradient keeps the editorial feel without sacrificing
          // legibility.
          background:
            'linear-gradient(140deg, var(--surface), color-mix(in srgb, var(--surface) 92%, var(--text) 4%))',
          border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
          color: 'var(--text)',
          // 100dvh follows the iOS Safari URL bar collapse — 100vh would
          // hide the bottom of the panel under the dynamic toolbar.
          maxHeight: 'calc(100dvh - 3rem)',
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
          animation: 'breakdownPanelIn 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: time-range tabs + close button */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap font-mono text-xs uppercase tracking-widest">
            <span className="text-soft">Range</span>
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className="hover:opacity-100 transition-opacity"
                style={{
                  opacity: range === key ? 1 : 0.55,
                  borderBottom: range === key ? '1px solid currentColor' : '1px solid transparent',
                  paddingBottom: '2px',
                }}
              >
                {label}
              </button>
            ))}
            {loading && <span className="opacity-50">Loading…</span>}
            {error === 'unauthorized' && <span className="opacity-70">Sign in as owner first.</span>}
            {error && error !== 'unauthorized' && <span className="opacity-70">Couldn't load.</span>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Close drawer"
          >
            ✕ Close
          </button>
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column
            title="First-time visits"
            count={counts.firstTime}
            color={CLASS_COLORS.first_time}
            events={groups.fresh}
          />
          <Column
            title="Returning visits"
            count={counts.returning}
            color={CLASS_COLORS.returning}
            events={groups.ret}
          />
          <Column
            title="Downloads"
            count={counts.downloads}
            color={CLASS_COLORS.download}
            events={groups.dl}
          />
        </div>

        {counts.bots > 0 && (
          <div className="mt-6 font-mono text-[10px] uppercase tracking-widest opacity-50">
            {counts.bots} bot {counts.bots === 1 ? 'event' : 'events'} excluded
          </div>
        )}
      </div>
    </div>
  );
}

function Column({
  title,
  count,
  color,
  events,
}: {
  title: string;
  count: number;
  color: string;
  events: DetailEvent[];
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className="inline-block"
          style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }}
        />
        <h3 className="font-mono text-xs uppercase tracking-widest" style={{ color }}>
          {title}
        </h3>
        <span className="font-mono text-xs opacity-60" style={{ fontVariantNumeric: 'tabular-nums' }}>
          ({count})
        </span>
      </div>
      <div
        className="border-t border-current border-opacity-10 pt-2"
        style={{ borderColor: 'color-mix(in srgb, var(--text) 12%, transparent)' }}
      >
        {events.length === 0 && (
          <p className="font-mono text-xs opacity-40 py-3">No events in range.</p>
        )}
        {events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: DetailEvent }) {
  const place = [event.city, event.country_name].filter(Boolean).join(', ');
  const continent = event.continent_name;
  return (
    <div className="py-3 border-b border-current border-opacity-5" style={{ borderColor: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
      <div className="font-display text-sm leading-tight">{place || 'Unknown'}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-55 mt-1">
        {continent && <>{continent} · </>}
        {timeAgo(event.ts)}
      </div>
      {event.kind === 'download' && event.paper_title && event.paper_slug && (
        <a
          href={`/publications/${event.paper_slug}`}
          className="block mt-1 font-display text-xs italic underline opacity-80 hover:opacity-100"
        >
          {truncate(event.paper_title, 80)}
        </a>
      )}
      {event.kind === 'visit' && event.page_path && (
        <div className="mt-1 font-mono text-[11px] opacity-65">{event.page_path}</div>
      )}
    </div>
  );
}

function timeAgo(unix: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  if (diff < 365 * 86400) return `${Math.floor(diff / (30 * 86400))} mo ago`;
  return `${Math.floor(diff / (365 * 86400))} y ago`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
