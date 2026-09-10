import { afterEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LifetimeMilestonesGrid from "./LifetimeMilestonesGrid";
import type { Activity } from "@shared/types";
import type { Milestone, MilestoneId } from "@shared/types/milestone";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

function achieved(...ids: MilestoneId[]): Map<MilestoneId, Milestone> {
  const m = new Map<MilestoneId, Milestone>();
  for (const id of ids) {
    m.set(id, {
      id,
      kind: "cumulative",
      achievedAt: Date.parse("2026-07-10T00:00:00Z"),
      activityId: "a1",
      celebrated: true,
      createdAt: 0,
    });
  }
  return m;
}

function activity(id: string, type: string, distanceMeters: number, startTime: number): Activity {
  return { id, type, startTime, summary: { distance: distanceMeters } } as unknown as Activity;
}

/** 누적 640km(자전거) — 100/500km 는 넘고 1000km 는 아직. */
const rides: Activity[] = [
  activity("a1", "Ride", 123_400, Date.parse("2026-01-02T00:00:00Z")),
  activity("a2", "Ride", 400_000, Date.parse("2026-03-02T00:00:00Z")),
  activity("a3", "Ride", 116_600, Date.parse("2026-05-02T00:00:00Z")),
];

const runs: Activity[] = [activity("r1", "Run", 640_000, Date.parse("2026-01-02T00:00:00Z"))];

describe("LifetimeMilestonesGrid", () => {
  afterEach(() => resetRuntimeConfigForTests());

  describe("플래그 꺼짐(기본) — 클라 판정 유지", () => {
    it("5단 카탈로그(5000/10000km 포함)를 그대로 그린다", () => {
      resetRuntimeConfigForTests({});
      render(<LifetimeMilestonesGrid activities={rides} achieved={achieved()} />);
      for (const label of ["100km", "500km", "1,000km", "5,000km", "10,000km"]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it("서버 문서가 하나도 없어도 클라 누적으로 달성 배지를 그린다", () => {
      resetRuntimeConfigForTests({});
      render(<LifetimeMilestonesGrid activities={rides} achieved={achieved()} />);
      expect(screen.getAllByTestId("lifetime-milestone-achieved")).toHaveLength(2);
      expect(screen.queryAllByTestId("lifetime-milestone-pending")).toHaveLength(0);
    });

    it("서버 구독 대기 중이어도 배지를 숨기지 않는다 — 클라 판정은 즉시 확정된다", () => {
      resetRuntimeConfigForTests({});
      render(<LifetimeMilestonesGrid activities={rides} achieved={achieved()} loading />);
      expect(screen.queryByTestId("lifetime-milestones-loading")).not.toBeInTheDocument();
      expect(screen.getByText("100km")).toBeInTheDocument();
    });
  });

  describe("플래그 켜짐 — 서버 판정", () => {
    it("서버 원장이 못 미치는 종목(자전거)은 잠금이 아니라 '집계 준비 중'", () => {
      resetRuntimeConfigForTests({ canonicalMilestonesEnabled: true });
      render(<LifetimeMilestonesGrid activities={rides} achieved={achieved()} />);
      expect(screen.getAllByTestId("lifetime-milestone-pending")).toHaveLength(3);
      expect(screen.queryAllByTestId("lifetime-milestone-locked")).toHaveLength(0);
      expect(screen.getAllByText("집계 준비 중")).toHaveLength(3);
    });

    it("서버가 판정한 배지만 달성일을 보여준다", () => {
      resetRuntimeConfigForTests({ canonicalMilestonesEnabled: true });
      render(<LifetimeMilestonesGrid activities={runs} achieved={achieved("cumulative_100km")} />);
      expect(screen.getAllByText("2026.7.10")).toHaveLength(1);
      // 러닝만 있으면 서버 원장이 판정 가능 — 나머지는 잠금이 맞다.
      expect(screen.getAllByTestId("lifetime-milestone-locked")).toHaveLength(2);
    });

    it("구독 응답 전에는 배지를 그리지 않는다 — 모름을 미달성으로 그리지 않기 위해", () => {
      resetRuntimeConfigForTests({ canonicalMilestonesEnabled: true });
      render(<LifetimeMilestonesGrid activities={runs} achieved={achieved()} loading />);
      expect(screen.getByTestId("lifetime-milestones-loading")).toBeInTheDocument();
      expect(screen.queryByText("100km")).not.toBeInTheDocument();
    });
  });

  it("누적 합계·최장 라이드는 서버 대응 필드가 없어 화면 집계값을 쓴다", () => {
    resetRuntimeConfigForTests({});
    render(<LifetimeMilestonesGrid activities={rides} achieved={achieved()} />);
    expect(screen.getByText("누적 640km (모든 종목)")).toBeInTheDocument();
    expect(screen.getByText("400.0 km")).toBeInTheDocument();
  });
});
