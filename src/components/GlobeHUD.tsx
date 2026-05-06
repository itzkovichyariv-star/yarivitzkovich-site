import type { CSSProperties } from 'react';

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

// Dense editorial layout — masthead-style summary line, then a tight
// 2-column grid for class breakdown + most recent, then top
// countries/continents inline. No boxed cards. Information per pixel.

export default function GlobeHUD({ totals, activity }: Props) {
  const since = totals?.sinceLaunch;
  const today = totals?.today;
  const recent = totals?.mostRecent;
  const topCountriesMax = Math.max(1, ...(totals?.topCountries.map((c) => c.n) || [0]));
  const topContinentsMax = Math.max(1, ...(totals?.topContinents.map((c) => c.n) || [0]));

  const SPARSE_THRESHOLD = 25;
  const isSparse = (since?.total ?? 0) < SPARSE_THRESHOLD;
  const launchDate = totals?.launchTs ? new Date(totals.launchTs * 1000) : null;
  const launchDateLabel = launchDate
    ? launchDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const recentIsStale = recent && totals ? totals.serverNow - recent.ts > 24 * 3600 : false;

  return (
    <div className="mt-10">
      {/* ── Masthead: huge serif lede + dot-class ledger inline ───────── */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <Kicker>Since {launchDateLabel || 'launch'}</Kicker>
          <div
            className="font-display leading-none mt-0.5"
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 300,
              fontSize: 'clamp(3rem, 8vw, 5rem)',
            }}
          >
            {(since?.total ?? 0).toLocaleString()}
          </div>
        </div>

        <div className="flex flex-col gap-y-1.5 font-mono text-xs uppercase tracking-widest">
          <ClassRow color="#5BC288" n={since?.firstTime ?? 0} label="first-time" />
          <ClassRow color="#FF9933" n={since?.returning ?? 0} label="returning" />
          <ClassRow color="#C9304E" n={since?.downloads ?? 0} label="downloads" />
        </div>

        <div className="ml-auto font-mono text-[11px] uppercase tracking-widest opacity-60 text-right">
          <div>{since?.countries ?? 0} countries</div>
          <div>{since?.continents ?? 0} continents</div>
          <div className="opacity-65">
            today · {(today?.visits ?? 0)} v · {(today?.downloads ?? 0)} d
          </div>
        </div>
      </div>

      {/* ── Hairline divider — gradient-faded edges so it doesn't read as a box ── */}
      <Rule className="my-7" />

      {/* ── Most recent + activity (current view) — flows inline ────── */}
      <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
        <div className="min-w-0 flex-1">
          <Kicker>{recentIsStale ? 'Most recent · since launch' : 'Most recent'}</Kicker>
          {recent ? (
            <>
              <div
                className="font-display mt-1 leading-tight"
                style={{ fontWeight: 300, fontSize: 'clamp(1.25rem, 3vw, 1.75rem)' }}
              >
                {[recent.city, recent.country_name].filter(Boolean).join(', ') || 'Unknown'}
                <span className="opacity-50 font-mono text-xs ml-2 align-middle">
                  · {recent.continent_name || '—'} · {timeAgoShort(totals!.serverNow - recent.ts)}
                </span>
              </div>
              {recent.paper_title && (
                <p className="font-display italic text-sm opacity-75 mt-1">
                  {truncate(recent.paper_title, 90)}
                </p>
              )}
            </>
          ) : (
            <SubLine>Awaiting first event…</SubLine>
          )}
        </div>

        <div className="font-mono text-xs uppercase tracking-widest opacity-65 text-right whitespace-nowrap">
          <Kicker>In current view</Kicker>
          <div className="mt-1">
            <Tab>{activity.visits}</Tab> v
            <span className="mx-1 opacity-30">·</span>
            <Tab>{activity.downloads}</Tab> d
            {activity.papersTouched > 0 && (
              <span className="opacity-50 ml-2">· {activity.papersTouched} papers</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Bars (top continents | top countries) — only when there's enough data ── */}
      {!isSparse && (
        <>
          <Rule className="my-7" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-x-10 gap-y-6">
            <div className="md:col-span-5">
              <Kicker>Top continents · 24h</Kicker>
              <div className="mt-2 space-y-1.5">
                {(totals?.topContinents || []).length === 0 && <SubLine>No data yet.</SubLine>}
                {(totals?.topContinents || []).map((c) => (
                  <BarRow
                    key={c.continent}
                    label={c.continent_name || c.continent}
                    n={c.n}
                    max={topContinentsMax}
                  />
                ))}
              </div>
            </div>
            <div className="md:col-span-7">
              <Kicker>Top countries · 24h</Kicker>
              <div className="mt-2 space-y-1.5">
                {(totals?.topCountries || []).length === 0 && <SubLine>No data yet.</SubLine>}
                {(totals?.topCountries || []).map((c) => (
                  <BarRow
                    key={c.country}
                    label={c.country_name || c.country}
                    n={c.n}
                    max={topCountriesMax}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function Rule({ className = '' }: { className?: string }) {
  return (
    <hr
      className={`border-0 ${className}`}
      style={{
        height: '1px',
        background:
          'linear-gradient(90deg, transparent, color-mix(in srgb, var(--text) 18%, transparent) 12%, color-mix(in srgb, var(--text) 18%, transparent) 88%, transparent)',
      }}
    />
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-widest opacity-55">
      {children}
    </div>
  );
}

function SubLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-widest opacity-65 mt-1">
      {children}
    </div>
  );
}

function Tab({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-base mr-0.5" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>
      {children}
    </span>
  );
}

function ClassRow({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden="true"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 5px ${color}`,
          flexShrink: 0,
        }}
      />
      <span
        className="font-display text-base"
        style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 400, minWidth: '2.5ch' }}
      >
        {n}
      </span>
      <span className="opacity-65">{label}</span>
    </div>
  );
}

function BarRow({ label, n, max }: { label: string; n: number; max: number }) {
  const pct = Math.max(2, Math.round((n / max) * 100));
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 font-mono text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate uppercase tracking-widest opacity-80">{label}</span>
        <span
          className="flex-1 h-[2px]"
          style={{
            background: `linear-gradient(to right, var(--color-accent, #7A1E2B) ${pct}%, color-mix(in srgb, var(--text) 12%, transparent) ${pct}%)`,
          }}
        />
      </div>
      <span className="opacity-80" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {n}
      </span>
    </div>
  );
}

function timeAgoShort(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
