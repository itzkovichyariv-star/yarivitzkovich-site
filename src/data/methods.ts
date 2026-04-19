export const METHODS = [
  'Conceptual',
  'Quantitative',
  'Qualitative',
  'Mixed Methods',
  'Longitudinal',
  'Multilevel',
  'Review',
  'Meta-Analysis',
  'Essay',
] as const;

export type Method = typeof METHODS[number];
