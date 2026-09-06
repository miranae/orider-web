import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_SCHEMA_VERSION } from "@shared/types/canonical";
import beRolling from "./__fixtures__/home-summary-be-rolling.json";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: { uid: "a" } }));
vi.mock("../services/canonicalApi", () => ({ canonicalConsumersEnabled: () => true, fetchCanonicalHomeSummary: mocks.fetch }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
import CanonicalHomeSummaryCard from "./CanonicalHomeSummaryCard";

function envelope(status: string, totals: unknown = null) {
  return { schemaVersion: CANONICAL_SCHEMA_VERSION, algorithmVersion: "home@1", status,
    computedAt: status === "canonical" ? 1 : null, inputRevision: null, inputDigest: null, period: null,
    error: status === "failed" ? { code: "offline", retryable: true } : null,
    data: totals ? { rolling7d: { totals }, calendar: { month: { totals: { distanceMeters: 9999000 } } } } : null };
}

describe("canonical rolling-seven-day Home card", () => {
  beforeEach(() => { mocks.user = { uid: "a" }; mocks.fetch.mockReset(); });
  it("renders the serialized output of the actual BE aggregateWindow function", async () => {
    // Generated locally from BE functions/lib/functions/src/api/routes/home-summary-aggregate.js:
    // aggregateWindow([{id:'fixture-ride',source:'orider',startTime:1788649200000,
    // distanceMeters:42000,movingMillis:3600000,elevationGainMeters:120}], rollingWindow(1788652800000)).
    const response = envelope("canonical", beRolling.totals);
    response.data!.rolling7d = beRolling;
    mocks.fetch.mockResolvedValueOnce(response);
    render(<CanonicalHomeSummaryCard />);
    expect(await screen.findByText("42.0 km")).toBeInTheDocument();
    expect(screen.getByText("1.0 h")).toBeInTheDocument();
    expect(screen.getByText("120 m")).toBeInTheDocument();
  });
  it("uses rolling totals, not calendar totals, and retains them with a visible stale hint", async () => {
    // Wire names/units from BE home-summary-aggregate.HomeSummaryTotals, not display units.
    mocks.fetch.mockResolvedValueOnce(envelope("canonical", { activityCount: 0, distanceMeters: 42000, movingMillis: 3600000, elevationGainMeters: 0 }));
    const view = render(<CanonicalHomeSummaryCard />);
    expect(await screen.findByText("42.0 km")).toBeInTheDocument();
    expect(screen.getByText("1.0 h")).toBeInTheDocument();
    expect(screen.queryByText(/9999/)).not.toBeInTheDocument();
    mocks.fetch.mockResolvedValueOnce(envelope("failed"));
    mocks.user = { uid: "a" };
    view.rerender(<CanonicalHomeSummaryCard />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("마지막으로 확정된"));
    expect(screen.getByText("42.0 km")).toBeInTheDocument();
  });
  it("first failure shows an error, not fabricated zero distance", async () => {
    mocks.fetch.mockResolvedValueOnce(envelope("failed"));
    render(<CanonicalHomeSummaryCard />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("0.0 km")).not.toBeInTheDocument();
  });
});
