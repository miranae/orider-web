import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("guest value surfaces", () => {
  it("keeps signed-out fitness, plan, and log visitors on demo previews", () => {
    expect(source("src/pages/FitnessPage.tsx")).toContain('<GuestValuePreview kind="fitness"');
    expect(source("src/pages/PlanPage.tsx")).toContain('<GuestValuePreview kind="plan"');
    expect(source("src/pages/TrainingLogPage.tsx")).toContain('<GuestValuePreview kind="log"');
    expect(source("src/pages/PlanPage.tsx")).not.toContain('navigate("/goal-setup", { replace: true })');
  });

  it("adds signed-out contextual CTAs for public course and event lists", () => {
    expect(source("src/pages/CoursesPage.tsx")).toContain("이 코스 내 기록과 비교하기");
    expect(source("src/pages/EventsPage.tsx")).toContain("내 예상 기록과 비교하기");
    expect(source("src/pages/CoursesPage.tsx")).toContain('to="/tools/virtual-power"');
    expect(source("src/pages/EventsPage.tsx")).toContain('to="/tools/virtual-power"');
  });

  it("registers the public virtual power tool route", () => {
    const app = source("src/App.tsx");
    expect(app).toContain("VirtualPowerToolPage");
    expect(app).toContain('path="tools/virtual-power"');
  });
});
