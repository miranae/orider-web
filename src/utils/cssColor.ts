import type { OriderThemeVariant } from "../theme/OriderTheme";
import { CHART_CSS_VARIABLES, COLOR_CSS_VARIABLES } from "../theme/generated";

/**
 * Canvas APIs do not resolve CSS custom-property references such as
 * `var(--zone-1)`. Resolve a single token at the DOM boundary before passing
 * theme colors to Chart.js.
 */
export function resolveCssColor(value: string, variant?: OriderThemeVariant): string {
  const match = value.match(/^var\((--[^)]+)\)$/);
  if (!match || typeof document === "undefined") return value;

  const cssVariable = match[1]!;
  if (variant) {
    if (cssVariable === "--lime") return variant.colors.accent;

    for (const [token, variable] of Object.entries(COLOR_CSS_VARIABLES)) {
      if (variable === cssVariable) return variant.colors[token as keyof typeof variant.colors];
    }
    for (const [token, variable] of Object.entries(CHART_CSS_VARIABLES)) {
      if (variable === cssVariable) return variant.chartColors[token as keyof typeof variant.chartColors];
    }
  }

  return getComputedStyle(document.documentElement).getPropertyValue(cssVariable).trim() || value;
}
