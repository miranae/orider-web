import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("identity data chips", () => {
  it("surfaces rider type, stamina, cohort, and gear on the athlete page", () => {
    const source = read("src/pages/AthletePage.tsx");
    expect(source).toContain("usePdc");
    expect(source).toContain("useCohortPercentiles");
    expect(source).toContain("identity.stamina");
    expect(source).toContain("identity.cohortTop");
    expect(source).toContain("identity.gearOverdue");
  });

  it("surfaces gear maintenance data on feed activity cards", () => {
    const source = read("src/components/ActivityCard.tsx");
    expect(source).toContain("IdentityDataChips");
    expect(source).toContain("identityPdc");
    expect(source).toContain("card.cohortTop");
    expect(source).toContain("GearMaintenanceChip");
    expect(source).toContain("card.gearRemaining");
    expect(source).toContain("card.gearOverdue");
  });
});
