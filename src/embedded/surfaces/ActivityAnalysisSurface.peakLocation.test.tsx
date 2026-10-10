import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ko from "../../i18n/resources/ko/activity.json";
import ActivityAnalysisSurface from "./ActivityAnalysisSurface";
const fixture = vi.hoisted(() => ({ request: vi.fn(), model: {} }));
vi.mock("../../hooks/useActivityAnalysisModel", () => ({ useActivityAnalysisModel: () => fixture.model }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("../../features/activity/detail/ActivityPersonalBenchmark", () => ({ ActivityPersonalBenchmark: () => null }));
vi.mock("../../features/activity/detail/ActivityGrowthPanel", () => ({ ActivityGrowthPanel: () => null }));
vi.mock("../../features/activity/detail/ActivityOverviewEvidence", () => ({ default: () => null }));
vi.mock("../../features/activity/detail/ActivityDetailedCharts", () => ({ default: () => null }));
vi.mock("../../components/AnalysisTab", () => ({ default: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
  let text: unknown = ko;
  for (const part of key.split(".")) text = (text as Record<string, unknown>)?.[part];
  return typeof text === "string" ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? "")) : key;
} }) }));
describe("embedded peak location", () => {
  it("explains unavailable mapping once already-loaded route cannot cover the selected canonical effort", () => {
    const peak = { durationSec: 60, startOffsetSec: 100, fromKm: 1, toKm: 2, avgPowerW: 250, maxPowerW: 400 };
    const streams = { distance: [0, 100, 200], time: [0, 10, 20], altitude: [0, 1, 2] };
    fixture.model = { activity: { id: "a" }, isActivityOwner: true, sport: "ride", streams, effectiveStreams: streams,
      requestStreams: fixture.request, serverMetrics: { metrics: { discipline: "bike", isVirtualPower: false,
        computedAt: 1, peakEfforts: { peaks: [peak], highlight: peak, indexAxis: "route" } } },
      overview: { loading: false, response: { status: "available" } }, analysisTabProps: {}, loadingStreams: false };
    render(<ActivityAnalysisSurface activityId="a" retryKey={0} onReady={vi.fn()} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "최고 노력 자세히 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "차트에서 구간 보기" }));
    expect(screen.queryByRole("button", { name: "차트에서 구간 보기" })).not.toBeInTheDocument();
    expect(screen.getByText(ko.peakInspector.noLocation)).toBeInTheDocument();
    expect(fixture.request).not.toHaveBeenCalled();
  });
});
