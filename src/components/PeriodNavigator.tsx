import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPeriodBounds,
  SITE_START_YEAR,
  type PeriodType,
  type PeriodValue,
} from '../lib/period';

// Shared time control for the live globe and the events breakdown. Renders
// three type tabs — Month · Year · All time — and, for Month/Year, a
// ← label → navigator whose label opens a calendar picker (month grid or
// year list). Styling is mono/uppercase to sit inside the existing filter
// rows; the caller passes `className` for outer layout.

const TYPE_OPTIONS: Array<{ key: PeriodType; label: string }> = [
  { key: 'month', label: 'Month' },
  { key: 'year',  label: 'Year' },
  { key: 'all',   label: 'All time' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  loading?: boolean;
  className?: string;
  /** Leading label, e.g. "View". Pass "" to omit. */
  labelPrefix?: string;
}

export default function PeriodNavigator({ value, onChange, loading, className, labelPrefix = 'View' }: Props) {
  const { type, offset } = value;
  const { label } = useMemo(() => getPeriodBounds(value), [type, offset]);

  // Stable "now" for the session so offset arithmetic is consistent.
  const now = useMemo(() => new Date(), []);
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(nowYear);
  const navRef = useRef<HTMLDivElement>(null);

  // Close the picker on an outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const chooseType = (t: PeriodType) => {
    setPickerOpen(false);
    onChange({ type: t, offset: 0 });
  };

  const hasPicker = type === 'month' || type === 'year';

  const openPicker = () => {
    if (pickerOpen) { setPickerOpen(false); return; }
    if (type === 'month') setPickerYear(new Date(nowYear, nowMonth + offset, 1).getFullYear());
    else if (type === 'year') setPickerYear(nowYear + offset);
    setPickerOpen(true);
  };

  const isFutureMonth = (y: number, m: number) => y > nowYear || (y === nowYear && m > nowMonth);
  const isSelectedMonth = (y: number, m: number) => type === 'month' && (y - nowYear) * 12 + m - nowMonth === offset;
  const isSelectedYear = (y: number) => type === 'year' && y - nowYear === offset;

  const btn = { font: 'inherit' as const };

  return (
    <div className={`font-mono text-xs uppercase tracking-widest ${className ?? ''}`}>
      {/* Type tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        {labelPrefix && <span className="opacity-60" style={{ userSelect: 'none' }}>{labelPrefix}</span>}
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => chooseType(opt.key)}
            className="hover:opacity-100 transition-opacity py-1.5 px-2 -mx-1"
            style={{
              ...btn,
              opacity: type === opt.key ? 1 : 0.55,
              borderBottom: type === opt.key ? '2px solid currentColor' : '2px solid transparent',
            }}
          >
            {opt.label}
          </button>
        ))}
        {loading && <span className="opacity-45">Loading…</span>}
      </div>

      {/* Navigator (Month / Year only): ← label → with a picker on the label */}
      {hasPicker && (
        <div className="relative mt-2" ref={navRef}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange({ type, offset: offset - 1 })}
              disabled={type === 'month'
                ? new Date(nowYear, nowMonth + offset - 1, 1).getFullYear() < SITE_START_YEAR
                : nowYear + offset - 1 < SITE_START_YEAR}
              className="opacity-55 hover:opacity-100 transition-opacity px-1 disabled:opacity-20"
              style={btn}
              aria-label="Previous period"
            >
              ←
            </button>

            <button
              type="button"
              onClick={openPicker}
              className="opacity-90 min-w-[7rem] text-center hover:opacity-100 transition-opacity"
              style={{ ...btn, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
              aria-label="Open period picker"
            >
              {label}
            </button>

            <button
              type="button"
              onClick={() => onChange({ type, offset: offset + 1 })}
              disabled={offset >= 0}
              className="opacity-55 hover:opacity-100 transition-opacity px-1 disabled:opacity-20"
              style={btn}
              aria-label="Next period"
            >
              →
            </button>
          </div>

          {pickerOpen && (
            <div
              className="absolute z-30 rounded-lg p-4"
              style={{
                top: '2.4rem',
                left: 0,
                background: 'var(--surface)',
                border: '1px solid color-mix(in srgb, var(--text) 18%, transparent)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                minWidth: '13rem',
              }}
            >
              {type === 'month' && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y - 1)}
                      disabled={pickerYear <= SITE_START_YEAR}
                      className="opacity-55 hover:opacity-100 transition-opacity disabled:opacity-20 px-1"
                      style={btn}
                    >←</button>
                    <span className="opacity-90">{pickerYear}</span>
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y + 1)}
                      disabled={pickerYear >= nowYear}
                      className="opacity-55 hover:opacity-100 transition-opacity disabled:opacity-20 px-1"
                      style={btn}
                    >→</button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {MONTHS_SHORT.map((m, idx) => {
                      const disabled = isFutureMonth(pickerYear, idx);
                      const selected = isSelectedMonth(pickerYear, idx);
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            onChange({ type: 'month', offset: (pickerYear - nowYear) * 12 + idx - nowMonth });
                            setPickerOpen(false);
                          }}
                          className="py-1 rounded transition-opacity hover:opacity-100"
                          style={{
                            ...btn,
                            opacity: disabled ? 0.2 : selected ? 1 : 0.6,
                            fontWeight: selected ? 700 : 400,
                            background: selected ? 'color-mix(in srgb, var(--text) 14%, transparent)' : 'transparent',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {type === 'year' && (
                <div className="flex flex-col gap-0.5">
                  {Array.from({ length: nowYear - SITE_START_YEAR + 1 }, (_, i) => nowYear - i).map((y) => {
                    const selected = isSelectedYear(y);
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => { onChange({ type: 'year', offset: y - nowYear }); setPickerOpen(false); }}
                        className="py-1.5 px-2 rounded text-left transition-opacity hover:opacity-100"
                        style={{
                          ...btn,
                          opacity: selected ? 1 : 0.6,
                          fontWeight: selected ? 700 : 400,
                          background: selected ? 'color-mix(in srgb, var(--text) 14%, transparent)' : 'transparent',
                        }}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
