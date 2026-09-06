import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { ActivityImpactEntry, Fitness48HourForecast } from "../activityImpact";
import FitnessCoachBriefing from "./FitnessCoachBriefing";

function impact(id: string, day: number, load: number, activityOverrides: Partial<Activity> = {}): ActivityImpactEntry {
  const ctl = load / 42;
  const atl = load / 7;
  return {
    activity: {
      id,
      type: "Ride",
      startTime: Date.UTC(2026, 7, day, 8),
      summary: { distance: load * 500, tss: load, ridingTimeMillis: 7_200_000 },
      ...activityOverrides,
    } as Activity,
    date: `2026-08-${day}`,
    attributedLoad: load,
    canonicalDailyLoad: load,
    confidence: "canonical-single",
    marginalImpact: { ctl, atl, tsb: ctl - atl },
    actualDayChange: { ctl: 2, atl: 8, tsb: -6 },
    daysSince: 0,
    remainingContribution: { ctl, atl, tsb: ctl - atl },
  };
}

const forecast = {
  rest: [
    { date: "2026-08-30", hoursAhead: 24, ctl: 40, atl: 42, tsb: -2, dailyLoad: 0 },
    { date: "2026-08-31", hoursAhead: 48, ctl: 39, atl: 36, tsb: 3, dailyLoad: 0 },
  ],
  easy: [
    { date: "2026-08-30", hoursAhead: 24, ctl: 41, atl: 47, tsb: -6, dailyLoad: 35 },
    { date: "2026-08-31", hoursAhead: 48, ctl: 40, atl: 40, tsb: 0, dailyLoad: 0 },
  ],
} as Fitness48HourForecast;

function renderBriefing(overrides: Partial<React.ComponentProps<typeof FitnessCoachBriefing>> = {}) {
  return renderWithProviders(
    <FitnessCoachBriefing
      impacts={[impact("ride-1", 29, 196)]}
      selectedActivityId="ride-1"
      onSelectActivity={vi.fn()}
      forecast={forecast}
      current={{ ctl: 42, atl: 66, tsb: -24 }}
      decisionSlot={<div>decision slot</div>}
      locale="ko-KR"
      canonicalAvailable
      discipline="bike"
      {...overrides}
    />,
  );
}

describe("FitnessCoachBriefing", () => {
  it.each([0, 154])("shows a day-only load of %s without inventing a marginal contribution or blocking choices", (dailyLoad) => {
    const newest = impact("newest", 29, 63).activity;
    renderBriefing({
      impacts: [], selectedActivityId: newest.id, pendingActivity: newest,
      pendingDayLoad: { dailyLoad },
    });
    expect(screen.getAllByText(`이날 일일 부하 ${dailyLoad} TSS · 개별 활동의 기여도는 정보 부족으로 구분할 수 없습니다.`)).toHaveLength(2);
    expect(screen.getByText("기존 일일 합계 기준 예상이며, 개별 활동 반영 여부를 확인한 결과는 아닙니다.")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "오늘의 운동 선택" })).not.toBeDisabled();
    expect(screen.getByText(/24시간 뒤 예상/)).toBeInTheDocument();
    expect(screen.queryByText("일일 부하 반영을 기다리는 중")).not.toBeInTheDocument();
    expect(document.querySelector("[data-pending]")).toBeNull();
    expect(document.querySelector("[data-day-load-available]")).not.toBeNull();
  });
  it("separates activity-only contribution from the whole-day change", () => {
    renderBriefing();

    expect(screen.getByRole("heading", { name: "부하 지표상, 오늘은 회복을 흡수하는 날" })).toBeInTheDocument();
    expect(screen.getByText("+4.7")).toBeInTheDocument();
    expect(screen.getByText("+28.0")).toBeInTheDocument();
    expect(screen.getByText("-23.3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "하루 상태 변화" }));
    expect(screen.getByText("+2.0")).toBeInTheDocument();
    expect(screen.getByText("+8.0")).toBeInTheDocument();
    expect(screen.getByText("-6.0")).toBeInTheDocument();
    expect(screen.getByText(/자연 감소와 같은 날의 모든 활동/)).toBeInTheDocument();
  });

  it("initializes the choice from TSB and updates both EMA forecast horizons", () => {
    renderBriefing({ current: { ctl: 42, atl: 49, tsb: -10.6 } });

    expect(screen.getByRole("radio", { name: /회복 라이딩/ })).toBeChecked();
    expect(screen.getByText(/ATL 44.9/)).toBeInTheDocument();
    expect(screen.getByText(/ATL 38.4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /이지 지구력 라이딩/ }));
    expect(screen.getByText(/ATL 48.4/)).toBeInTheDocument();
    expect(screen.getByText(/ATL 41.5/)).toBeInTheDocument();
  });

  it("resets the choice when same-day canonical fitness values are recalculated", async () => {
    const view = renderBriefing({ current: { ctl: 42, atl: 49, tsb: -7 } });
    expect(screen.getByRole("radio", { name: /이지 지구력 라이딩/ })).toBeChecked();

    view.rerender(
      <FitnessCoachBriefing
        impacts={[impact("ride-1", 29, 196)]}
        selectedActivityId="ride-1"
        onSelectActivity={vi.fn()}
        forecast={forecast}
        current={{ ctl: 43, atl: 67, tsb: -24 }}
        decisionSlot={<div>decision slot</div>}
        locale="ko-KR"
        canonicalAvailable
        discipline="bike"
      />,
    );

    await waitFor(() => expect(screen.getByRole("radio", { name: /완전 휴식/ })).toBeChecked());
  });

  it("keeps plan and safety evidence in a collapsed secondary section", () => {
    renderBriefing();
    const details = screen.getByText("계획·안전 근거 확인").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByText("decision slot"));
  });

  it("uses persisted workout analysis and keeps its confidence separate from load attribution", () => {
    const metrics = {
      workoutType: "interval",
      workoutTypeConfidence: 0.91,
      if: 0.86,
      durationSec: 5_400,
      avgHr: 151,
      decoupling: { decouplingPct: 4.1 },
      contextSnapshot: { ftp: 250 },
    } as ActivityMetrics;
    renderBriefing({ metricsMap: new Map([["ride-1", metrics]]) });

    expect(screen.getByText("인터벌 자극")).toBeInTheDocument();
    expect(screen.getByText("서버 활동 분석")).toBeInTheDocument();
    expect(screen.getByText("훈련유형 신뢰도 91%")).toBeInTheDocument();
    expect(screen.getByText("일일 정본 부하")).toBeInTheDocument();
    expect(screen.getByText("심박 기록 있음")).toBeInTheDocument();
  });

  it("requires a registered device instead of pretending a G1 transfer and keeps rest local", () => {
    renderBriefing({ current: { ctl: 42, atl: 49, tsb: -10.6 } });

    expect(screen.getByText(/G1 워크아웃 수신 기능을 안전하게 준비/)).toBeInTheDocument();
    expect(screen.queryByText("G1 수신 확인")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /완전 휴식/ }));
    expect(screen.getByRole("button", { name: "오늘 선택 확인" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("기기로 보내지 않습니다");
  });

  it("keeps a pending activity visible without asserting a workout stimulus", () => {
    const pending = {
      id: "new-ride",
      type: "Ride",
      startTime: Date.UTC(2026, 7, 30, 8),
      summary: { distance: 100_000, ridingTimeMillis: 10_000_000, normalizedPower: 190 },
    } as Activity;
    renderBriefing({
      impacts: [impact("old-ride", 29, 84)],
      selectedActivityId: "new-ride",
      current: { ctl: 42, atl: 49, tsb: -7 },
      pendingActivity: pending,
    });

    expect(screen.getByRole("heading", { name: /100.0 km/ })).toBeInTheDocument();
    expect(screen.getAllByText("일일 부하 반영을 기다리는 중").length).toBeGreaterThan(0);
    expect(screen.getByText("판단할 근거가 부족해요")).toBeInTheDocument();
    expect(screen.getByText("분류 근거 부족")).toBeInTheDocument();
    expect(screen.queryByText(/^IF /)).not.toBeInTheDocument();
    expect(screen.queryByText("지구력 자극")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "오늘의 운동 선택" })).toBeDisabled();
    expect(screen.queryByText(/24시간 뒤 예상/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "G1 전송 준비" })).not.toBeInTheDocument();
  });

  it("uses the explicit page discipline when there is no selected activity", () => {
    renderBriefing({ impacts: [], selectedActivityId: null, discipline: "run" });

    expect(screen.getByRole("radio", { name: /가벼운 회복 조깅/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "G1 전송 준비" })).not.toBeInTheDocument();
  });
});
