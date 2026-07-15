import { useMemo } from 'react';
import { ARC_COLORS } from '../lib/globePalette';
import { resolvePaperTitle } from '../lib/paperTitle';

// Compact, period-scoped replacement for the live GlobeHUD, shown when the
// owner has picked a specific Month or Year. Every number is computed from
// the SAME events already loaded for the globe, so the summary is always
// consistent with the arcs and cities on screen. (When "All time" is active
// the globe keeps rendering the full live GlobeHUD instead.)

interface Ev {
  kind: 'visit' | 'download';
  visitor_class: string;
  paper_slug: string | null;
  paper_title: string | null;
  country: string | null;
  country_name: string | null;
  continent_name: string | null;
  city: string | null;
}

const VISITS_COLOR = '#9DB3BE';

export default function PeriodSummary({ events, label }: { events: Ev[]; label: string }) {
  const s = useMemo(() => {
    let firstTime = 0, returning = 0, downloads = 0;
    const countries = new Set<string>();
    const continents = new Set<string>();
    const byCountry = new Map<string, { name: string; n: number }>();
    const byPaper = new Map<string, { slug: string; title: string; n: number }>();

    for (const e of events) {
      const cname = e.country_name || e.country || null;
      if (cname) {
        countries.add(cname);
        const row = byCountry.get(cname) ?? { name: cname, n: 0 };
        row.n += 1;
        byCountry.set(cname, row);
      }
      if (e.continent_name) continents.add(e.continent_name);

      if (e.kind === 'download') {
        downloads += 1;
        if (e.paper_slug) {
          const title = resolvePaperTitle(e.paper_slug, e.paper_title) || e.paper_slug;
          const row = byPaper.get(e.paper_slug) ?? { slug: e.paper_slug, title, n: 0 };
          row.n += 1;
          byPaper.set(e.paper_slug, row);
        }
      } else if (e.visitor_class === 'returning') {
        returning += 1;
      } else {
        firstTime += 1;
      }
    }

    const topCountries = Array.from(byCountry.values()).sort((a, b) => b.n - a.n).slice(0, 6);
    const topPapers = Array.from(byPaper.values()).sort((a, b) => b.n - a.n).slice(0, 3);
    return {
      total: events.length,
      firstTime, returning, downloads,
      countries: countries.size,
      continents: continents.size,
      topCountries,
      topPapers,
      topCountriesMax: Math.max(1, ...topCountries.map((c) => c.n)),
    };
  }, [events]);

  return (
    <div className="mt-6 space-y-5 leading-relaxed">
      {/* Headline — total events for the selected period */}
      <section>
        <SectionLabel>{label}</SectionLabel>
        <div className="space-y-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="font-display"
              style={{ fontSize: '2rem', fontWeight: 350, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {s.total.toLocaleString()}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-soft">
              {s.total === 1 ? 'event' : 'events'}
            </span>
          </div>
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap font-mono text-[11px] uppercase tracking-widest">
            <Pair color={VISITS_COLOR} n={s.firstTime + s.returning} label="visits" />
            <Pair color={ARC_COLORS.first_time} n={s.firstTime} label="first-time" />
            <Pair color={ARC_COLORS.returning} n={s.returning} label="returning" />
            <Pair color={ARC_COLORS.download} n={s.downloads} label="downloads" />
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-soft">
            Reached {s.countries} {s.countries === 1 ? 'country' : 'countries'} · {s.continents} {s.continents === 1 ? 'continent' : 'continents'}
          </div>
        </div>
      </section>

      <Rule />

      {/* By country (within period) */}
      <section>
        <SectionLabel>By country · {label}</SectionLabel>
        {s.topCountries.length > 0 ? (
          <ul className="space-y-2 mt-1">
            {s.topCountries.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className="font-display text-sm flex-1 truncate">{c.name}</span>
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{
                    width: `${Math.max(14, Math.round((c.n / s.topCountriesMax) * 96))}px`,
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
          <div className="font-mono text-xs uppercase tracking-widest text-soft">No activity in this period</div>
        )}
      </section>

      <Rule />

      {/* Most-downloaded papers (within period) */}
      <section>
        <SectionLabel>Most-downloaded papers · {label}</SectionLabel>
        {s.topPapers.length > 0 ? (
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
            {s.topPapers.map((p) => (
              <li key={p.slug} style={{ display: 'contents' }}>
                <a
                  href={`/publications/${p.slug}`}
                  className="font-display italic text-sm leading-snug underline decoration-transparent hover:decoration-current transition"
                  style={{ color: 'inherit' }}
                >
                  {p.title}
                </a>
                <span
                  aria-hidden="true"
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: ARC_COLORS.download, boxShadow: `0 0 4px ${ARC_COLORS.download}`,
                    display: 'inline-block', alignSelf: 'first baseline', transform: 'translateY(-0.1em)',
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
          <div className="font-mono text-xs uppercase tracking-widest text-soft">No downloads in this period</div>
        )}
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-soft mb-2">{children}</h3>
  );
}

function Rule() {
  return (
    <hr className="border-0" style={{ height: '1px', background: 'color-mix(in srgb, var(--text) 12%, transparent)' }} />
  );
}

function Pair({ color, n, label }: { color: string; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, display: 'inline-block' }}
      />
      <span style={{ fontVariantNumeric: 'tabular-nums' }} className="opacity-90">{n}</span>
      <span className="opacity-65">{label}</span>
    </span>
  );
}
