import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import { ActivityGrowthPanel } from "./ActivityGrowthPanel";
import { activityPeriods } from "./activityGrowth";
const mocks = vi.hoisted(() => ({ user: { uid: "owner" } as { uid: string } | null, language: "ko", units: "metric", history: vi.fn(), metrics: vi.fn() }));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
vi.mock("../../../hooks/useActivityGrowthHistory", () => ({ useActivityGrowthHistory: mocks.history }));
vi.mock("../../../hooks/useActivityMetrics", () => ({ useActivityMetrics: mocks.metrics }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: mocks.language }, t: (key: string, params?: Record<string, unknown>) => {
  let text: unknown = mocks.language === "ko" ? ko : en;
  for (const part of key.split(".")) text = (text as Record<string, unknown>)?.[part];
  return typeof text === "string" ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? "")) : key;
} }) }));
const activity = { id: "current", userId: "owner", startTime: 100, type: "Run", summary: {} } as Activity;
const previous = { ...activity, id: "previous", startTime: 50, description: "earlier" };
beforeEach(() => {
  mocks.user = { uid: "owner" }; mocks.language = "ko"; mocks.units = "metric";
  mocks.history.mockReset().mockReturnValue({ activities: [previous, { ...previous, id: "bike", type: "Ride" }], sourceActivities: [], coverage: "ready", loading: false, error: false, hasMore: false });
  mocks.metrics.mockReset().mockReturnValue({ status: "missing", metrics: null });
});
describe("ActivityGrowthPanel", () => {
  it("keeps both history and selected metrics requests lazy and reuses opened sections", () => {
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.metrics).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    expect(mocks.history).toHaveBeenCalledWith("comparison", 0);
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole("option", { name: /Ride/ })).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(mocks.metrics).toHaveBeenLastCalledWith("previous");
    expect(screen.getByText("이 기록의 확정 분석 수치가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "비교 해제" }));
    expect(mocks.metrics).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    expect(screen.getByRole("combobox")).toHaveValue("");
  });
  it("never exposes owner history in a public or foreign-owner activity", () => {
    const r = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner={false} />);
    expect(r.container).toBeEmptyDOMElement(); expect(mocks.history).not.toHaveBeenCalled();
    r.rerender(<ActivityGrowthPanel activity={{ ...activity, userId: "foreign" }} metrics={null} isOwner />);
    expect(r.container).toBeEmptyDOMElement(); expect(mocks.history).not.toHaveBeenCalled();
  });
  it("resets selection when the activity changes", () => {
    const r = render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    r.rerender(<ActivityGrowthPanel activity={{ ...activity, id: "other" }} metrics={null} isOwner />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("renders translated partial coverage and withholds statistics totals", () => {
    mocks.language = "en";
    mocks.history.mockReturnValue({ sourceActivities: [previous], activities: [], coverage: "partial" });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "Activity statistics" }));
    expect(screen.getByText("Only 1 loaded activities are confirmed. Full totals and changes are withheld.")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBe(8); expect(screen.queryByRole("img")).toBeNull();
  });
  it.each(["current", "previous"])("hides curve and zone comparisons for pending %s input", (side) => {
    const ready = { avgPower: 200, mmp: { "1m": 300 }, hrZoneSec: [10, 20], powerZoneSec: [20, 30] };
    const pending = { ...ready, inputCoverage: "pending" as const };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: side === "previous" ? pending : ready });
    render(<ActivityGrowthPanel activity={activity} metrics={side === "current" ? pending : ready} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.queryByText("심박 존 분포")).toBeNull(); expect(screen.queryByText("지속시간별 최대 파워")).toBeNull();
  });
  it("selects canonical common-duration values by graph or accessible control and resets baseline selection", () => {
    const metrics = { speedCurve: { "1m": 12, "5m": 10 }, hrZoneSec: [10, 20, 30, 0, 0] };
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { ...metrics, speedCurve: { "1m": 10, "5m": 8 } } });
    const r = render(<ActivityGrowthPanel activity={activity} metrics={metrics} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    const durationControl = screen.getByRole("combobox", { name: "비교할 지속시간" });
    expect(durationControl).toHaveValue("300");
    expect(screen.getByRole("img", { name: "지속시간별 최고 페이스" })).toBeInTheDocument();
    fireEvent.click(r.container.querySelector('[data-duration="60"]')!);
    expect(durationControl).toHaveValue("60");
    expect(screen.getByText("-60 s/km")).toBeInTheDocument();
    fireEvent.change(durationControl, { target: { value: "300" } });
    expect(screen.getByText("-90 s/km")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "비교 해제" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.getByRole("combobox", { name: "비교할 지속시간" })).toHaveValue("300");
    expect(screen.getByText("파워 분석 없음", { exact: false })).toBeInTheDocument();
  });
  it("converts running curve values and neutral deltas to imperial pace", () => {
    mocks.units = "imperial";
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { speedCurve: { "5m": 8 } } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ speedCurve: { "5m": 10 } }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.getByText("-145 s/mi")).toBeInTheDocument();
    expect(screen.getAllByText("9:39").length).toBeGreaterThan(0);
  });
  it("withholds a power overlay for differing sources while retaining independently labeled zones", () => {
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { isVirtualPower: true, mmp: { "5m": 200 }, powerZoneSec: [10, 20, 0, 0, 0, 0, 0] } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ isVirtualPower: false, mmp: { "5m": 250 }, powerZoneSec: [10, 20, 0, 0, 0, 0, 0] }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.queryByRole("img", { name: "지속시간별 최대 파워" })).toBeNull();
    expect(screen.getByText("파워 존 분포")).toBeInTheDocument();
    expect(screen.getByText(/파워 출처가 같고 확인된/)).toBeInTheDocument();
  });
  it("does not render partial or invalid zone distributions as zeros", () => {
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { hrZoneSec: [10, 20, 0, 0, 0] } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ hrZoneSec: [10, Number.NaN, 0, 0, 0], powerZoneSec: [10, 20], hrZoneBoundaries: null }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.getByText("심박 존 분포")).toBeInTheDocument();
    expect(screen.queryByText("파워 존 분포")).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });
  it.each([
    [0, 0, 0, 0, 0], [-1, 10, 0, 0, 0], Object.assign(Array(5), { 0: 10 }),
  ])("withholds zero-total, negative or sparse canonical zones (%s)", (...hrZoneSec) => {
    mocks.metrics.mockReturnValue({ status: "ready", metrics: {} });
    render(<ActivityGrowthPanel activity={activity} metrics={{ hrZoneSec }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.queryByText("심박 존 분포")).toBeNull();
  });
  it("offers a retry when statistics fail", () => {
    const retry = vi.fn();
    mocks.history.mockReturnValue({ sourceActivities: [], coverage: "error", error: true, retry });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["metric", -0.04, "0.0 km"], ["metric", 0.04, "0.0 km"],
    ["imperial", -0.08, "0.0 mi"], ["imperial", 0.08, "0.0 mi"],
    ["metric", -0.12, "-0.1 km"], ["metric", 0.12, "+0.1 km"],
    ["imperial", -0.16, "-0.1 mi"], ["imperial", 0.16, "+0.1 mi"],
  ])("signs comparison changes at displayed precision after %s conversion (delta=%s)", (units, delta, displayed) => {
    mocks.units = String(units);
    mocks.metrics.mockReturnValue({ status: "ready", metrics: { distanceKm: 10 } });
    render(<ActivityGrowthPanel activity={activity} metrics={{ distanceKm: 10 + Number(delta) }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === `변화 ${displayed}`)).toBeInTheDocument();
  });
  it.each([-40, 40])("shows a subprecision statistics distance change without a sign (delta=%s m)", (delta) => {
    const periods = activityPeriods(Date.now(), "week");
    mocks.history.mockReturnValue({ activities: [], coverage: "ready", sourceActivities: [
      { ...activity, id: "this-week", startTime: periods.start, summary: { distance: 10000 + delta } },
      { ...activity, id: "previous-week", startTime: periods.previousStart, summary: { distance: 10000 } },
    ] });
    render(<ActivityGrowthPanel activity={activity} metrics={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "활동 통계" }));
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "지난 기간 10.0 · 변화 0.0")).toBeInTheDocument();
    expect(screen.queryByText(/[-+]0.0/)).not.toBeInTheDocument();
  });
  it("honors imperial units without replacing missing metrics", () => {
    mocks.units = "imperial";
    render(<ActivityGrowthPanel activity={activity} metrics={{ avgSpeedKph: 12, distanceKm: 5 }} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "지난 활동과 비교" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "previous" } });
    expect(screen.getByText("거리 · mi")).toBeInTheDocument(); expect(screen.getByText("8:03")).toBeInTheDocument();
  });
});
