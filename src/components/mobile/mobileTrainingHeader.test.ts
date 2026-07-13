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
    expect(source).not.toContain("ChevronLeft");
    expect(source).not.toContain('navigate("/my")');
  });
});
