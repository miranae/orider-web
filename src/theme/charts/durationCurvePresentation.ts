import type { ScriptableContext } from "chart.js";
import { color } from "chart.js/helpers";

/** Shared duration-curve appearance; consumers retain units, samples and comparison rules. */
export const DURATION_CURVE_PRESENTATION = Object.freeze({
  lineWidth: 2.5, pointRadius: 2, hoverRadius: 5, referenceWidth: 1.5,
});

export function durationCurveArea(context: ScriptableContext<"line">, seriesColor: string): CanvasGradient | string {
  const alpha = (opacity: number) => {
    const parsed = color(seriesColor);
    if (parsed.valid) return parsed.alpha(opacity).rgbString();
    // Theme tokens may be CSS Color 4 (OKLCH), which Chart.js' color parser does not support.
    if (!seriesColor.includes("var(") && typeof CSS !== "undefined" && CSS.supports?.("color", seriesColor)) {
      return `color-mix(in srgb, ${seriesColor} ${opacity * 100}%, transparent)`;
    }
    return "transparent";
  };
  const top = alpha(0.18);
  if (top === "transparent") return top;
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return alpha(0.12);
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, alpha(0.015));
  return gradient;
}
