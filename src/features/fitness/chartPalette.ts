/** Shared semantic palette for fitness charts and load summaries. */
export const PMC_LINE_PALETTE = {
  ctl: {
    color: "var(--chart-power)",
    strokeWidth: 2.2,
    dasharray: undefined,
    linecap: "round",
  },
  atl: {
    color: "var(--rose)",
    strokeWidth: 1.7,
    dasharray: "7 4",
    linecap: "butt",
  },
  tsb: {
    color: "var(--amber)",
    strokeWidth: 1.7,
    dasharray: "1 4",
    linecap: "round",
  },
} as const;

export const PMC_FUTURE_OPACITY = 0.62;

export const DISCIPLINE_CHART_COLORS = {
  bike: "var(--color-brand-bike)",
  run: "var(--color-brand-run)",
  swim: "var(--color-brand-swim)",
} as const;

export const LOAD_FOCUS_COLORS = {
  baseAerobic: "var(--aqua)",
  highAerobic: "var(--amber)",
  highIntensity: "var(--rose)",
  unclassified: "var(--ink-3)",
} as const;
