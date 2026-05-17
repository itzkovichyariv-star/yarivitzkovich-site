import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ARC_COLORS } from '../lib/globePalette';

interface Totals {
  sinceLaunch: {
    total: number;
    countries: number;
    continents: number;
    firstTime?: number;
    returning?: number;
    downloads?: number;
  };
  today: { visits: number; downloads: number };
  topCountries: Array<{ country: string; country_name: string; n: number }>;
  topContinents: Array<{ continent: string; continent_name: string; n: number }>;
  topPapers: Array<{ paper_slug: string; paper_title: string | null; n: number }>;
  mostRecent: {
    ts: number;
    kind: string;
    visitor_class: string;
    paper_slug: string | null;
    paper_title: string | null;
    country: string | null;
    country_name: string | null;
    continent_name: string | null;
    city: string | null;
  } | null;
  launchTs: number | null;
  serverNow: number;
}

interface Activity {
  visits: number;
  firstTime: number;
  returning: number;
  downloads: number;
  papersTouched: number;
}

// Minimal shape used for the Today tooltip — only the fields we need to
// render a "where from" list. Matches a subset of the EventRow type used
// elsewhere in the live page.
interface HudEvent {
  ts: number;
  kind: 'visit' | 'download';
  visitor_class: string;
  city: string | null;
  country_name: string | null;
  continent_name: string | null;
}

interface Props {
  totals: Totals | null;
  activity: Activity;
  // The full filtered events list. The Today section uses this to
  // build a hover tooltip that shows the where-from breakdown. Optional
  // so callers that don't need the tooltip can omit it without breaking.
  events?: HudEvent[];
  /** Active range filter ('24h' | '7d' | '30d' | 'all') so the activity
      sub-line can label its window explicitly. Optional for backwards-
      compat with callers that don't pass it. */
  range?: '24h' | '7d' | '30d' | 'all';
}

const RANGE_LABEL_LONG: Record<string, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'all': 'Since launch',
};

// SECTION-BASED HUD — replaces the old single-line cramped ribbon. Each
// metric gets a labeled section so visitors can see at a glance what
// each number means. Sections in order:
//   1. SINCE LAUNCH       — total events + class breakdown + reach
//   2. TODAY              — events split into visits and downloads
//   3. BY COUNTRY · 24H   — top countries (neutral bars, "events" label)
//   4. BY PAPER · 24H     — top-downloaded papers (the "which papers"
//                            answer that was previously absent)
//   5. LATEST             — most-recent event with location + class
// All numbers tabular, all labels mono small-caps for editorial rhythm.

export default function GlobeHUD({ totals, activity, events, range }: Props) {
  const rangeLabel = range ? (RANGE_LABEL_LONG[range] ?? 'Current range') : 'Current range';
  // The Today section panel is opened by HOVER on desktop and by TAP
  // on touch devices. Two booleans so each input mechanism owns its
  // own state and can't get stuck (a hover-out shouldn't close a
  // tap-pinned panel and vice versa).
  const [todayHover, setTodayHover] = useState(false);
  const [todayPinned, setTodayPinned] = useState(false);
  const todaySectionRef = useRef<HTMLElement>(null);

  // Tap-outside dismissal for the pinned (touch) panel. Listens once
  // while the panel is open and removes itself when closed.
  useEffect(() => {
    if (!todayPinned) return;
    const onDocPointer = (e: PointerEvent) => {
      const node = todaySectionRef.current;
      if (node && !node.contains(e.target as Node)) setTodayPinned(false);
    };
    // Use capture so we receive the event before any inner handler can
    // stopPropagation. Pointerdown fires for both mouse and touch.
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  }, [todayPinned]);
  const since = totals?.sinceLaunch;
  const today = totals?.today;
  const recent = totals?.mostRecent;
  const topCountries = totals?.topCountries || [];
  const topPapers = totals?.topPapers || [];
  const topCountriesMax = Math.max(1, ...topCountries.map((c) => c.n));

  const launchDate = totals?.launchTs ? new Date(totals.launchTs * 1000) : null;
  const launchDateLabel = launchDate
    ? launchDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const todaySum = (today?.visits ?? 0) + (today?.downloads ?? 0);
  // The "TODAY" counts on the server are taken from UTC midnight (not
  // a rolling 24h window — that's a different cutoff used by other
  // sections). Match exactly so the breakdown sums to the badge total
  // and 0-download "today" never shows a download row.
  const todayBreakdown = useMemo(() => {
    if (!events || !totals) return [];
    const startOfTodayUtc = Math.floor(
      new Date(totals.serverNow * 1000).setUTCHours(0, 0, 0, 0) / 1000
    );
    type Row = { city: string | null; country: string | null; continent: string | null; n: number; downloads: number };
    const grouped = new Map<string, Row>();
    for (const e of events) {
      if (e.ts < startOfTodayUtc) continue;
      const city = e.city || null;
      const country = e.country_name || null;
      const key = `${country || ''}|${city || ''}`;
      let row = grouped.get(key);
      if (!row) {
        row = { city, country, continent: e.continent_name || null, n: 0, downloads: 0 };
        grouped.set(key, row);
      }
      row.n++;
      if (e.kind === 'download') row.downloads++;
    }
    return Array.from(grouped.values()).sort((a, b) => b.n - a.n);
  }, [events, totals]);

  // SINCE LAUNCH breakdowns are now fetched from /live/breakdown — an
  // all-time aggregated query against the events table — instead of
  // being computed client-side from the (range-filtered, default 7d)
  // events array. Without this, a "6 downloads since launch" headline
  // could pair with a tooltip listing only 1 city, because older
  // downloads weren't in the page's events array.
  type ClassKey = 'firstTime' | 'returning' | 'downloads';
  type BreakdownRow = { city: string | null; country: string | null; continent: string | null; n: number };
  const [launchHover, setLaunchHover] = useState<ClassKey | null>(null);
  const [launchPinned, setLaunchPinned] = useState<ClassKey | null>(null);
  const [classBreakdownData, setClassBreakdownData] = useState<Record<ClassKey, BreakdownRow[] | null>>({
    firstTime: null,
    returning: null,
    downloads: null,
  });
  const launchSectionRef = useRef<HTMLDivElement>(null);

  // Map our UI key → the API's class param. The API speaks
  // "first_time" / "returning" / "download" (singular).
  const apiClassFor: Record<ClassKey, string> = {
    firstTime: 'first_time',
    returning: 'returning',
    downloads: 'download',
  };

  // Fetch a class's breakdown the first time it's needed. Caches the
  // result so reopening the same tooltip is instant.
  const ensureBreakdownLoaded = (key: ClassKey) => {
    if (classBreakdownData[key] !== null) return;
    fetch(`/live/breakdown?class=${apiClassFor[key]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const rows: BreakdownRow[] = (data.rows || []).map((r: any) => ({
          city: r.city || null,
          country: r.country_name || r.country || null,
          continent: r.continent_name || r.continent || null,
          n: Number(r.n || 0),
        }));
        setClassBreakdownData((prev) => ({ ...prev, [key]: rows }));
      })
      .catch(() => {});
  };

  // Helper used in the JSX to read the (possibly still-loading) rows.
  const classBreakdowns = {
    firstTime: classBreakdownData.firstTime ?? [],
    returning: classBreakdownData.returning ?? [],
    downloads: classBreakdownData.downloads ?? [],
  };

  useEffect(() => {
    if (!launchPinned) return;
    const onDocPointer = (e: PointerEvent) => {
      const node = launchSectionRef.current;
      if (node && !node.contains(e.target as Node)) setLaunchPinned(null);
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  }, [launchPinned]);

  const launchActive = launchPinned || launchHover;
  const launchLabels: Record<ClassKey, string> = {
    firstTime: 'First-time visits',
    returning: 'Returning visits',
    downloads: 'Downloads',
  };

  const recentIsStale = recent && totals ? totals.serverNow - recent.ts > 24 * 3600 : false;
  const recentClass = recent
    ? recent.kind === 'download'
      ? 'Download'
      : recent.visitor_class === 'returning'
        ? 'Returning visit'
        : 'First-time visit'
    : null;
  const recentColor = recent
    ? recent.kind === 'download'
      ? ARC_COLORS.download
      : recent.visitor_class === 'returning'
        ? ARC_COLORS.returning
        : ARC_COLORS.first_time
    : null;

  return (
    <div className="mt-6 space-y-5 leading-relaxed">

      {/* 1. Since launch ─────────────────────────────────── */}
      <section>
        <SectionLabel>Since launch</SectionLabel>
        <div className="space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="font-display"
              style={{ fontSize: '2rem', fontWeight: 350, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {(since?.total ?? 0).toLocaleString()}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-soft">
              events {launchDateLabel && <>· since {launchDateLabel}</>}
            </span>
          </div>
          <div ref={launchSectionRef} className="relative">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap font-mono text-[11px] uppercase tracking-widest">
              <Pair
                color="#9DB3BE"
                n={(since?.firstTime ?? 0) + (since?.returning ?? 0)}
                label="visits"
              />
              <Pair
                color={ARC_COLORS.first_time}
                n={since?.firstTime ?? 0}
                label="first-time"
                interactive={(since?.firstTime ?? 0) > 0}
                onHover={(over) => {
                  if (over) ensureBreakdownLoaded('firstTime');
                  setLaunchHover(over ? 'firstTime' : null);
                }}
                onClick={() => {
                  ensureBreakdownLoaded('firstTime');
                  setLaunchPinned((p) => (p === 'firstTime' ? null : 'firstTime'));
                }}
                isActive={launchActive === 'firstTime'}
              />
              <Pair
                color={ARC_COLORS.returning}
                n={since?.returning ?? 0}
                label="returning"
                interactive={(since?.returning ?? 0) > 0}
                onHover={(over) => {
                  if (over) ensureBreakdownLoaded('returning');
                  setLaunchHover(over ? 'returning' : null);
                }}
                onClick={() => {
                  ensureBreakdownLoaded('returning');
                  setLaunchPinned((p) => (p === 'returning' ? null : 'returning'));
                }}
                isActive={launchActive === 'returning'}
              />
              <Pair
                color={ARC_COLORS.download}
                n={since?.downloads ?? 0}
                label="downloads"
                interactive={(since?.downloads ?? 0) > 0}
                onHover={(over) => {
                  if (over) ensureBreakdownLoaded('downloads');
                  setLaunchHover(over ? 'downloads' : null);
                }}
                onClick={() => {
                  ensureBreakdownLoaded('downloads');
                  setLaunchPinned((p) => (p === 'downloads' ? null : 'downloads'));
                }}
                isActive={launchActive === 'downloads'}
              />
            </div>

            {/* Class-breakdown panel — opens on hover/tap. Data is
                fetched from /live/breakdown for the active class so
                the row counts add up to the SINCE LAUNCH headline.
                Renders even while data is still loading; "Loading…"
                placeholder fills the gap on first open. */}
            {launchActive && (
              <div
                role="tooltip"
                className="absolute z-30 left-0 mt-2 w-full sm:max-w-sm p-4"
                style={{
                  top: '100%',
                  backdropFilter: 'blur(20px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                  background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                  color: 'var(--text)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-soft">
                    {launchLabels[launchActive]} · all time
                  </div>
                  {launchPinned && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLaunchPinned(null);
                      }}
                      className="opacity-60 hover:opacity-100 transition-opacity text-base leading-none px-2 -my-1 -mr-1"
                      aria-label="Close"
                      title="Close"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {classBreakdownData[launchActive] === null ? (
                  <div className="font-mono text-xs uppercase tracking-widest text-soft py-2">
                    Loading…
                  </div>
                ) : classBreakdowns[launchActive].length === 0 ? (
                  <div className="font-mono text-xs uppercase tracking-widest text-soft py-2">
                    No activity yet
                  </div>
                ) : (
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {classBreakdowns[launchActive].map((row, i) => (
                      <li
                        key={`${row.country ?? '—'}|${row.city ?? i}`}
                        className="flex items-baseline gap-2"
                      >
                        <span className="font-display text-sm flex-1 truncate">
                          {[row.city, row.country].filter(Boolean).join(', ') || 'Unknown location'}
                        </span>
                        {row.continent && (
                          <span className="font-mono text-[10px] uppercase tracking-widest opacity-50 whitespace-nowrap">
                            {row.continent}
                          </span>
                        )}
                        <span
                          className="font-mono text-[10px] uppercase tracking-widest whitespace-nowrap"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          <span className="opacity-90">{row.n}</span>
                          <span className="opacity-55"> {row.n === 1 ? 'event' : 'events'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-soft">
            Reached {since?.countries ?? 0} countries · {since?.continents ?? 0} continents
          </div>
        </div>
      </section>

      <Rule />

      {/* 2. Today ────────────────────────────────────────── */}
      <section
        ref={todaySectionRef}
        className="relative"
        onMouseEnter={() => setTodayHover(true)}
        onMouseLeave={() => setTodayHover(false)}
      >
        <SectionLabel>Today</SectionLabel>
        {/* Tap target — toggles `pinned` for touch devices. Mouse users
            don't need to click; the section's hover state already opens
            the panel. We use a button so it's keyboard-accessible too. */}
        <button
          type="button"
          onClick={() => {
            if (todayBreakdown.length === 0) return;
            setTodayPinned((v) => !v);
          }}
          className="font-mono text-xs uppercase tracking-widest text-left appearance-none bg-transparent border-0 p-0 m-0"
          style={{ fontVariantNumeric: 'tabular-nums', cursor: todayBreakdown.length ? 'help' : 'default', color: 'inherit' }}
          aria-describedby={todayBreakdown.length ? 'today-breakdown' : undefined}
          aria-expanded={todayBreakdown.length ? (todayHover || todayPinned) : undefined}
        >
          <span className={todayBreakdown.length ? 'opacity-90 underline decoration-dotted decoration-current/40 underline-offset-4' : 'opacity-90'}>
            {todaySum} events
          </span>
          <span className="opacity-30 mx-2">·</span>
          <span className="opacity-65">{today?.visits ?? 0} visits</span>
          <span className="opacity-30 mx-2">·</span>
          <span className="opacity-65">{today?.downloads ?? 0} downloads</span>
        </button>

        {/* Where-from panel. Renders when EITHER the section is hovered
            (desktop) OR the user has tapped to pin it (touch). Tapping
            outside closes the pinned panel via the document listener. */}
        {(todayHover || todayPinned) && todayBreakdown.length > 0 && (
          <div
            id="today-breakdown"
            role="tooltip"
            className="absolute z-30 left-0 mt-2 w-full sm:max-w-sm p-4"
            style={{
              top: '100%',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
              border: '1px solid color-mix(in srgb, var(--text) 14%, transparent)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
              color: 'var(--text)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-soft">
                Where from · today
              </div>
              {todayPinned && (
                <button
                  type="button"
                  onClick={(e) => {
                    // Stop propagation so the tap-outside doc listener doesn't
                    // also fire and re-trigger something on the underlying button.
                    e.stopPropagation();
                    setTodayPinned(false);
                  }}
                  className="opacity-60 hover:opacity-100 transition-opacity text-base leading-none px-2 -my-1 -mr-1"
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              )}
            </div>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {todayBreakdown.map((row, i) => (
                <li
                  key={`${row.country ?? '—'}|${row.city ?? i}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="font-display text-sm flex-1 truncate">
                    {[row.city, row.country].filter(Boolean).join(', ') || 'Unknown location'}
                  </span>
                  {row.continent && (
                    <span className="font-mono text-[10px] uppercase tracking-widest opacity-50 whitespace-nowrap">
                      {row.continent}
                    </span>
                  )}
                  <span
                    className="font-mono text-[10px] uppercase tracking-widest whitespace-nowrap"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    <span className="opacity-90">{row.n}</span>
                    <span className="opacity-55"> {row.n === 1 ? 'event' : 'events'}</span>
                    {row.downloads > 0 && (
                      <span className="opacity-55"> · {row.downloads} dl</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Rule />

      {/* 3. By country (last 24h) ────────────────────────── */}
      <section>
        <SectionLabel>By country · last 24h</SectionLabel>
        {topCountries.length > 0 ? (
          <ul className="space-y-2 mt-1">
            {topCountries.slice(0, 6).map((c) => (
              <li key={c.country} className="flex items-center gap-3">
                <span className="font-display text-sm flex-1 truncate">
                  {c.country_name || c.country}
                </span>
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{
                    width: `${Math.max(14, Math.round((c.n / topCountriesMax) * 96))}px`,
                    height: '3px',
                    background: 'color-mix(in srgb, var(--text) 32%, transparent)',
                  }}
                  aria-hidden="true"
                />
                <span
                  className="font-mono text-[11px] uppercase tracking-widest opacity-65 whitespace-nowrap"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {c.n} {c.n === 1 ? 'event' : 'events'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="font-mono text-xs uppercase tracking-widest text-soft">No activity yet</div>
        )}
      </section>

      <Rule />

      {/* 4. Top downloaded papers (since launch) ─────────── */}
      <section>
        <SectionLabel>Most-downloaded papers · since launch</SectionLabel>
        {topPapers.length > 0 ? (
          <ul
            className="mt-1"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
              columnGap: '0.75rem',
              rowGap: '0.5rem',
              alignItems: 'baseline',
            }}
          >
            {topPapers.slice(0, 3).map((p) => (
              <li key={p.paper_slug} style={{ display: 'contents' }}>
                <a
                  href={`/publications/${p.paper_slug}`}
                  className="font-display italic text-sm leading-snug underline decoration-transparent hover:decoration-current transition"
                  style={{ color: 'inherit' }}
                >
                  {p.paper_title || p.paper_slug.replace(/-/g, ' ')}
                </a>
                <span
                  aria-hidden="true"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: ARC_COLORS.download,
                    boxShadow: `0 0 4px ${ARC_COLORS.download}`,
                    display: 'inline-block',
                    alignSelf: 'first baseline',
                    transform: 'translateY(-0.1em)',
                  }}
                />
                <span
                  className="font-mono text-[11px] uppercase tracking-widest"
                  style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: '2.5ch' }}
                >
                  {p.n}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-widest opacity-65 whitespace-nowrap">
                  {p.n === 1 ? 'download' : 'downloads'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="font-mono text-xs uppercase tracking-widest text-soft">
            No downloads yet
          </div>
        )}
      </section>

      <Rule />

      {/* 5. Latest event ─────────────────────────────────── */}
      <section>
        <SectionLabel>{recentIsStale ? 'Latest · since launch' : 'Latest'}</SectionLabel>
        {recent ? (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                aria-hidden="true"
                className="inline-block rounded-full self-center"
                style={{
                  width: '8px',
                  height: '8px',
                  background: recentColor || 'currentColor',
                  boxShadow: `0 0 6px ${recentColor || 'currentColor'}`,
                }}
              />
              <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: recentColor || undefined }}>
                {recentClass}
              </span>
              <span className="font-display text-sm">
                {[recent.city, recent.country_name].filter(Boolean).join(', ') || 'Unknown'}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest opacity-55">
                · {recent.continent_name || '—'} · {timeAgoShort(totals!.serverNow - recent.ts)}
              </span>
            </div>
            {/* Paper citation only renders under DOWNLOAD events. A visit
                — even one synthesized from a PDF deep-link — is just an
                entry; the paper context belongs to the download. */}
            {recent.kind === 'download' && recent.paper_title && (
              <a
                href={recent.paper_slug ? `/publications/${recent.paper_slug}` : undefined}
                className="block font-display italic text-[12px] opacity-75 leading-snug underline decoration-transparent hover:decoration-current transition"
                style={{ color: 'inherit' }}
              >
                {truncate(recent.paper_title, 90)}
              </a>
            )}
          </div>
        ) : (
          <div className="font-mono text-xs uppercase tracking-widest text-soft">Awaiting first event…</div>
        )}
      </section>

      {/* Sub-line: counts within the currently selected Range filter at
          the top of the page (24h / 7d / 30d / all). Labels the range
          explicitly so visitors don't have to infer which window the
          numbers come from. */}
      {(activity.visits > 0 || activity.downloads > 0) && (
        <div className="font-mono text-[10px] uppercase tracking-widest opacity-65 pt-1">
          {rangeLabel}: {activity.visits} visits ({activity.firstTime} first / {activity.returning} returning) · {activity.downloads} downloads
          {activity.papersTouched > 0 && <> · {activity.papersTouched} papers touched</>}
        </div>
      )}
    </div>
  );
}

/* ─── Tiny inline helpers ─────────────────────────────────────────── */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-soft mb-2">
      {children}
    </h3>
  );
}

function Rule() {
  return (
    <hr
      className="border-0"
      style={{
        height: '1px',
        background: 'color-mix(in srgb, var(--text) 12%, transparent)',
      }}
    />
  );
}

function Pair({
  color,
  n,
  label,
  interactive,
  onHover,
  onClick,
  isActive,
}: {
  color: string;
  n: number;
  label: string;
  interactive?: boolean;
  onHover?: (over: boolean) => void;
  onClick?: () => void;
  isActive?: boolean;
}) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 5px ${color}`,
          display: 'inline-block',
        }}
      />
      <span style={{ fontVariantNumeric: 'tabular-nums' }} className="opacity-90">{n}</span>
      <span className={interactive ? 'opacity-65 underline decoration-dotted decoration-current/40 underline-offset-4' : 'opacity-65'}>
        {label}
      </span>
    </>
  );

  if (!interactive) {
    return <span className="inline-flex items-center gap-1.5">{inner}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className="inline-flex items-center gap-1.5 appearance-none bg-transparent border-0 p-0 m-0 font-mono uppercase tracking-widest"
      style={{ cursor: 'help', color: 'inherit', font: 'inherit' }}
      aria-expanded={!!isActive}
      aria-label={`${n} ${label} — show breakdown`}
    >
      {inner}
    </button>
  );
}

function timeAgoShort(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  // After 24h, switch to a real date — relative ("5 d ago") carries
  // less information than "5 May" once you're past a day.
  const date = new Date((Date.now() / 1000 - s) * 1000);
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
