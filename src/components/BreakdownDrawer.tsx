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

interface PaperOption {
  slug: string;
  title: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Publications list used to resolve paper titles when an event row was
      written before P1 paper-title lookup, or to render a citation under
      first-time visits triggered by a PDF deep-link. */
  papers: PaperOption[];
  /** 'modal' (default) renders the dimmed full-screen overlay with a
      close button — the in-place owner inspector on /live. 'inline'
      renders just the panel content so it can be embedded as page
      content under /manage/events. */
  mode?: 'modal' | 'inline';
}

type RangeKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: 'Day' },
  { key: '7d', label: 'Week' },
  { key: '30d', label: 'Month' },
  { key: '90d', label: 'Quarter' },
  { key: '1y', label: 'Year' },
  { key: 'all', label: 'All time' },
];

type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year';

const PERIOD_OPTIONS: Array<{ key: PeriodType; label: string }> = [
  { key: 'day',     label: 'Day' },
  { key: 'week',    label: 'Week' },
  { key: 'month',   label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year',    label: 'Year' },
];

function getPeriodBounds(type: PeriodType, offset: number): { from: number; to: number; label: string } {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);

  if (type === 'day') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const from = Math.floor(d.getTime() / 1000);
    const to = offset === 0 ? nowSec : from + 86400 - 1;
    return { from, to, label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) };
  }

  if (type === 'week') {
    const dow = (now.getDay() + 6) % 7; // 0 = Monday
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + offset * 7);
    const weekEnd   = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
    const from = Math.floor(weekStart.getTime() / 1000);
    const to   = offset === 0 ? nowSec : Math.floor(weekEnd.getTime() / 1000) + 86399;
    const label = weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
      ' – ' + weekEnd.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return { from, to, label };
  }

  if (type === 'month') {
    const d       = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    return {
      from:  Math.floor(d.getTime() / 1000),
      to:    offset === 0 ? nowSec : Math.floor(monthEnd.getTime() / 1000),
      label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }

  if (type === 'quarter') {
    const curQ   = Math.floor(now.getMonth() / 3);
    const totalQ = curQ + offset;
    const year   = now.getFullYear() + Math.floor(totalQ / 4);
    const qIdx   = ((totalQ % 4) + 4) % 4;
    const qStart = new Date(year, qIdx * 3, 1);
    const qEnd   = new Date(year, qIdx * 3 + 3, 0, 23, 59, 59);
    return {
      from:  Math.floor(qStart.getTime() / 1000),
      to:    offset === 0 ? nowSec : Math.floor(qEnd.getTime() / 1000),
      label: `Q${qIdx + 1} ${year}`,
    };
  }

  // year
  const year    = now.getFullYear() + offset;
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  return {
    from:  Math.floor(new Date(year, 0, 1).getTime() / 1000),
    to:    offset === 0 ? nowSec : Math.floor(yearEnd.getTime() / 1000),
    label: String(year),
  };
}

// Bucket events between explicit from/to bounds (used by the compare panels).
function bucketEventsByPeriod(
  events: DetailEvent[],
  fromSec: number,
  toSec: number,
): { bucketLabel: string; series: { visits: number[]; firstTime: number[]; returning: number[]; downloads: number[] } } {
  const span = Math.max(1, toSec - fromSec);
  let buckets: number, sizeSec: number, label: string;
  if      (span <= 2 * 86400)   { buckets = Math.max(2, Math.ceil(span / 3600)); sizeSec = 3600;                  label = 'hour'; }
  else if (span <= 14 * 86400)  { buckets = Math.ceil(span / 86400);              sizeSec = 86400;                 label = 'day'; }
  else if (span <= 100 * 86400) { buckets = 13;                                   sizeSec = Math.ceil(span / 13);  label = 'week'; }
  else if (span <= 400 * 86400) { buckets = 12;                                   sizeSec = Math.ceil(span / 12);  label = 'month'; }
  else                          { buckets = 12;                                   sizeSec = Math.ceil(span / 12);  label = 'quarter'; }

  const visits    = Array<number>(buckets).fill(0);
  const firstTime = Array<number>(buckets).fill(0);
  const returning = Array<number>(buckets).fill(0);
  const downloads = Array<number>(buckets).fill(0);

  for (const e of events) {
    if (e.is_bot) continue;
    if (e.ts < fromSec || e.ts > toSec) continue;
    let idx = Math.floor((e.ts - fromSec) / sizeSec);
    if (idx < 0) idx = 0;
    if (idx >= buckets) idx = buckets - 1;
    if (e.kind === 'download') downloads[idx]++;
    else { visits[idx]++; if (e.visitor_class === 'returning') returning[idx]++; else firstTime[idx]++; }
  }
  return { bucketLabel: label, series: { visits, firstTime, returning, downloads } };
}

// Visits-aggregate color (matches the GlobeHUD "visits" pill).
const VISITS_COLOR = '#9DB3BE';

// Time-series bucketing. Given an event list and a range, returns 4
// parallel arrays bucketed into N intervals from start to now. Bucket
// granularity scales with the range: hourly for 24h, daily for 7d/30d,
// weekly for 90d, monthly for 1y/all. This keeps each chart to ~10-30
// data points regardless of the time window — small enough to render
// as a clean SVG sparkline, dense enough to show real movement.
function bucketEvents(
  events: DetailEvent[],
  range: RangeKey,
): {
  buckets: number;
  bucketLabel: string;
  series: { visits: number[]; firstTime: number[]; returning: number[]; downloads: number[] };
} {
  const endSec = Math.floor(Date.now() / 1000);

  let buckets = 7;
  let sizeSec = 86400;
  let label = 'day';

  if (range === '24h') { buckets = 24; sizeSec = 3600; label = 'hour'; }
  else if (range === '7d') { buckets = 7; sizeSec = 86400; label = 'day'; }
  else if (range === '30d') { buckets = 30; sizeSec = 86400; label = 'day'; }
  else if (range === '90d') { buckets = 13; sizeSec = 7 * 86400; label = 'week'; }
  else if (range === '1y') { buckets = 12; sizeSec = Math.floor(365 * 86400 / 12); label = 'month'; }
  else if (range === 'all') {
    // Fit to data span — 12 buckets between earliest event and now.
    const minTs = events.reduce((m, e) => Math.min(m, e.ts), endSec);
    const span = Math.max(86400, endSec - minTs);
    buckets = 12;
    sizeSec = Math.ceil(span / buckets);
    label = sizeSec >= 30 * 86400 ? 'month' : sizeSec >= 7 * 86400 ? 'week' : 'day';
  }

  const startSec = endSec - buckets * sizeSec;
  const visits = Array<number>(buckets).fill(0);
  const firstTime = Array<number>(buckets).fill(0);
  const returning = Array<number>(buckets).fill(0);
  const downloads = Array<number>(buckets).fill(0);

  for (const e of events) {
    if (e.is_bot) continue;
    if (e.ts < startSec) continue;
    let idx = Math.floor((e.ts - startSec) / sizeSec);
    if (idx < 0) continue;
    if (idx >= buckets) idx = buckets - 1;
    if (e.kind === 'download') {
      downloads[idx]++;
    } else {
      visits[idx]++;
      if (e.visitor_class === 'returning') returning[idx]++;
      else firstTime[idx]++;
    }
  }

  return { buckets, bucketLabel: label, series: { visits, firstTime, returning, downloads } };
}

// Same colors as the legend in LiveGlobe — keeps the drawer visually
// tied to the arcs on the globe. (Single source of truth in globePalette.)
const CLASS_COLORS = ARC_COLORS;

export default function BreakdownDrawer({ open, onClose, papers, mode = 'modal' }: Props) {
  // Inline mode: the component always behaves as if it's open — there's
  // no close action, since the page itself is the container.
  const isInline = mode === 'inline';
  const isOpen = isInline ? true : open;
  const [range, setRange] = useState<RangeKey>('7d');
  const [events, setEvents] = useState<DetailEvent[]>([]);
  const [counts, setCounts] = useState<Counts>({ firstTime: 0, returning: 0, downloads: 0, bots: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  // Compare panel A — period type + step offset (0 = current, -1 = previous, …)
  const [periodTypeA, setPeriodTypeA] = useState<PeriodType>('month');
  const [offsetA, setOffsetA] = useState(0);
  // Compare panel B — defaults to previous month so the comparison is immediately useful
  const [periodTypeB, setPeriodTypeB] = useState<PeriodType>('month');
  const [offsetB, setOffsetB] = useState(-1);
  const [eventsB, setEventsB] = useState<DetailEvent[]>([]);
  const [loadingB, setLoadingB] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch events for panel A. In normal mode uses the relative ?range= key;
  // in compare mode uses exact ?from=&to= bounds from the period picker.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = (showSpinner: boolean) => {
      if (showSpinner) { setLoading(true); setError(null); }
      let url: string;
      if (compareMode) {
        const { from, to } = getPeriodBounds(periodTypeA, offsetA);
        url = `/live/details?from=${from}&to=${to}`;
      } else {
        url = `/live/details?range=${range}`;
      }
      fetch(url, { credentials: 'same-origin' })
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

    return () => { cancelled = true; window.clearInterval(id); };
  }, [isOpen, range, compareMode, periodTypeA, offsetA]);

  // Fetch comparison panel B using the period picker bounds.
  useEffect(() => {
    if (!isOpen || !compareMode) return;
    let cancelled = false;

    const loadB = (showSpinner: boolean) => {
      if (showSpinner) setLoadingB(true);
      const { from, to } = getPeriodBounds(periodTypeB, offsetB);
      fetch(`/live/details?from=${from}&to=${to}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setEventsB(data.events || []);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled && showSpinner) setLoadingB(false); });
    };

    loadB(true);
    const id = window.setInterval(() => {
      if (!document.hidden) loadB(false);
    }, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isOpen, compareMode, periodTypeB, offsetB]);

  // ESC dismissal — only relevant in modal mode.
  useEffect(() => {
    if (!isOpen || isInline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isInline, onClose]);

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

  // While the drawer is open, attach a body class. The CSS in
  // live.astro uses that class to hide the globe's HTML labels and
  // canvas — they bleed through the drawer's translucent overlay
  // because globe.gl mounts them in a stacking context that isn't
  // covered by a plain z-index on this component.
  useEffect(() => {
    if (!isOpen || isInline) return;
    document.body.classList.add('breakdown-open');
    return () => document.body.classList.remove('breakdown-open');
  }, [isOpen, isInline]);

  if (!isOpen) return null;

  // Inline mode: render the panel as plain page content (no overlay,
  // no fixed positioning, no close button) so it can be embedded under
  // /manage/events. Modal mode keeps its dimmed-backdrop behaviour.
  const InlineWrapper = ({ children }: { children: React.ReactNode }) => (
    <div ref={panelRef} className="w-full" style={{ color: 'var(--text)' }}>
      {children}
    </div>
  );
  const ModalWrapper = ({ children }: { children: React.ReactNode }) => (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      onClick={(e) => {
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
          background:
            'linear-gradient(140deg, var(--surface), color-mix(in srgb, var(--surface) 92%, var(--text) 4%))',
          border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
          color: 'var(--text)',
          maxHeight: 'calc(100dvh - 3rem)',
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
          animation: 'breakdownPanelIn 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  const Wrapper = isInline ? InlineWrapper : (
    ({ children }: { children: React.ReactNode }) => <ModalWrapper>{children}</ModalWrapper>
  );

  // The panel's inner content. Shared between modal and inline modes.
  const panelInner = (
    <>
        {/* Header: time-range tabs + close button */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap font-mono text-xs uppercase tracking-widest">
            {!compareMode && (
              <>
                <span className="opacity-35" style={{ cursor: 'default', userSelect: 'none' }}>Range ·</span>
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
              </>
            )}
            {loading && <span className="opacity-50">Loading…</span>}
            {error === 'unauthorized' && <span className="opacity-70">Sign in as owner first.</span>}
            {error && error !== 'unauthorized' && <span className="opacity-70">Couldn't load.</span>}
            <button
              type="button"
              onClick={() => setCompareMode((v) => {
                if (v) setEventsB([]);
                return !v;
              })}
              className="hover:opacity-100 transition-opacity"
              style={{
                opacity: compareMode ? 1 : 0.45,
                borderBottom: compareMode ? '1px solid currentColor' : '1px solid transparent',
                paddingBottom: '2px',
                marginLeft: compareMode ? undefined : '0.5rem',
              }}
            >
              Compare
            </button>
          </div>

          {!isInline && (
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-xs uppercase tracking-widest opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Close drawer"
            >
              ✕ Close
            </button>
          )}
        </div>

        {/* Growth-over-time sparklines — single view or side-by-side compare */}
        {compareMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-2">
            <ComparePanel
              label="A"
              events={events}
              periodType={periodTypeA}
              offset={offsetA}
              onPeriodTypeChange={(t) => { setPeriodTypeA(t); setOffsetA(0); }}
              onOffsetChange={setOffsetA}
              loading={loading}
            />
            <ComparePanel
              label="B"
              events={eventsB}
              periodType={periodTypeB}
              offset={offsetB}
              onPeriodTypeChange={(t) => { setPeriodTypeB(t); setOffsetB(-1); }}
              onOffsetChange={setOffsetB}
              loading={loadingB}
            />
          </div>
        ) : (
          <GrowthCharts events={events} range={range} />
        )}

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column
            title="First-time visits"
            count={counts.firstTime}
            color={CLASS_COLORS.first_time}
            events={groups.fresh}
            papers={papers}
          />
          <Column
            title="Returning visits"
            count={counts.returning}
            color={CLASS_COLORS.returning}
            events={groups.ret}
            papers={papers}
          />
          <Column
            title="Downloads"
            count={counts.downloads}
            color={CLASS_COLORS.download}
            events={groups.dl}
            papers={papers}
          />
        </div>

        {counts.bots > 0 && (
          <div className="mt-6 font-mono text-[10px] uppercase tracking-widest opacity-50">
            {counts.bots} bot {counts.bots === 1 ? 'event' : 'events'} excluded
          </div>
        )}
    </>
  );

  return <Wrapper>{panelInner}</Wrapper>;
}

function Column({
  title,
  count,
  color,
  events,
  papers,
}: {
  title: string;
  count: number;
  color: string;
  events: DetailEvent[];
  papers: PaperOption[];
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
          <EventRow key={e.id} event={e} papers={papers} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event, papers }: { event: DetailEvent; papers: PaperOption[] }) {
  const place = [event.city, event.country_name].filter(Boolean).join(', ');
  const continent = event.continent_name;
  const isDownload = event.kind === 'download';

  // Paper citation only renders under DOWNLOAD rows — a visit is just
  // an entry to the site (the paper context belongs to its download).
  // Resolve via the publications list so early download events whose
  // paper_title was null still render their title here.
  const downloadTitle = isDownload
    ? event.paper_title ||
      (event.paper_slug ? papers.find((p) => p.slug === event.paper_slug)?.title : null)
    : null;

  // For visits, show page_path so we know what they hit — but hide the
  // /pdfs/<slug>.pdf paths that come from synthesized first-time visits,
  // since those are an internal artifact (the matching download row in
  // the next column already carries the paper info).
  const showPagePath =
    !isDownload && event.page_path && !event.page_path.startsWith('/pdfs/');

  return (
    <div className="py-3 border-b border-current border-opacity-5" style={{ borderColor: 'color-mix(in srgb, var(--text) 8%, transparent)' }}>
      <div className="font-display text-sm leading-tight">{place || 'Unknown'}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-55 mt-1">
        {continent && <>{continent} · </>}
        {timeAgo(event.ts)}
      </div>
      {isDownload && downloadTitle && event.paper_slug && (
        <a
          href={`/publications/${event.paper_slug}`}
          className="block mt-1 font-display text-xs italic underline opacity-80 hover:opacity-100"
        >
          {truncate(downloadTitle, 80)}
        </a>
      )}
      {showPagePath && event.page_path && (
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
  // After 24 hours, "5 d ago" / "2 mo ago" / "1 y ago" carry less
  // information than the actual date. Switch to a calendar date —
  // omit the year when the event is in the current year.
  const date = new Date(unix * 1000);
  const now = new Date();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SITE_START_YEAR = 2024;

function ComparePanel({
  label,
  events,
  periodType,
  offset,
  onPeriodTypeChange,
  onOffsetChange,
  loading,
}: {
  label: string;
  events: DetailEvent[];
  periodType: PeriodType;
  offset: number;
  onPeriodTypeChange: (t: PeriodType) => void;
  onOffsetChange: (o: number) => void;
  loading?: boolean;
}) {
  const { from, to, label: periodLabel } = useMemo(
    () => getPeriodBounds(periodType, offset),
    [periodType, offset],
  );

  // Stable "now" for all offset calculations within a session.
  const now      = useMemo(() => new Date(), []);
  const nowYear  = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowQ     = Math.floor(nowMonth / 3);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(nowYear);
  const navRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside the nav row.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const handlePeriodTypeChange = (t: PeriodType) => {
    setPickerOpen(false);
    onPeriodTypeChange(t);
  };

  const hasPicker = periodType === 'month' || periodType === 'quarter' || periodType === 'year';

  const handleLabelClick = () => {
    if (pickerOpen) { setPickerOpen(false); return; }
    // Sync the picker's year navigator to the year of the currently selected period.
    if (periodType === 'month') {
      setPickerYear(new Date(nowYear, nowMonth + offset, 1).getFullYear());
    } else if (periodType === 'quarter') {
      setPickerYear(nowYear + Math.floor((nowQ + offset) / 4));
    } else if (periodType === 'year') {
      setPickerYear(nowYear + offset);
    }
    setPickerOpen(true);
  };

  const isFutureMonth   = (y: number, m: number) => y > nowYear || (y === nowYear && m > nowMonth);
  const isFutureQuarter = (y: number, q: number) => y > nowYear || (y === nowYear && q > nowQ);

  const isSelectedMonth   = (y: number, m: number) => (y - nowYear) * 12 + m - nowMonth === offset;
  const isSelectedQuarter = (y: number, q: number) => (y - nowYear) * 4  + q - nowQ    === offset;
  const isSelectedYear    = (y: number)             => y - nowYear === offset;

  return (
    <div>
      {/* Period type tabs */}
      <div className="flex items-center gap-3 flex-wrap font-mono text-[10px] uppercase tracking-widest mb-2">
        <span className="opacity-35" style={{ userSelect: 'none' }}>{label} ·</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => handlePeriodTypeChange(opt.key)}
            className="hover:opacity-100 transition-opacity"
            style={{
              opacity: periodType === opt.key ? 1 : 0.45,
              borderBottom: periodType === opt.key ? '1px solid currentColor' : '1px solid transparent',
              paddingBottom: '2px',
            }}
          >
            {opt.label}
          </button>
        ))}
        {loading && <span className="opacity-40">Loading…</span>}
      </div>

      {/* Period navigator: ← [label] → — label is tappable for month/quarter/year */}
      <div className="relative" ref={navRef}>
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest mb-4">
          <button
            type="button"
            onClick={() => onOffsetChange(offset - 1)}
            className="opacity-55 hover:opacity-100 transition-opacity px-1"
            aria-label="Previous period"
          >
            ←
          </button>

          {hasPicker ? (
            <button
              type="button"
              onClick={handleLabelClick}
              className="opacity-90 min-w-[7rem] text-center hover:opacity-100 transition-opacity"
              style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
              aria-label="Open period picker"
            >
              {periodLabel}
            </button>
          ) : (
            <span className="opacity-90 min-w-[7rem] text-center">{periodLabel}</span>
          )}

          <button
            type="button"
            onClick={() => onOffsetChange(offset + 1)}
            disabled={offset >= 0}
            className="opacity-55 hover:opacity-100 transition-opacity px-1 disabled:opacity-20"
            aria-label="Next period"
          >
            →
          </button>
        </div>

        {/* Period picker dropdown */}
        {pickerOpen && (
          <div
            className="absolute z-20 rounded-lg p-4"
            style={{
              top: '2.4rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--text) 18%, transparent)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              minWidth: '13rem',
            }}
          >
            {/* Month picker: year nav + 3×4 month grid */}
            {periodType === 'month' && (
              <>
                <div className="flex items-center justify-between mb-3 font-mono text-[10px] uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y - 1)}
                    disabled={pickerYear <= SITE_START_YEAR}
                    className="opacity-55 hover:opacity-100 transition-opacity disabled:opacity-20 px-1"
                  >←</button>
                  <span className="opacity-90">{pickerYear}</span>
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y + 1)}
                    disabled={pickerYear >= nowYear}
                    className="opacity-55 hover:opacity-100 transition-opacity disabled:opacity-20 px-1"
                  >→</button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {MONTHS_SHORT.map((m, idx) => {
                    const disabled = isFutureMonth(pickerYear, idx);
                    const selected = isSelectedMonth(pickerYear, idx);
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onOffsetChange((pickerYear - nowYear) * 12 + idx - nowMonth);
                          setPickerOpen(false);
                        }}
                        className="font-mono text-[10px] uppercase tracking-widest py-1 rounded transition-opacity hover:opacity-100"
                        style={{
                          opacity: disabled ? 0.2 : selected ? 1 : 0.6,
                          fontWeight: selected ? 700 : 400,
                          background: selected ? 'color-mix(in srgb, var(--text) 14%, transparent)' : 'transparent',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Quarter picker: year nav + Q1–Q4 buttons */}
            {periodType === 'quarter' && (
              <>
                <div className="flex items-center justify-between mb-3 font-mono text-[10px] uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y - 1)}
                    disabled={pickerYear <= SITE_START_YEAR}
                    className="opacity-55 hover:opacity-100 transition-opacity disabled:opacity-20 px-1"
                  >←</button>
                  <span className="opacity-90">{pickerYear}</span>
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y + 1)}
                    disabled={pickerYear >= nowYear}
                    className="opacity-55 hover:opacity-100 transition-opacity disabled:opacity-20 px-1"
                  >→</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q, idx) => {
                    const disabled = isFutureQuarter(pickerYear, idx);
                    const selected = isSelectedQuarter(pickerYear, idx);
                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onOffsetChange((pickerYear - nowYear) * 4 + idx - nowQ);
                          setPickerOpen(false);
                        }}
                        className="font-mono text-[10px] uppercase tracking-widest py-1.5 rounded transition-opacity hover:opacity-100"
                        style={{
                          opacity: disabled ? 0.2 : selected ? 1 : 0.6,
                          fontWeight: selected ? 700 : 400,
                          background: selected ? 'color-mix(in srgb, var(--text) 14%, transparent)' : 'transparent',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Year picker: vertical list from current year down to SITE_START_YEAR */}
            {periodType === 'year' && (
              <div className="flex flex-col gap-0.5">
                {Array.from(
                  { length: nowYear - SITE_START_YEAR + 1 },
                  (_, i) => nowYear - i,
                ).map((y) => {
                  const selected = isSelectedYear(y);
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => { onOffsetChange(y - nowYear); setPickerOpen(false); }}
                      className="font-mono text-[10px] uppercase tracking-widest py-1.5 px-2 rounded text-left transition-opacity hover:opacity-100"
                      style={{
                        opacity: selected ? 1 : 0.6,
                        fontWeight: selected ? 700 : 400,
                        background: selected ? 'color-mix(in srgb, var(--text) 14%, transparent)' : 'transparent',
                      }}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <GrowthCharts events={events} periodFrom={from} periodTo={to} compact />
    </div>
  );
}

// Growth-over-time sparkline cards. Sits above the 3-column event lists
// and shows the four primary metrics — visits (firstTime + returning),
// first-time, returning, and downloads — bucketed across the selected
// range. Pure client-side: re-buckets the event list we already fetched
// for the row breakdowns, so no extra API call.
function GrowthCharts({ events, range, periodFrom, periodTo, compact }: {
  events: DetailEvent[];
  range?: RangeKey;
  periodFrom?: number;
  periodTo?: number;
  compact?: boolean;
}) {
  const { bucketLabel, series } = useMemo(
    () => (periodFrom !== undefined && periodTo !== undefined)
      ? bucketEventsByPeriod(events, periodFrom, periodTo)
      : bucketEvents(events, range ?? '7d'),
    [events, range, periodFrom, periodTo],
  );

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const cards = [
    { label: 'Visits',     total: sum(series.visits),    data: series.visits,    color: VISITS_COLOR },
    { label: 'First-time', total: sum(series.firstTime), data: series.firstTime, color: CLASS_COLORS.first_time },
    { label: 'Returning',  total: sum(series.returning), data: series.returning, color: CLASS_COLORS.returning },
    { label: 'Downloads',  total: sum(series.downloads), data: series.downloads, color: CLASS_COLORS.download },
  ];

  return (
    <div className={compact ? '' : 'mb-8'}>
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-50 mb-3">
        Growth · per {bucketLabel}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
        {cards.map((c) => (
          <div key={c.label}>
            <div className="flex items-baseline gap-2 mb-1">
              <span
                aria-hidden="true"
                className="inline-block"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: c.color,
                  boxShadow: `0 0 4px ${c.color}`,
                  alignSelf: 'center',
                }}
              />
              <span className="font-mono text-[11px] uppercase tracking-widest opacity-70">{c.label}</span>
            </div>
            <div
              className="font-display"
              style={{ fontSize: '2rem', fontWeight: 350, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {c.total.toLocaleString()}
            </div>
            <div className="mt-2">
              <Sparkline data={c.data} color={c.color} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Minimal SVG sparkline. No library, no axes — just a single path showing
// the bucketed metric over time, with the final point highlighted so the
// "now" position reads at-a-glance. ScalesY by max within the data so
// each metric uses its own dynamic range (a 0-3 returning chart and a
// 0-30 first-time chart both fill the same visual envelope).
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 160;
  const height = 38;
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? i * stepX : width / 2;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y] as const;
  });
  const path = `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')}`;
  const areaPath = `${path} L ${pts[pts.length - 1][0].toFixed(1)},${height} L ${pts[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = pts[pts.length - 1];
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible', display: 'block' }}
      aria-hidden="true"
    >
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}
