import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatBlock from "./StatBlock";

/**
 * 낡은 서버 집계는 값을 숨기지 않되 최신인 척하지도 않는다 — 값 옆 칩이 그 표식이다
 * (TrainingStatusCard 의 stale 칩과 같은 규칙, #2237).
 */
describe("StatBlock 칩", () => {
  it("칩을 주면 값 옆에 표식이 붙는다", () => {
    render(<StatBlock label="거리" value="42.0" unit="km" chip="이전 집계" />);
    expect(screen.getByText("42.0")).toBeInTheDocument();
    expect(screen.getByText("이전 집계")).toBeInTheDocument();
  });

  it("칩이 없으면 아무것도 붙지 않는다 — 오늘의 KPI 그대로", () => {
    render(<StatBlock label="거리" value="42.0" unit="km" sub="최근 7일" />);
    expect(screen.queryByText("이전 집계")).not.toBeInTheDocument();
    expect(screen.getByText("최근 7일")).toBeInTheDocument();
  });

  it("빈 문자열 칩은 그리지 않는다", () => {
    const { container } = render(<StatBlock label="거리" value="—" chip="" />);
    expect(container.textContent).toBe("거리—");
  });
});
