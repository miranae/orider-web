export const FEAS_COLORS: Record<string, string> = {
  easy: 'var(--lime)',
  on_track: 'var(--lime)',
  stretch: 'var(--amber)',
  risky: 'var(--rose)',
};

/**
 * i18n key paths for feasibility labels.
 * Translate at point of use: t(FEAS_LABEL_KEYS[label]) with useTranslation("training").
 */
export const FEAS_LABEL_KEYS: Record<string, string> = {
  easy: 'feasLabels.easy',
  on_track: 'feasLabels.on_track',
  stretch: 'feasLabels.stretch',
  risky: 'feasLabels.risky',
};
