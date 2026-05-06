import type { ReactNode } from 'react';
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

interface Props {
  totals: Totals | null;
  activity: Activity;
}

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

export default function GlobeHUD({ totals, activity }: Props) {
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
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap font-mono text-[11px] uppercase tracking-widest">
            <Pair color={ARC_COLORS.first_time} n={since?.firstTime ?? 0} label="first-time" />
            <Pair color={ARC_COLORS.returning}  n={since?.returning  ?? 0} label="returning" />
            <Pair color={ARC_COLORS.download}   n={since?.downloads  ?? 0} label="downloads" />
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-soft">
            Reached {since?.countries ?? 0} countries · {since?.continents ?? 0} continents
          </div>
        </div>
      </section>

      <Rule />

      {/* 2. Today ────────────────────────────────────────── */}
      <section>
        <SectionLabel>Today</SectionLabel>
        <div className="font-mono text-xs uppercase tracking-widest" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <span className="opacity-90">{todaySum} events</span>
          <span className="opacity-30 mx-2">·</span>
          <span className="opacity-65">{today?.visits ?? 0} visits</span>
          <span className="opacity-30 mx-2">·</span>
          <span className="opacity-65">{today?.downloads ?? 0} downloads</span>
        </div>
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

      {/* 4. Top downloaded papers (last 24h) ─────────────── */}
      <section>
        <SectionLabel>Most-downloaded papers · last 24h</SectionLabel>
        {topPapers.length > 0 ? (
          <ul className="space-y-2 mt-1">
            {topPapers.slice(0, 5).map((p) => (
              <li key={p.paper_slug} className="flex items-baseline gap-3">
                <a
                  href={`/publications/${p.paper_slug}`}
                  className="font-display italic text-sm leading-snug flex-1 underline decoration-transparent hover:decoration-current transition"
                  style={{ color: 'inherit' }}
                >
                  {p.paper_title || p.paper_slug.replace(/-/g, ' ')}
                </a>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: ARC_COLORS.download,
                      boxShadow: `0 0 4px ${ARC_COLORS.download}`,
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.n}</span>
                  <span className="opacity-65">{p.n === 1 ? 'download' : 'downloads'}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="font-mono text-xs uppercase tracking-widest text-soft">
            No downloads in the last 24h
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

      {/* Sub-line: what's currently in view (filtered) ───── */}
      {(activity.visits > 0 || activity.downloads > 0) && (
        <div className="font-mono text-[10px] uppercase tracking-widest opacity-65 pt-1">
          Currently filtering: {activity.visits} visits ({activity.firstTime} first / {activity.returning} returning) · {activity.downloads} downloads
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

function Pair({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
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
      <span className="opacity-65">{label}</span>
    </span>
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
