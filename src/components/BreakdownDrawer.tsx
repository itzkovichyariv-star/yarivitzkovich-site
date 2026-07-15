import { useEffect, useMemo, useRef, useState } from 'react';
import { ARC_COLORS } from '../lib/globePalette';
import { resolvePaperTitle } from '../lib/paperTitle';
import PeriodNavigator from './PeriodNavigator';
// Aliased: this file already has a LOCAL getPeriodBounds (day/week/month/…)
// used by Compare mode. The shared one (month/year/all) drives the new
// single-period navigator in the main view.
import { getPeriodBounds as periodBounds, isCurrentPeriod, DEFAULT_PERIOD, type PeriodValue } from '../lib/period';

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

interface Props {
  open: boolean;
  onClose: () => void;
  mode?: 'modal' | 'inline';
}

type RangeKey = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

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
  const axisLabels = Array.from({ length: buckets }, (_, i) => {
    const d = new Date((fromSec + i * sizeSec + sizeSec / 2) * 1000);
    if (label === 'hour')                         return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (label === 'day' || label === 'week')      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  });
  return { bucketLabel: label, axisLabels, series: { visits, firstTime, returning, downloads } };
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

  const axisLabels = Array.from({ length: buckets }, (_, i) => {
    const d = new Date((startSec + i * sizeSec + sizeSec / 2) * 1000);
    if (label === 'hour') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (label === 'day')  return range === '7d'
      ? d.toLocaleDateString(undefined, { weekday: 'short' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (label === 'week') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  });
  return { buckets, bucketLabel: label, axisLabels, series: { visits, firstTime, returning, downloads } };
}

// Same colors as the legend in LiveGlobe — keeps the drawer visually
// tied to the arcs on the globe. (Single source of truth in globePalette.)
const CLASS_COLORS = ARC_COLORS;

export default function BreakdownDrawer({ open, onClose, mode = 'modal' }: Props) {
  // Inline mode: the component always behaves as if it's open — there's
  // no close action, since the page itself is the container.
  const isInline = mode === 'inline';
  const isOpen = isInline ? true : open;
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD); // default: All time
  const mainPeriodBounds = useMemo(() => periodBounds(period), [period.type, period.offset]);
  const [events, setEvents] = useState<DetailEvent[]>([]);
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
        const { from, to } = periodBounds(period);
        url = (from == null || to == null)
          ? `/live/details?range=all`
          : `/live/details?from=${from}&to=${to}`;
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
    // Only poll a LIVE window — a past month/year never changes, so refreshing
    // it every 30s is pure waste (and would re-fetch on every tab focus).
    const live = compareMode || isCurrentPeriod(period);
    const id = live
      ? window.setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          load(false);
        }, 30_000)
      : undefined;

    return () => { cancelled = true; if (id) window.clearInterval(id); };
  }, [isOpen, period.type, period.offset, compareMode, periodTypeA, offsetA]);

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
              <PeriodNavigator value={period} onChange={setPeriod} labelPrefix="View" />
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
          <>
            {mainPeriodBounds.from == null || mainPeriodBounds.to == null
              ? <GrowthCharts events={events} range="all" />
              : <GrowthCharts events={events} periodFrom={mainPeriodBounds.from} periodTo={mainPeriodBounds.to} />}
            <BreakdownMatrix events={events} />
          </>
        )}

    </>
  );

  return <Wrapper>{panelInner}</Wrapper>;
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

function GrowthCharts({ events, range, periodFrom, periodTo, compact }: {
  events: DetailEvent[];
  range?: RangeKey;
  periodFrom?: number;
  periodTo?: number;
  compact?: boolean;
}) {
  const { bucketLabel, axisLabels, series } = useMemo(
    () => (periodFrom !== undefined && periodTo !== undefined)
      ? bucketEventsByPeriod(events, periodFrom, periodTo)
      : bucketEvents(events, range ?? '7d'),
    [events, range, periodFrom, periodTo],
  );

  const nBuckets = series.visits.length;
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, nBuckets - 1));

  // Keep the cursor in bounds when the bucket count changes (range switch).
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, nBuckets - 1));
  }, [nBuckets]);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const cumSum = (arr: number[]) => {
    let r = 0;
    return arr.map((v) => (r += v));
  };
  const cards = [
    { label: 'Visits',     total: sum(series.visits),    data: series.visits,    cum: cumSum(series.visits),    color: VISITS_COLOR },
    { label: 'First-time', total: sum(series.firstTime), data: series.firstTime, cum: cumSum(series.firstTime), color: CLASS_COLORS.first_time },
    { label: 'Returning',  total: sum(series.returning), data: series.returning, cum: cumSum(series.returning), color: CLASS_COLORS.returning },
    { label: 'Downloads',  total: sum(series.downloads), data: series.downloads, cum: cumSum(series.downloads), color: CLASS_COLORS.download },
  ];

  return (
    <div className={compact ? 'mb-4' : 'mb-8'}>
      {/* Scrubber sits above the charts — it's the shared time context */}
      <div className="flex items-center gap-3 mb-4 font-mono text-[11px] uppercase tracking-widest">
        <button
          type="button"
          onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
          disabled={activeIdx <= 0}
          className="hover:opacity-100 transition-opacity disabled:opacity-20 px-2 py-1 rounded"
          style={{ opacity: 0.65, border: '1px solid color-mix(in srgb, var(--text) 18%, transparent)' }}
          aria-label="Earlier bucket"
        >←</button>
        <span className="flex-1 text-center opacity-75">{axisLabels[activeIdx] ?? ''}</span>
        <button
          type="button"
          onClick={() => setActiveIdx((i) => Math.min(nBuckets - 1, i + 1))}
          disabled={activeIdx >= nBuckets - 1}
          className="hover:opacity-100 transition-opacity disabled:opacity-20 px-2 py-1 rounded"
          style={{ opacity: 0.65, border: '1px solid color-mix(in srgb, var(--text) 18%, transparent)' }}
          aria-label="Later bucket"
        >→</button>
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
            {/* Big number = cumulative up to this bucket within the period */}
            <div
              className="font-display"
              style={{ fontSize: '2rem', fontWeight: 350, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {(c.cum[activeIdx] ?? 0).toLocaleString()}
            </div>
            <div className="font-mono text-[10px] opacity-35 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {c.total.toLocaleString()} total
            </div>
            <div className="mt-2">
              <Sparkline data={c.data} color={c.color} activeIdx={activeIdx} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Unified geographic / paper breakdown matrix ───────────────────────────
// Replaces the older single-purpose "Downloads · by paper" and "Visits · by
// city" sections. A dimension switcher (City / Country / Paper) reslices FOUR
// metric columns — Visits, First-time, Returning, Downloads — so every
// metric × dimension combination is one tap away without a wall of tables.
//   • Visits      = all non-download events (first-time + returning)
//   • First-time  = visits from new visitors
//   • Returning   = visits from repeat visitors
//   • Downloads   = PDF downloads
// "By paper" only counts events carrying a paper_slug (publication-page visits
// + all downloads); home/about visits simply don't appear under that dimension.

type Dimension = 'city' | 'country' | 'paper';

const DIMENSIONS: Array<{ key: Dimension; label: string }> = [
  { key: 'city',    label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'paper',   label: 'Paper' },
];

type MetricKey = 'visits' | 'first_time' | 'returning' | 'downloads';

const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: 'visits',     label: 'Visits',     color: VISITS_COLOR },
  { key: 'first_time', label: 'First-time', color: CLASS_COLORS.first_time },
  { key: 'returning',  label: 'Returning',  color: CLASS_COLORS.returning },
  { key: 'downloads',  label: 'Downloads',  color: CLASS_COLORS.download },
];

function eventMatchesMetric(e: DetailEvent, m: MetricKey): boolean {
  if (m === 'downloads') return e.kind === 'download';
  if (e.kind === 'download') return false;    // the other three metrics are visits only
  if (m === 'visits') return true;            // all non-download events
  if (m === 'returning') return e.visitor_class === 'returning';
  return e.visitor_class !== 'returning';     // first_time
}

interface BreakRow { key: string; label: string; sublabel?: string; slug?: string; n: number; }

// Map one event to its bucket key + display label for the active dimension.
// Returns null when the event can't be placed in this dimension (e.g. a visit
// with no paper_slug under the "paper" dimension).
function bucketForDimension(e: DetailEvent, dim: Dimension): Omit<BreakRow, 'n'> | null {
  if (dim === 'paper') {
    if (!e.paper_slug) return null;
    return {
      key: e.paper_slug,
      label: resolvePaperTitle(e.paper_slug, e.paper_title) || e.paper_slug,
      slug: e.paper_slug,
    };
  }
  if (dim === 'country') {
    const c = e.country_name || e.continent_name || 'Unknown';
    return { key: c, label: c };
  }
  // city — group by city, keep country as the gray secondary label
  const city = e.city || null;
  const country = e.country_name || e.continent_name || null;
  const key = `${city ?? ''}|${country ?? ''}`;
  if (!city) return { key, label: country || 'Unknown' };
  return { key, label: city, sublabel: country || undefined };
}

const BREAKDOWN_TOP_N = 25;

function BreakdownMatrix({ events }: { events: DetailEvent[] }) {
  const [dimension, setDimension] = useState<Dimension>('city');

  const columns = useMemo(
    () =>
      METRICS.map((metric) => {
        const map = new Map<string, BreakRow>();
        for (const e of events) {
          if (e.is_bot) continue;
          if (!eventMatchesMetric(e, metric.key)) continue;
          const bucket = bucketForDimension(e, dimension);
          if (!bucket) continue;
          const cur = map.get(bucket.key);
          if (cur) cur.n += 1;
          else map.set(bucket.key, { ...bucket, n: 1 });
        }
        const rows = Array.from(map.values()).sort((a, b) => b.n - a.n);
        return { metric, rows, total: rows.reduce((s, r) => s + r.n, 0) };
      }),
    [events, dimension],
  );

  const anyData = columns.some((c) => c.total > 0);

  return (
    <div
      className="mt-8 pt-6"
      style={{ borderTop: '1px solid color-mix(in srgb, var(--text) 10%, transparent)' }}
    >
      {/* Dimension switcher — mirrors the Range tab row at the top of the drawer */}
      <div className="flex items-center gap-4 flex-wrap font-mono text-[10px] uppercase tracking-widest mb-6">
        <span className="opacity-35" style={{ userSelect: 'none' }}>Breakdown ·</span>
        {DIMENSIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDimension(key)}
            className="hover:opacity-100 transition-opacity"
            style={{
              opacity: dimension === key ? 1 : 0.5,
              borderBottom: dimension === key ? '1px solid currentColor' : '1px solid transparent',
              paddingBottom: '2px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {!anyData ? (
        <div className="font-mono text-xs opacity-40">No activity in this range.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
          {columns.map(({ metric, rows, total }) => (
            <div key={metric.key}>
              {/* Column header: metric dot + label + muted subtotal */}
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <span
                  className="font-mono text-[11px] uppercase tracking-widest inline-flex items-center gap-2"
                  style={{ color: metric.color }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block"
                    style={{ width: '8px', height: '8px', borderRadius: '50%', background: metric.color, boxShadow: `0 0 4px ${metric.color}` }}
                  />
                  {metric.label}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-widest opacity-40 whitespace-nowrap"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {total} total
                </span>
              </div>

              {rows.length === 0 ? (
                <div className="font-mono text-[11px] opacity-30">—</div>
              ) : (
                <div className="space-y-1.5">
                  {rows.slice(0, BREAKDOWN_TOP_N).map((r, i) => (
                    <div key={`${r.key}|${i}`} className="flex items-baseline justify-between gap-3">
                      {dimension === 'paper' && r.slug ? (
                        <a
                          href={`/publications/${r.slug}`}
                          className="font-display text-sm leading-snug min-w-0"
                          style={{
                            color: 'var(--text)',
                            textDecoration: 'underline',
                            textDecorationColor: 'transparent',
                            textUnderlineOffset: '3px',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = 'currentColor')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = 'transparent')}
                        >
                          {r.label}
                        </a>
                      ) : (
                        <span className="font-mono text-xs uppercase tracking-widest leading-snug min-w-0">
                          <span style={{ color: 'var(--text)' }}>{r.label}</span>
                          {r.sublabel && <span style={{ opacity: 0.45 }}>, {r.sublabel}</span>}
                        </span>
                      )}
                      <span
                        className="font-mono text-xs whitespace-nowrap shrink-0"
                        style={{ color: metric.color, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {r.n}
                      </span>
                    </div>
                  ))}
                  {rows.length > BREAKDOWN_TOP_N && (
                    <div className="font-mono text-[10px] opacity-30 pt-0.5">
                      +{rows.length - BREAKDOWN_TOP_N} more
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, color, activeIdx }: { data: number[]; color: string; activeIdx: number }) {
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
  const clampedIdx = Math.min(Math.max(0, activeIdx), pts.length - 1);
  const [ax, ay] = pts[clampedIdx];
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
      <line
        x1={ax.toFixed(1)} y1="0"
        x2={ax.toFixed(1)} y2={height}
        stroke={color} strokeWidth={1} strokeDasharray="2,3" opacity={0.4}
      />
      <circle cx={ax.toFixed(1)} cy={ay.toFixed(1)} r={3} fill={color} />
    </svg>
  );
}
