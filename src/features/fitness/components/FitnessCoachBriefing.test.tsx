import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { ActivityImpactEntry, Fitness48HourForecast } from "../activityImpact";
import FitnessCoachBriefing from "./FitnessCoachBriefing";

function impact(id: string, day: number, load: number): ActivityImpactEntry {
  const ctl = load / 42;
  const atl = load / 7;
  return {
    activity: {
      id,
      type: "Ride",
      startTime: Date.UTC(2026, 7, day, 8),
      summary: { distance: load * 500, tss: load },
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

describe("FitnessCoachBriefing", () => {
  it("separates activity-only contribution from the whole-day change", () => {
    renderWithProviders(
      <FitnessCoachBriefing
        impacts={[impact("ride-1", 29, 196)]}
        selectedActivityId="ride-1"
        onSelectActivity={vi.fn()}
        forecast={forecast}
        current={{ ctl: 42, atl: 66, tsb: -24 }}
        decisionSlot={<div>decision slot</div>}
        locale="ko-KR"
        canonicalAvailable
      />,
    );

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

  it("keeps activity selection explicit and exposes both 48-hour scenarios", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <FitnessCoachBriefing
        impacts={[impact("ride-1", 29, 196), impact("ride-2", 28, 84)]}
        selectedActivityId="ride-1"
        onSelectActivity={onSelect}
        forecast={forecast}
        current={{ ctl: 42, atl: 49, tsb: -7 }}
        decisionSlot={<div>decision slot</div>}
        locale="ko-KR"
        canonicalAvailable
      />,
    );

    const activityButtons = screen.getAllByRole("button", { pressed: false });
    fireEvent.click(activityButtons.at(-1)!);
    expect(onSelect).toHaveBeenCalledWith("ride-2");
    expect(screen.getByText("완전 휴식")).toBeInTheDocument();
    expect(screen.getByText(/단순 예시 · 35 TSS 가정/)).toBeInTheDocument();
    expect(screen.getByText("decision slot")).toBeInTheDocument();
  });

  it("keeps a newer activity visible while its canonical daily load is pending", () => {
    const pending = {
      id: "new-ride",
      type: "Ride",
      startTime: Date.UTC(2026, 7, 30, 8),
      summary: { distance: 100_000 },
    } as Activity;
    renderWithProviders(
      <FitnessCoachBriefing
        impacts={[impact("old-ride", 29, 84)]}
        selectedActivityId="new-ride"
        onSelectActivity={vi.fn()}
        forecast={forecast}
        current={{ ctl: 42, atl: 49, tsb: -7 }}
        decisionSlot={<div>decision slot</div>}
        locale="ko-KR"
        canonicalAvailable
        pendingActivity={pending}
      />,
    );

    expect(screen.getByRole("heading", { name: /100.0 km/ })).toBeInTheDocument();
    expect(screen.getAllByText("일일 부하 반영을 기다리는 중").length).toBeGreaterThan(0);
    expect(screen.queryByText("+2.0")).not.toBeInTheDocument();
  });
});
