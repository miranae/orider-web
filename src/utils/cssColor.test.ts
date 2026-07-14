import { describe, expect, it } from "vitest";

import { resolveCssColor } from "./cssColor";
import { APP_PARITY_THEME } from "../theme/themes";

describe("resolveCssColor", () => {
  it("resolves a CSS custom property to a canvas-compatible color", () => {
    document.documentElement.style.setProperty("--chart-test", "oklch(0.7 0.1 200)");

    expect(resolveCssColor("var(--chart-test)")).toBe("oklch(0.7 0.1 200)");
  });

  it("preserves literal and unavailable colors", () => {
    expect(resolveCssColor("#22c55e")).toBe("#22c55e");
    expect(resolveCssColor("var(--chart-missing)")).toBe("var(--chart-missing)");
  });

  it("uses the current React theme variant without waiting for DOM effects", () => {
    const variant = APP_PARITY_THEME.scheme.dark;

    expect(resolveCssColor("var(--zone-3)", variant)).toBe(variant.colors.zone3);
    expect(resolveCssColor("var(--lime)", variant)).toBe(variant.colors.accent);
    expect(resolveCssColor("var(--chart-power)", variant)).toBe(variant.chartColors.power);
  });
});
