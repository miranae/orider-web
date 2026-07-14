import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FitnessChart semantic samples", () => {
  it("repeats solid, dashed, and dotted PMC patterns inside the desktop tooltip", () => {
    const source = readFileSync(join(process.cwd(), "src/components/FitnessChart.tsx"), "utf8");
    const tooltip = source.slice(source.indexOf("{/* 호버 십자선 + 도트 + 카드 */}"), source.indexOf("{/* X축 레이블 */}"));

    expect(tooltip).toContain('data-pmc-tooltip-metric={item.label}');
    expect(tooltip).toContain("style: PMC_LINE_PALETTE.ctl");
    expect(tooltip).toContain("style: PMC_LINE_PALETTE.atl");
    expect(tooltip).toContain("style: PMC_LINE_PALETTE.tsb");
    expect(tooltip).toContain("strokeDasharray={item.style.dasharray}");
    expect(tooltip).toContain("strokeLinecap={item.style.linecap}");
    expect(tooltip).not.toContain('<circle cx="4" cy="-3"');
  });
});
