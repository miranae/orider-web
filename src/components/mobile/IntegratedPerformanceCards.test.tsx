import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { buildRunEvidence } from "../../features/fitness/multisportPerformance";
import type { LoadFocusResult } from "../../features/fitness/multisportPerformance";
import IntegratedLoadCard from "./IntegratedLoadCard";
import SportPerformanceCard from "./SportPerformanceCard";

const focus: LoadFocusResult = {
  windowDays: 28,
  totalLoad: 100,
  buckets: { baseAerobic: 40, highAerobic: 30, highIntensity: 20, unclassified: 10 },
  sourceLoad: { power: 60, heartRate: 30, unclassified: 10 },
  disciplineLoad: { bike: 60, run: 30, swim: 0, other: 10 },
  activityCount: 4,
  coveragePct: 90,
  confidence: "high",
  hasAnaerobicBikeDetail: true,
};

describe("IntegratedLoadCard", () => {
  it("keeps the combined status, normalized contribution and focus summaries visible", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 42,
      atl: 38,
      tsb: 4,
      contributions: [
        { discipline: "bike", ctl: 30 },
        { discipline: "run", ctl: 10 },
        { discipline: "swim", ctl: 2 },
      ],
    }} focus={focus} />);

    expect(screen.getByRole("region", { name: /통합 멀티스포츠 훈련 상태/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "통합 멀티스포츠 상태" })).toBeInTheDocument();
    expect(screen.getByText("42.0")).toBeInTheDocument();
    expect(screen.getByText("+4.0")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /현재 체력 종목 기여도: 사이클 30.0, 71퍼센트/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /최근 28일 부하 포커스: 기초 유산소 40.0, 40퍼센트/ })).toBeInTheDocument();
    expect(screen.getByText("주요 부하 · 기초 유산소")).toBeInTheDocument();
    expect(screen.getByText("분류 커버리지 90% · 신뢰도 높음")).toBeInTheDocument();
    expect(screen.queryByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).not.toBeInTheDocument();
  });

  it("keeps values static and opens contribution and focus explanations only by activation", () => {
    renderWithProviders(<IntegratedLoadCard condition combined={{ ctl: 40, atl: 35, tsb: 5, contributions: [{ discipline: "bike", ctl: 40 }] }} focus={focus} />);
    const bike = screen.getByRole("button", { name: "사이클", exact:true });
    fireEvent.pointerEnter(bike); fireEvent.focus(bike);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(bike);
    expect(screen.getByRole("tooltip")).toHaveTextContent("40.0");
    fireEvent.keyDown(bike, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기초 유산소", exact:true }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("28일");
    expect(screen.getByRole("tooltip")).toHaveTextContent("40%");
    expect(screen.getByText("40.0 · 40%")).toBeVisible();
  });

  it("keeps methodology closed until the accessible details control is opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 42, atl: 38, tsb: 4, contributions: [],
    }} focus={focus} />);

    const toggle = screen.getByRole("button", { name: "계산 방법과 해석 근거", exact:true });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).not.toBeInTheDocument();

    await user.click(toggle!);
    expect(screen.getByText(/파워 부하 60.0 · 심박 부하 30.0 · 미분류 10.0/)).toBeVisible();
    expect(screen.getByText(/서버에서 계산한 CTL/)).toBeVisible();
  });

  it("keeps authoritative totals visible while marking unavailable canonical focus", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 42, atl: 38, tsb: 4, contributions: [],
    }} focus={null} />);

    expect(screen.getByText("42.0")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("서버 정본이 부하 포커스를 제공하지 않아 현재 표시할 수 없습니다.");
    expect(screen.queryByText("분류 0% · 없음")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /부하 포커스/ })).not.toBeInTheDocument();
    expect(screen.queryByText("계산 방법과 해석 근거")).not.toBeInTheDocument();
  });

  it("sanitizes missing, negative, and non-finite breakdown values", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: 0,
      atl: 0,
      tsb: 0,
      contributions: [
        { discipline: "bike", ctl: Number.NaN },
        { discipline: "run", ctl: -4 },
      ],
    }} focus={{
      ...focus,
      windowDays: Number.NaN,
      totalLoad: Number.NaN,
      buckets: { baseAerobic: Number.NaN, highAerobic: -5, highIntensity: 0, unclassified: 0 },
      sourceLoad: { power: Number.NaN, heartRate: -2, unclassified: 0 },
      coveragePct: Number.NaN,
      confidence: "none",
    }} />);

    expect(screen.getByRole("img", { name: /종목별 체력 기여 데이터 없음/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /최근 28일 부하 포커스: 분류된 부하 없음/ })).toBeInTheDocument();
    expect(screen.getByText("분류 0% · 없음")).toBeInTheDocument();
    expect(screen.queryByText("CTL 0.0 · 0%")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getAllByText("0.0 · 0%")).toHaveLength(4);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|-5\.0|-4\.0/);
  });

  it("distinguishes known zero contribution from absent sport evidence", () => {
    renderWithProviders(<IntegratedLoadCard combined={{ ctl: 0, atl: 0, tsb: 0, contributions: [{ discipline: "bike", ctl: 0 }] }} focus={null} />);
    expect(screen.getByText("CTL 0.0 · 0%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "러닝", exact:true }).closest(".ds-card")).toHaveTextContent("—");
    expect(screen.queryByRole("button", { name: /수영/ })).not.toBeInTheDocument();
  });

  it("does not render non-finite authoritative totals", () => {
    const { container } = renderWithProviders(<IntegratedLoadCard combined={{
      ctl: Number.NaN,
      atl: 38,
      tsb: 4,
      contributions: [],
    }} focus={focus} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("clamps authoritative CTL and ATL to zero while preserving signed TSB", () => {
    renderWithProviders(<IntegratedLoadCard combined={{
      ctl: -12,
      atl: -3,
      tsb: -9,
      contributions: [],
    }} focus={focus} />);

    expect(screen.getAllByText("0.0")).toHaveLength(2);
    expect(screen.getByText("-9.0")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("-12.0");
    expect(document.body.textContent).not.toContain("-3.0");
  });
});

describe("SportPerformanceCard", () => {
  it("renders partial cycling evidence without zero-filling missing axes", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="bike"
      cycling={{
        windowDays: 90,
        activityCount: 3,
        confidence: "low",
        axes: [
          { key: "anaerobic", score: null, confidence: "none", evidence: [] },
          { key: "aerobic", score: 65, confidence: "low", evidence: [{ duration: "5m", watts: 320, wPerKg: 4.4, percentile: 65 }] },
          { key: "endurance", score: null, confidence: "none", evidence: [] },
        ],
      }}
      run={{ thresholdPaceSec: null, records: [] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);

    expect(screen.getAllByText("실측 근거 부족 · 점수 미산출")).toHaveLength(2);
    expect(screen.getByText(/5m 320W · 4.40W\/kg/)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "유산소 역량 점수" })).toHaveAttribute("aria-valuenow", "65");
    expect(screen.getByRole("meter", { name: "유산소 역량 점수" })).toHaveAttribute("aria-valuetext", "역량 점수 65/100, 우수 단계");
    expect(screen.getByText("역량 점수 65/100")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/상위 \d+%|O-Rider 전체|밀도|표본/);
    expect(screen.getByText("현재 가장 두드러진 능력은 유산소 역량입니다.")).toBeInTheDocument();
    expect(screen.getByText(/Garmin은 EPOC·Training Effect/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PDC와 3축 산출 근거 보기" })).toHaveAttribute("href", "/web-manual/ch06-advanced.html#s6-3");
  });

  it("omits the strongest-axis summary when the highest score is tied", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="bike"
      cycling={{
        windowDays: 90,
        activityCount: 4,
        confidence: "medium",
        axes: [
          { key: "anaerobic", score: 70, confidence: "medium", evidence: [] },
          { key: "aerobic", score: 70, confidence: "medium", evidence: [] },
          { key: "endurance", score: 55, confidence: "low", evidence: [] },
        ],
      }}
      run={{ thresholdPaceSec: null, records: [] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);

    expect(screen.queryByText(/현재 가장 두드러진 능력은/)).not.toBeInTheDocument();
  });

  it("shows only persisted running records and threshold evidence", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="run"
      cycling={null}
      run={{ thresholdPaceSec: 285, records: [{ distance: "5km", seconds: 1250, date: "2026-07-10", activityId: "qualified", startTime: 1783641600000, qualification: "source_qualified", unit: "seconds" }] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);
    expect(screen.getByText("4:45/km")).toBeInTheDocument();
    expect(screen.getByText("20:50 · 2026-07-10")).toBeInTheDocument();
    expect(screen.queryByText(/curve/i)).not.toBeInTheDocument();
  });

  it("carries rounded seconds into the next minute and hour", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="run"
      cycling={null}
      run={{ thresholdPaceSec: 359.6, records: [{ distance: "5km", seconds: 3599.6, date: "2026-07-10", activityId: "qualified", startTime: 1783641600000, qualification: "source_qualified", unit: "seconds" }] }}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }}
    />);

    expect(screen.getByText("6:00/km")).toBeInTheDocument();
    expect(screen.getByText("1:00:00 · 2026-07-10")).toBeInTheDocument();
    expect(screen.queryByText(/:60/)).not.toBeInTheDocument();
  });

  it("hides unqualified times and exposes original activity links in a folded section", async () => {
    const run = buildRunEvidence(null, {
      "5km": [{ value: 206, date: "2023-11-03", activityId: "source/id", startTime: 1698969600000, context: "Ride" }],
    });
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null} run={run}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.getByText("원본 적격성이 확인된 거리 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/3:26|206/)).not.toBeInTheDocument();
    const summary = screen.getByText("거리 기록 1개 · 확인 가능한 활동 1개");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    await userEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /2023-11-03/ })).toHaveAttribute("href", "/ko/activity/source%2Fid");
    expect(screen.getByText("기록 시간은 출처 확인 전 표시하지 않습니다.")).toBeInTheDocument();
  });

  it("groups four distances by actual source ID with one original link and exact counts", () => {
    const run = buildRunEvidence(null, Object.fromEntries(["1km", "5km", "10km", "half"].map(distance => [distance, [{ value: 206, date: "2023-11-03", activityId: "same/id", startTime: 1 }]])));
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null} run={run}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.getByText("거리 기록 4개 · 확인 가능한 활동 1개")).toBeInTheDocument();
    expect(screen.getByText("1km · 5km · 10km · 하프")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { hidden: true });
    expect(links).toHaveLength(1); expect(links[0]).toHaveAttribute("href", "/ko/activity/same%2Fid");
    expect(screen.queryByText(/3:26|206/)).not.toBeInTheDocument();
  });

  it("groups an identical activity ID across different saved dates", () => {
    const run = buildRunEvidence(null, {
      "1km": [{ value: 39, date: "2023-11-03", activityId: "same", startTime: 1 }],
      "5km": [{ value: 206, date: "2023-11-04", activityId: "same", startTime: 1 }],
    });
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null} run={run}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.getByText("거리 기록 2개 · 확인 가능한 활동 1개")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(1);
    expect(screen.getByText(/2023-11-03 · 2023-11-04/)).toBeInTheDocument();
  });

  it("retains distinct activity IDs on the same date as separate sources", () => {
    const run = buildRunEvidence(null, {
      "1km": [{ value: 39, date: "2023-11-03", activityId: "first", startTime: 1 }],
      "5km": [{ value: 206, date: "2023-11-03", activityId: "second", startTime: 1 }],
    });
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null} run={run}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.getByText("거리 기록 2개 · 확인 가능한 활동 2개")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { hidden: true }).map(link => link.getAttribute("href"))).toEqual(["/ko/activity/first", "/ko/activity/second"]);
  });

  it("keeps unlinked records separate without inventing activity IDs or links", () => {
    const run = buildRunEvidence(null, {
      "1km": [{ value: 39, date: "2023-11-03", activityId: "", startTime: 1 }],
      "5km": [{ value: 206, date: "2023-11-03", activityId: " ", startTime: 1 }],
    });
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null} run={run}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.getByText("거리 기록 2개 · 확인 가능한 활동 0개")).toBeInTheDocument();
    expect(screen.queryByRole("link", { hidden: true })).not.toBeInTheDocument();
    expect(screen.getAllByText(/원본 활동 정보 없음/)).toHaveLength(2);
    expect(screen.queryByText("1km · 5km")).not.toBeInTheDocument();
  });

  it("never renders bare legacy numbers as qualified seconds, even when supplied directly", () => {
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null}
      run={{ thresholdPaceSec: null, records: [{ distance: "5km", seconds: 206, date: "2023-11-03" }] } as never}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.queryByText(/3:26/)).not.toBeInTheDocument();
    expect(screen.getByText("원본 적격성이 확인된 거리 기록이 없습니다.")).toBeInTheDocument();
  });

  it.each([
    { qualification: "legacy_unverified", unit: "seconds", activityId: "other", startTime: 1 },
    { qualification: "source_qualified", unit: "milliseconds", activityId: "other", startTime: 1 },
    { qualification: "source_qualified", unit: "seconds", activityId: "", startTime: 1 },
    { qualification: "source_qualified", unit: "seconds", activityId: "other", startTime: Number.NaN },
  ])("does not render a record with unqualified source or unit (%j)", metadata => {
    renderWithProviders(<SportPerformanceCard discipline="run" cycling={null}
      run={{ thresholdPaceSec: null, records: [{ distance: "5km", seconds: 206, date: "2023-11-03", ...metadata }] } as never}
      swim={{ windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }} />);
    expect(screen.queryByText(/3:26/)).not.toBeInTheDocument();
    expect(screen.getByText("원본 적격성이 확인된 거리 기록이 없습니다.")).toBeInTheDocument();
  });

  it("states the explicit swim evidence period in the rendered contract", () => {
    renderWithProviders(<SportPerformanceCard
      discipline="swim"
      cycling={null}
      run={{ thresholdPaceSec: null, records: [] }}
      swim={{ windowDays: 90, cssSecPer100m: 95, swolfAvg: 40, distancePerStrokeM: 1.3, activityCount: 2 }}
    />);

    expect(screen.getByText(/최근 90일의 측정 수영 효율/)).toBeInTheDocument();
  });
});
