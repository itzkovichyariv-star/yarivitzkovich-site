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

// Editorial-typography HUD — no boxed panels, just typography, whitespace,
// and thin horizontal rules. Reads like a magazine sidebar rather than a
// dashboard grid.

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
    ? launchDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const recentIsStale = recent && totals ? totals.serverNow - recent.ts > 24 * 3600 : false;

  return (
    <div className="mt-12 space-y-10">
      {/* ── Headline strip: Since launch is the lede ───────────────────── */}
      <section>
        <Kicker>Since launch{launchDateLabel ? ` · ${launchDateLabel}` : ''}</Kicker>
        <div className="grid grid-cols-12 gap-x-6 gap-y-3 mt-3 items-baseline">
          <div className="col-span-12 md:col-span-4">
            <BigSerif>{(since?.total ?? 0).toLocaleString()}</BigSerif>
            <SubLine>events · {since?.countries ?? 0} countries · {since?.continents ?? 0} continents</SubLine>
          </div>
          <div className="col-span-12 md:col-span-8">
            {(since?.firstTime !== undefined || since?.returning !== undefined || since?.downloads !== undefined) && (
              <div className="space-y-2 font-mono text-xs uppercase tracking-widest">
                <ClassRow color="#5BC288" n={since?.firstTime ?? 0} label="first-time visits" />
                <ClassRow color="#FF9933" n={since?.returning ?? 0} label="returning visits" />
                <ClassRow color="#C9304E" n={since?.downloads ?? 0} label="downloads" />
              </div>
            )}
          </div>
        </div>
      </section>

      <Rule />

      {/* ── Today + Most recent, side-by-side as headlines ─────────────── */}
      <section className="grid grid-cols-12 gap-x-6 gap-y-8">
        <div className="col-span-12 md:col-span-5">
          <Kicker>Today</Kicker>
          <BigSerif>{(today?.visits ?? 0) + (today?.downloads ?? 0)}</BigSerif>
          <SubLine>{today?.visits ?? 0} visits · {today?.downloads ?? 0} downloads</SubLine>
        </div>
        <div className="col-span-12 md:col-span-7">
          <Kicker>{recentIsStale ? 'Most recent (since launch)' : 'Most recent'}</Kicker>
          {recent ? (
            <>
              <div className="font-display text-2xl md:text-3xl mt-2 leading-tight" style={{ fontWeight: 300 }}>
                {[recent.city, recent.country_name].filter(Boolean).join(', ') || 'Unknown'}
              </div>
              <SubLine>
                {recent.continent_name || '—'} · {timeAgoShort(totals!.serverNow - recent.ts)}
              </SubLine>
              {recent.paper_title && (
                <p className="font-display italic text-sm mt-2 opacity-80">
                  {truncate(recent.paper_title, 80)}
                </p>
              )}
            </>
          ) : (
            <SubLine>Awaiting first event…</SubLine>
          )}
        </div>
      </section>

      <Rule />

      {/* ── Activity in current view ───────────────────────────────────── */}
      <section>
        <Kicker>Activity in current view</Kicker>
        <div className="grid grid-cols-12 gap-x-6 mt-3 font-mono text-sm">
          <div className="col-span-6 md:col-span-3">
            <span className="opacity-60">visits</span>{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activity.visits}</span>
          </div>
          <div className="col-span-6 md:col-span-3">
            <span className="opacity-60">first-time</span>{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activity.firstTime}</span>
          </div>
          <div className="col-span-6 md:col-span-3">
            <span className="opacity-60">returning</span>{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activity.returning}</span>
          </div>
          <div className="col-span-6 md:col-span-3">
            <span className="opacity-60">downloads</span>{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activity.downloads}</span>
          </div>
        </div>
      </section>

      {!isSparse && (
        <>
          <Rule />

          {/* ── Top continents + countries (24h) ──────────────────────── */}
          <section className="grid grid-cols-12 gap-x-6 gap-y-8">
            <div className="col-span-12 md:col-span-5">
              <Kicker>Top continents · last 24h</Kicker>
              <div className="mt-3 space-y-2">
                {(totals?.topContinents || []).length === 0 && (
                  <SubLine>No data yet.</SubLine>
                )}
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
            <div className="col-span-12 md:col-span-7">
              <Kicker>Top countries · last 24h</Kicker>
              <div className="mt-3 space-y-2">
                {(totals?.topCountries || []).length === 0 && (
                  <SubLine>No data yet.</SubLine>
                )}
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
          </section>
        </>
      )}
    </div>
  );
}

function Rule() {
  // Editorial section break — single hairline at very low opacity, generous
  // vertical rhythm via the parent's space-y-10.
  return (
    <hr
      className="border-0"
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

function BigSerif({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-display mt-1 leading-none"
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 300,
        fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
      }}
    >
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

function ClassRow({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <div className="grid grid-cols-[16px_3rem_1fr] items-center gap-2">
      <span
        aria-hidden="true"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 5px ${color}`,
          justifySelf: 'center',
        }}
      />
      <span style={{ fontVariantNumeric: 'tabular-nums' }} className="font-display text-base" data-class-count="">
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
