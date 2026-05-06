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

const panelStyle: CSSProperties = {
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  background: 'color-mix(in srgb, var(--bg) 55%, transparent)',
  border: '1px solid var(--divider)',
  padding: '1rem 1.125rem',
};

export default function GlobeHUD({ totals, activity }: Props) {
  const since = totals?.sinceLaunch;
  const today = totals?.today;
  const recent = totals?.mostRecent;
  const topCountriesMax = Math.max(1, ...(totals?.topCountries.map((c) => c.n) || [0]));
  const topContinentsMax = Math.max(1, ...(totals?.topContinents.map((c) => c.n) || [0]));

  // Below this volume the page is in "sparse state" — hide top-X panels,
  // soften framing so an empty page reads as honest rather than broken.
  const SPARSE_THRESHOLD = 25;
  const isSparse = (since?.total ?? 0) < SPARSE_THRESHOLD;
  const launchDate = totals?.launchTs ? new Date(totals.launchTs * 1000) : null;
  const launchDateLabel = launchDate
    ? launchDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const recentIsStale = recent && totals ? totals.serverNow - recent.ts > 24 * 3600 : false;

  return (
    <div className="mt-10 space-y-6">
      {/* Sparse-state caption — visible only when total event count is small */}
      {isSparse && launchDateLabel && (
        <div className="font-mono text-[11px] uppercase tracking-widest text-soft text-center">
          Tracking started {launchDateLabel} · {since?.total ?? 0} {since?.total === 1 ? 'event' : 'events'} so far
        </div>
      )}

      {/* Top trio: Since launch · Today · Most recent */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div style={panelStyle}>
          <Kicker>Since launch</Kicker>
          <BigNumber n={since?.total ?? 0} />
          <SubLine>
            {(since?.countries ?? 0)} countries · {(since?.continents ?? 0)} continents
          </SubLine>
          {/* Class breakdown — visible only when totals endpoint provides
              the new fields. Renders as one mono line with the same colour
              dots used on the globe arcs (green / orange / wine). */}
          {(since?.firstTime !== undefined || since?.returning !== undefined || since?.downloads !== undefined) && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-widest opacity-75 leading-relaxed">
              <ClassDot color="#5BC288" /> {since?.firstTime ?? 0} first-time
              <span className="opacity-50"> · </span>
              <ClassDot color="#FF9933" /> {since?.returning ?? 0} returning
              <span className="opacity-50"> · </span>
              <ClassDot color="#C9304E" /> {since?.downloads ?? 0} downloads
            </div>
          )}
        </div>

        <div style={panelStyle}>
          <Kicker>Today</Kicker>
          <BigNumber n={(today?.visits ?? 0) + (today?.downloads ?? 0)} />
          <SubLine>
            {today?.visits ?? 0} visits · {today?.downloads ?? 0} downloads
          </SubLine>
        </div>

        <div style={panelStyle}>
          <Kicker>{recentIsStale ? 'Most recent (since launch)' : 'Most recent'}</Kicker>
          {recent ? (
            <>
              <div className="font-display text-2xl leading-tight mt-2">
                {[recent.city, recent.country_name].filter(Boolean).join(', ') || 'Unknown'}
              </div>
              <SubLine>
                {recent.continent_name || '—'} · {timeAgoShort(totals!.serverNow - recent.ts)}
              </SubLine>
              {recent.paper_title && (
                <SubLine>
                  <span className="opacity-80">{truncate(recent.paper_title, 56)}</span>
                </SubLine>
              )}
            </>
          ) : (
            <SubLine>Awaiting first event…</SubLine>
          )}
        </div>
      </div>

      {/* Activity (current event-window) */}
      <div style={panelStyle}>
        <Kicker>Activity (current view)</Kicker>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="font-mono text-sm">
            <span className="opacity-60 mr-2">◉</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activity.visits}</span>
            <span className="opacity-60 ml-2">visits</span>
            <span className="opacity-50 ml-3 text-xs">
              ({activity.firstTime} first-time, {activity.returning} returning)
            </span>
          </div>
          <div className="font-mono text-sm">
            <span className="opacity-60 mr-2">★</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{activity.downloads}</span>
            <span className="opacity-60 ml-2">downloads</span>
            {activity.papersTouched > 0 && (
              <span className="opacity-50 ml-3 text-xs">across {activity.papersTouched} papers</span>
            )}
          </div>
        </div>
      </div>

      {/* Top continents + Top countries — hidden in sparse state, where a
          single bar at 100% reads as broken rather than informative */}
      {!isSparse && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div style={panelStyle}>
          <Kicker>Top continents (24h)</Kicker>
          <div className="mt-3 space-y-2">
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
        <div style={panelStyle}>
          <Kicker>Top countries (24h)</Kicker>
          <div className="mt-3 space-y-2">
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
      )}
    </div>
  );
}

function ClassDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block align-middle mr-1"
      style={{
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 4px ${color}`,
      }}
      aria-hidden="true"
    />
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">
      {children}
    </div>
  );
}

function BigNumber({ n }: { n: number }) {
  return (
    <div className="font-display text-3xl mt-1.5 leading-tight" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 300 }}>
      {n.toLocaleString()}
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

function BarRow({ label, n, max }: { label: string; n: number; max: number }) {
  const pct = Math.max(2, Math.round((n / max) * 100));
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 font-mono text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate uppercase tracking-widest opacity-80">{label}</span>
        <span
          className="flex-1 h-[3px]"
          style={{
            background: `linear-gradient(to right, var(--color-accent, #7A1E2B) ${pct}%, var(--divider, rgba(0,0,0,0.15)) ${pct}%)`,
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
