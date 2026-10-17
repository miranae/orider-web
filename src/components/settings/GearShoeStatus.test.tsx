import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
const mocks = vi.hoisted(() => ({ runs: [] as Activity[], loading: false, available: true, units: "metric" }));
vi.mock("../../hooks/useRunHistory", () => ({ useRunHistory: (weeks: number) => { expect(weeks).toBe(8); return mocks; } }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
import { GearShoeStatus } from "./GearShoeStatus";
function shoe(startTime: number, name: string, total: number, max = 1000) {
  return createMockActivity({ type: "Run", startTime, gear: { type: "shoes", name, totalDistanceKm: total, maxDistanceKm: max } });
}
beforeEach(() => { mocks.runs = []; mocks.loading = false; mocks.available = true; mocks.units = "metric"; });
describe("recent shoe snapshot", () => {
  it("shows the latest matching snapshot, canonical distance and less-than-15% warning", () => {
    mocks.runs = [shoe(20, "Latest", 900), shoe(10, "Older", 200)];
    render(<GearShoeStatus />);
    expect(screen.getByTestId("P4-3-1")).toHaveTextContent("Latest");
    expect(screen.getByText("누적 이동거리 900.0km")).toBeInTheDocument();
    expect(screen.getByText("남은 거리 100.0km · 교체 권장 1000.0km")).toBeInTheDocument();
    expect(screen.getByText(/교체 임박/)).toBeInTheDocument();
    expect(screen.queryByText("Older")).toBeNull();
    expect(screen.getByText(/전체 신발 목록은 아니며/)).toBeInTheDocument();
  });
  it("shows latest snapshots per stable ID, keeps identical names separate, and uses one legacy fallback", () => {
    mocks.runs = [
      { ...shoe(10, "Same name", 100), gearId: "g1" },
      { ...shoe(30, "Same name", 900), sourceMeta: { extra: { gearId: "g1", stravaGearId: "g1" } } },
      { ...shoe(20, "Same name", 600), gearId: "g2", sourceMeta: { extra: { stravaGearId: "g2" } } },
      shoe(5, "Older legacy", 50), shoe(15, "Recent legacy", 300),
    ];
    render(<GearShoeStatus />);
    const rows = screen.getAllByTestId("P4-3-1");
    expect(rows).toHaveLength(3);
    const first = rows.find(row => row.textContent?.includes("신발 ID g1"))!;
    const second = rows.find(row => row.textContent?.includes("신발 ID g2"))!;
    expect(within(first).getByText("누적 이동거리 900.0km")).toBeInTheDocument();
    expect(within(second).getByText("누적 이동거리 600.0km")).toBeInTheDocument();
    expect(screen.getAllByText("Same name")).toHaveLength(2);
    expect(screen.getByText("Recent legacy")).toBeInTheDocument();
    expect(screen.queryByText("Older legacy")).toBeNull();
    expect(screen.getByText("ID 없는 최근 신발")).toBeInTheDocument();
  });
  it("excludes conflicting producer IDs instead of merging or overriding a valid stable snapshot", () => {
    mocks.runs = [
      { ...shoe(10, "Verified", 500), gearId: "g1" },
      { ...shoe(50, "Conflict", 990), gearId: "g1", sourceMeta: { extra: { gearId: "g2" } } },
      { ...shoe(60, "Meta conflict", 999), sourceMeta: { extra: { gearId: "g3", stravaGearId: "g4" } } },
    ];
    render(<GearShoeStatus />);
    expect(screen.getAllByTestId("P4-3-1")).toHaveLength(1);
    expect(screen.getByText("누적 이동거리 500.0km")).toBeInTheDocument();
    expect(screen.queryByText("Conflict")).toBeNull();
    expect(screen.queryByText("Meta conflict")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("식별자가 서로 다른");
  });
  it.each([
    [NaN, 1000], [Infinity, 1000], [-1, 1000], [10, NaN], [10, Infinity], [10, -1], [10, 0],
  ])("skips invalid keyed snapshot total=%s maximum=%s", (total, maximum) => {
    mocks.runs = [{ ...shoe(10, "Invalid", total, maximum), gearId: "g1" }];
    render(<GearShoeStatus />);
    expect(screen.queryByTestId("P4-3-1")).toBeNull();
    expect(screen.getByTestId("P4.shoeEmpty")).toBeInTheDocument();
  });

  it("uses preferred units and preserves the exact 15% threshold", () => {
    mocks.runs = [shoe(20, "Shoe", 850)]; mocks.units = "imperial";
    render(<GearShoeStatus />);
    expect(screen.getByText("누적 이동거리 528.2mi")).toBeInTheDocument();
    expect(screen.queryByText(/교체 임박/)).toBeNull();
  });
  it.each(["loading", "unavailable", "empty", "missingMaximum", "invalidDistance"])("does not invent distance in %s state", state => {
    mocks.loading = state === "loading"; mocks.available = state !== "unavailable";
    if (state === "missingMaximum") mocks.runs = [shoe(1, "Shoe", 900, 0)];
    if (state === "invalidDistance") mocks.runs = [shoe(1, "Shoe", NaN)];
    render(<GearShoeStatus />);
    expect(screen.queryByTestId("P4-3-1")).toBeNull();
    expect(screen.queryByText(/누적 이동거리 0/)).toBeNull();
    if (state === "unavailable") expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
