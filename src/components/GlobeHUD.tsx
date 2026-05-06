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

// ULTRA-COMPACT HUD — three single-line sections in mono. Aggressively
// flat: no big serif numbers, no side-by-side columns that wrap on phones.
// Total vertical footprint ≈ 8 lines including dividers.

export default function GlobeHUD({ totals, activity }: Props) {
  const since = totals?.sinceLaunch;
  const today = totals?.today;
  const recent = totals?.mostRecent;
  const topCountriesMax = Math.max(1, ...(totals?.topCountries.map((c) => c.n) || [0]));

  const launchDate = totals?.launchTs ? new Date(totals.launchTs * 1000) : null;
  const launchDateLabel = launchDate
    ? launchDate.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
    : null;
  const todaySum = (today?.visits ?? 0) + (today?.downloads ?? 0);
  const recentIsStale = recent && totals ? totals.serverNow - recent.ts > 24 * 3600 : false;

  return (
    <div className="mt-6 space-y-3 text-[11px] uppercase tracking-widest font-mono leading-relaxed">

      {/* LINE 1 — masthead totals, single horizontal flow */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="opacity-55">Since {launchDateLabel || '—'}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }} className="opacity-90">
          <strong className="font-display text-base mr-1" style={{ fontWeight: 400 }}>
            {(since?.total ?? 0).toLocaleString()}
          </strong>
          events
        </span>
        <Sep />
        <Pair color={ARC_COLORS.first_time} n={since?.firstTime ?? 0} label="first" />
        <Pair color={ARC_COLORS.returning}  n={since?.returning ?? 0} label="ret" />
        <Pair color={ARC_COLORS.download}   n={since?.downloads ?? 0} label="dl" />
        <Sep />
        <span className="opacity-65">{since?.countries ?? 0} countries · {since?.continents ?? 0} cont</span>
        <Sep />
        <span className="opacity-65">today {todaySum} ({today?.visits ?? 0}v / {today?.downloads ?? 0}d)</span>
      </div>

      <Rule />

      {/* LINE 2 — most recent: city/country/continent inline, paper title under */}
      {recent ? (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="opacity-55">{recentIsStale ? 'Latest · since launch' : 'Latest'}</span>
            <span className="font-display text-sm normal-case tracking-normal" style={{ fontWeight: 500 }}>
              {[recent.city, recent.country_name].filter(Boolean).join(', ') || 'Unknown'}
            </span>
            <span className="opacity-55">
              · {recent.continent_name || '—'} · {timeAgoShort(totals!.serverNow - recent.ts)}
            </span>
          </div>
          {recent.paper_title && (
            <div className="font-display italic text-[12px] normal-case tracking-normal opacity-75 leading-snug">
              {truncate(recent.paper_title, 90)}
            </div>
          )}
        </div>
      ) : (
        <div className="opacity-55">Awaiting first event…</div>
      )}

      <Rule />

      {/* LINE 3 — top countries (24h) inline with mini bars */}
      {(totals?.topCountries || []).length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="opacity-55">Top 24h</span>
          {(totals?.topCountries || []).slice(0, 6).map((c) => (
            <span key={c.country} className="inline-flex items-center gap-1.5">
              <span className="opacity-80">{c.country_name || c.country}</span>
              <span
                className="inline-block h-[2px]"
                style={{
                  width: `${Math.max(8, Math.round((c.n / topCountriesMax) * 32))}px`,
                  background: 'var(--color-accent, #7A1E2B)',
                }}
                aria-hidden="true"
              />
              <span className="opacity-55" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="opacity-55">Top 24h · no data yet</div>
      )}

      <Rule />

      {/* LINE 4 — current-view tally (smallest, dimmest) */}
      <div className="opacity-55 text-[10px]">
        In view: {activity.visits}v ({activity.firstTime}f/{activity.returning}r) · {activity.downloads}d
        {activity.papersTouched > 0 && <> · {activity.papersTouched} papers</>}
      </div>
    </div>
  );
}

/* ─── Tiny inline helpers ─────────────────────────────────────────── */

function Sep() {
  return <span className="opacity-25">·</span>;
}

function Rule() {
  return (
    <hr
      className="border-0"
      style={{
        height: '1px',
        background:
          'linear-gradient(90deg, transparent, color-mix(in srgb, var(--text) 14%, transparent) 12%, color-mix(in srgb, var(--text) 14%, transparent) 88%, transparent)',
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
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}`,
          display: 'inline-block',
        }}
      />
      <span style={{ fontVariantNumeric: 'tabular-nums' }} className="opacity-90">{n}</span>
      <span className="opacity-55">{label}</span>
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
