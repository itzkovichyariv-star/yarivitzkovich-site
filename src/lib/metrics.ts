import metrics from '../data/metrics.json';

/**
 * Freshness gate for externally-sourced numbers.
 *
 * Google Scholar blocks automated access, so the daily refresh
 * (scripts/scholar-profile-metrics.mjs) is allowed to come back empty-handed.
 * When it does, the stamp in metrics.json stops moving — and a citation count
 * that stopped moving is a number that lies quietly, which is worse than no
 * number at all. So display code asks this first, and shows nothing when the
 * answer is stale.
 *
 * MAX_AGE_DAYS is deliberately several times the refresh interval: a couple of
 * blocked days is normal and should not make the figures flicker away, but a
 * week of silence means the pipeline is down and the numbers must go quiet.
 */
const MAX_AGE_DAYS = 7;

export interface MetricGroup {
  citations?: number;
  hIndex?: number;
  i10Index?: number;
  worksCount?: number;
  source?: string;
  url?: string;
  updatedAt?: string;
}

/** Days since an ISO date (YYYY-MM-DD), or null if absent/unparseable. */
export function ageInDays(updatedAt: string | undefined): number | null {
  if (!updatedAt) return null;
  const then = Date.parse(`${updatedAt}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * True when a metric group carries a stamp recent enough to publish.
 * An absent stamp is never fresh — a number nobody is refreshing is exactly
 * the case this gate exists to catch.
 */
export function isFresh(group: MetricGroup | undefined, maxAgeDays = MAX_AGE_DAYS): boolean {
  const age = ageInDays(group?.updatedAt);
  return age !== null && age <= maxAgeDays;
}

/** "updated today" / "updated 3 days ago" — for the line under a figure. */
export function freshnessLabel(group: MetricGroup | undefined): string | null {
  const age = ageInDays(group?.updatedAt);
  if (age === null) return null;
  if (age <= 0) return 'updated today';
  if (age === 1) return 'updated yesterday';
  return `updated ${age} days ago`;
}

export const scholar: MetricGroup = metrics.googleScholar;
export const openAlex: MetricGroup = metrics.openAlex;
