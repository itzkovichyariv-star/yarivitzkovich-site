// Shared "period" model used by BOTH the live globe (/live) and the events
// breakdown (/manage/events) so their time controls behave identically.
//
// A period is either a specific calendar Month, a specific calendar Year, or
// "All time". Month/Year are navigable via an integer offset from the current
// period (0 = current, -1 = previous, …). getPeriodBounds turns a period into
// unix-second bounds the API endpoints understand (from/to), plus a label.

export type PeriodType = 'month' | 'year' | 'all';

export interface PeriodValue {
  type: PeriodType;
  /** 0 = current period, -1 = previous, … . Ignored when type === 'all'. */
  offset: number;
}

export const DEFAULT_PERIOD: PeriodValue = { type: 'all', offset: 0 };

// First year with data — bounds how far back the pickers let you navigate.
// Matches the site's tracking start (May 2026 launch, 2024 kept as a safe
// floor so historical backfills remain reachable).
export const SITE_START_YEAR = 2024;

export interface PeriodBounds {
  /** Inclusive lower bound in unix seconds; null = no lower bound (all time). */
  from: number | null;
  /** Inclusive upper bound in unix seconds; null = now (all time). */
  to: number | null;
  label: string;
}

/**
 * Resolve a period to concrete unix-second bounds + a human label.
 * Uses the viewer's local timezone (the owner's) for month/year boundaries.
 * For the CURRENT period (offset 0) the upper bound is "now" so a partial
 * month/year shows live data; for past periods it's the period's true end.
 */
export function getPeriodBounds({ type, offset }: PeriodValue): PeriodBounds {
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);

  if (type === 'all') return { from: null, to: null, label: 'All time' };

  if (type === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
    return {
      from: Math.floor(start.getTime() / 1000),
      to: offset >= 0 ? nowSec : Math.floor(end.getTime() / 1000),
      label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }

  // year
  const year = now.getFullYear() + offset;
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);
  return {
    from: Math.floor(start.getTime() / 1000),
    to: offset >= 0 ? nowSec : Math.floor(end.getTime() / 1000),
    label: String(year),
  };
}

/**
 * True when the period is the live/current one — callers use this to decide
 * whether to keep polling (a past month never changes, so polling is waste).
 */
export function isCurrentPeriod({ type, offset }: PeriodValue): boolean {
  return type === 'all' || offset === 0;
}

/**
 * Build the query-string params for a /live/events or /live/details request
 * scoped to this period. All-time → `range=all`; a bounded period → from/to.
 */
export function periodParams(period: PeriodValue): URLSearchParams {
  const params = new URLSearchParams();
  const { from, to } = getPeriodBounds(period);
  if (from == null || to == null) {
    params.set('range', 'all');
  } else {
    params.set('from', String(from));
    params.set('to', String(to));
  }
  return params;
}
