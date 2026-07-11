import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MilestonesGrid from "./MilestonesGrid";
import type { Milestone, MilestoneId } from "@shared/types/milestone";

function achieved(...ids: MilestoneId[]): Map<MilestoneId, Milestone> {
  const m = new Map<MilestoneId, Milestone>();
  for (const id of ids) {
    m.set(id, {
      id,
      kind: "distance",
      achievedAt: Date.parse("2026-07-10T00:00:00Z"),
      activityId: "a1",
      celebrated: true,
      createdAt: 0,
    });
  }
  return m;
}

describe("MilestonesGrid", () => {
  it("카탈로그 4종을 모두 표시한다 (달성·미달성 무관)", () => {
    render(<MilestonesGrid achieved={achieved()} />);
    expect(screen.getByText("첫 5km")).toBeInTheDocument();
    expect(screen.getByText("첫 10km")).toBeInTheDocument();
    expect(screen.getByText("첫 하프")).toBeInTheDocument();
    expect(screen.getByText("첫 풀코스")).toBeInTheDocument();
  });

  it("달성한 마일스톤은 달성일을 보여준다", () => {
    render(<MilestonesGrid achieved={achieved("first_5km")} />);
    expect(screen.getByText("2026.7.10")).toBeInTheDocument();
  });

  it("미달성 마일스톤은 날짜가 없다", () => {
    render(<MilestonesGrid achieved={achieved("first_5km")} />);
    // 5km 하나만 달성 → 날짜 1개
    expect(screen.getAllByText(/2026\./)).toHaveLength(1);
  });

  it("아무것도 달성 안 해도 4종 자리를 남긴다", () => {
    render(<MilestonesGrid achieved={achieved()} />);
    expect(screen.getByText("첫 풀코스")).toBeInTheDocument();
    expect(screen.queryByText(/2026\./)).not.toBeInTheDocument();
  });

  it("누적 마일스톤도 카탈로그에 표시한다 (거리 4 + 누적 3)", () => {
    render(<MilestonesGrid achieved={achieved()} />);
    expect(screen.getByText("누적 100km")).toBeInTheDocument();
    expect(screen.getByText("누적 1000km")).toBeInTheDocument();
  });

  it("누적 마일스톤 달성 시 달성일 표시", () => {
    render(<MilestonesGrid achieved={achieved("cumulative_100km")} />);
    expect(screen.getByText("2026.7.10")).toBeInTheDocument();
    expect(screen.getByText("누적 100km")).toBeInTheDocument();
  });

});
