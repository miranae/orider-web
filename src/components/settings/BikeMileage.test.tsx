import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceSnapshotState } from "../../hooks/useMaintenanceSnapshot";
const mocks = vi.hoisted(() => ({ state: { envelope: null, display: null } as MaintenanceSnapshotState, read: vi.fn(), units: "metric" }));
vi.mock("../../hooks/useMaintenanceSnapshot", () => ({ useMaintenanceSnapshot: (uid: string, profile: string) => { mocks.read(uid, profile); return mocks.state; } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
import { BikeMileage } from "./BikeMileage";
import { CANONICAL_SCHEMA_VERSION } from "@shared/types/canonical";
function value(status: "canonical" | "stale" | "failed") {
  mocks.state = { envelope: { schemaVersion: CANONICAL_SCHEMA_VERSION, algorithmVersion: "maintenance@1", status, computedAt: 10, inputRevision: "r1", inputDigest: "d1", period: null, data: { odometerKm: 1234, movingTimeSec: 0, components: [], dueCount: 0, pendingActivityCount: 0 }, error: null }, display: status === "stale" ? "value_with_stale_hint" : status === "failed" ? "error" : "value" };
}
beforeEach(() => { mocks.state = { envelope: null, display: null }; mocks.units = "metric"; mocks.read.mockClear(); });
describe("canonical bike mileage", () => {
  it("binds the current owner's bike and shows canonical accumulated km", () => {
    value("canonical"); render(<BikeMileage profileId="road" />);
    expect(mocks.read).toHaveBeenCalledWith("owner", "road");
    expect(screen.getByText("누적 1234.0km")).toBeInTheDocument();
  });
  it("labels stale data and projects imperial units", () => {
    value("stale"); mocks.units = "imperial"; render(<BikeMileage profileId="road" />);
    expect(screen.getByText(/누적 766.8mi.*이전 집계/)).toBeInTheDocument();
  });
  it.each([null, "loading", "error", "empty"] as const)("does not present unknown distance as zero for %s", display => {
    mocks.state.display = display; render(<BikeMileage profileId="road" />);
    expect(screen.queryByText(/0.*km/)).toBeNull();
    expect(screen.getByTestId("P4-1-1")).not.toHaveTextContent("누적 0");
  });
  it("does not draw failed payloads even when the reader carries an odometer", () => {
    value("failed"); render(<BikeMileage profileId="road" />);
    expect(screen.getByText("누적 거리를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/1234/)).toBeNull();
  });
});
