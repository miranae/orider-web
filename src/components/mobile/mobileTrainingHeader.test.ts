import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile training headers", () => {
  it.each([
    ["MobileFitnessPage.tsx", 't("mobileFitness.title")'],
    ["MobilePlanPage.tsx", "t('mobile.headerTitle')"],
    ["MobileLogPage.tsx", 't("mobileLog.headerTitle")'],
  ])("keeps the %s title without a profile back action", (file, title) => {
    const source = read(`src/components/mobile/${file}`);

    expect(source).toContain(title);
    // Calendar month controls may use chevrons; only the page header must omit a back action.
    // The other training pages do not share the log header markers.
    const header = file === "MobileLogPage.tsx"
      ? source.slice(source.indexOf("{/* Header */}"), source.indexOf("{/* 종목 필터 */}"))
      : source;
    expect(header).toContain(title);
    expect(header).not.toContain("ChevronLeft");
    expect(source).not.toContain('navigate("/my")');
  });

  it("retains accessible calendar month navigation outside the log header", () => {
    const source = read("src/components/mobile/MobileLogPage.tsx");
    const calendar = source.slice(source.indexOf("{/* Calendar */}"));
    expect(calendar).toMatch(/aria-label=\{t\("training:page.prevMonth"\)\}[^>]*onClick=\{\(\) => onChangeMonth\(-1\)\}/);
    expect(calendar).toMatch(/aria-label=\{t\("training:page.nextMonth"\)\}[^>]*onClick=\{\(\) => onChangeMonth\(1\)\}/);
  });
});
