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

// Maximally compact HUD — three short sections, no boxes, all key data
// visible above the fold on a phone.

export default function GlobeHUD({ totals, activity }: Props) {
  const since = totals?.sinceLaunch;
  const today = totals?.today;
  const recent = totals?.mostRecent;
  const topCountriesMax = Math.max(1, ...(totals?.topCountries.map((c) => c.n) || [0]));

  const launchDate = totals?.launchTs ? new Date(totals.launchTs * 1000) : null;
  const launchDateLabel = launchDate
    ? launchDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const recentIsStale = recent && totals ? totals.serverNow - recent.ts > 24 * 3600 : false;
  const todaySum = (today?.visits ?? 0) + (today?.downloads ?? 0);

  return (
    <div className="mt-8">
      {/* ── ONE-LINE MASTHEAD: total · class breakdown · today · countries ── */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-widest">
        <span className="opacity-55">Since {launchDateLabel || 'launch'}</span>
        <span className="font-display text-2xl md:text-3xl mx-1" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 300 }}>
          {(since?.total ?? 0).toLocaleString()}
        </span>
        <span className="opacity-65">events</span>

        <span className="opacity-30">·</span>

        <span className="inline-flex items-center gap-1.5">
          <Dot color="#5BC288" /> <Tab>{since?.firstTime ?? 0}</Tab>
          <span className="opacity-55">first</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dot color="#FF9933" /> <Tab>{since?.returning ?? 0}</Tab>
          <span className="opacity-55">return</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dot color="#C9304E" /> <Tab>{since?.downloads ?? 0}</Tab>
          <span className="opacity-55">dl</span>
        </span>

        <span className="opacity-30">·</span>

        <span className="opacity-55">today</span>
        <span className="font-display text-base" style={{ fontVariantNumeric: 'tabular-nums' }}>{todaySum}</span>

        <span className="opacity-30">·</span>

        <span className="opacity-55">{since?.countries ?? 0} countries · {since?.continents ?? 0} continents</span>
      </div>

      <Rule className="my-5" />

      {/* ── MOST RECENT — single line ────────────────────────────────── */}
      {recent && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest opacity-55">
            {recentIsStale ? 'Latest event · since launch' : 'Latest event'}
          </span>
          <span className="font-display text-base md:text-lg leading-tight" style={{ fontWeight: 400 }}>
            {[recent.city, recent.country_name].filter(Boolean).join(', ') || 'Unknown'}
          </span>
          <span className="font-mono text-[11px] opacity-55">
            · {recent.continent_name || '—'} · {timeAgoShort(totals!.serverNow - recent.ts)}
          </span>
          {recent.paper_title && (
            <span className="block w-full font-display italic text-sm opacity-75 mt-0.5">
              {truncate(recent.paper_title, 90)}
            </span>
          )}
        </div>
      )}

      {/* ── TOP COUNTRIES — single horizontal bar row, only when there's enough data ── */}
      {(totals?.topCountries || []).length > 1 && (
        <>
          <Rule className="my-5" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-[11px] uppercase tracking-widest">
            <span className="opacity-55 mr-2">Top 24h</span>
            {(totals?.topCountries || []).slice(0, 6).map((c) => (
              <span key={c.country} className="inline-flex items-center gap-2 mr-3">
                <span className="opacity-80">{c.country_name || c.country}</span>
                <span
                  className="inline-block h-[2px]"
                  style={{
                    width: `${Math.max(8, Math.round((c.n / topCountriesMax) * 36))}px`,
                    background: 'var(--color-accent, #7A1E2B)',
                  }}
                />
                <span className="opacity-55" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>
              </span>
            ))}
          </div>
        </>
      )}

      <Rule className="my-5" />

      {/* ── ACTIVITY (smaller mono line at the bottom — quietly informative) ── */}
      <div className="font-mono text-[10px] uppercase tracking-widest opacity-55">
        In current view: {activity.visits} visits ({activity.firstTime} first / {activity.returning} returning) · {activity.downloads} downloads
        {activity.papersTouched > 0 && <> · {activity.papersTouched} papers touched</>}
      </div>
    </div>
  );
}

/* ─── Tiny helpers ──────────────────────────────────────────────────── */

function Rule({ className = '' }: { className?: string }) {
  return (
    <hr
      className={`border-0 ${className}`}
      style={{
        height: '1px',
        background:
          'linear-gradient(90deg, transparent, color-mix(in srgb, var(--text) 14%, transparent) 12%, color-mix(in srgb, var(--text) 14%, transparent) 88%, transparent)',
      }}
    />
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 4px ${color}`,
        display: 'inline-block',
      }}
    />
  );
}

function Tab({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-base" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>
      {children}
    </span>
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
