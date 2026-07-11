import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WeeklyRecapCard from "./WeeklyRecapCard";
import type { RunWeeklyRecap } from "../../utils/runWeeklyRecap";

const base: RunWeeklyRecap = {
  lastWeek: { count: 4, distanceKm: 28.4, avgPaceSecPerKm: 348 },
  prevWeek: { count: 3, distanceKm: 21.0, avgPaceSecPerKm: 356 },
  paceDeltaSec: 8,
  trend: "faster",
};

describe("WeeklyRecapCard", () => {
  it("변화를 헤드라인으로 말한다 (숫자보다 변화 먼저)", () => {
    render(<WeeklyRecapCard recap={base} />);
    expect(screen.getByText(/8초 단축/)).toBeInTheDocument();
    expect(screen.getByText(/4번 달려서 28.4km/)).toBeInTheDocument();
  });

  it("페이스 개선은 '단축'으로 읽힌다 — 상승 화살표를 개선에 쓰지 않는다", () => {
    render(<WeeklyRecapCard recap={base} />);
    // 접근성 라벨로 방향이 명확해야 한다
    expect(screen.getByLabelText("8초 단축")).toBeInTheDocument();
    expect(screen.queryByLabelText(/지연/)).not.toBeInTheDocument();
  });

  it("느려진 주에는 실패 프레임 없이 중립적으로 말한다", () => {
    render(
      <WeeklyRecapCard
        recap={{ ...base, trend: "slower", paceDeltaSec: -10 }}
      />,
    );
    expect(screen.getByText(/컨디션과 코스에 따라/)).toBeInTheDocument();
    expect(screen.getByLabelText("10초 지연")).toBeInTheDocument();
  });

  it("비교 대상이 없으면 변화 문장 없이 사실만", () => {
    render(
      <WeeklyRecapCard
        recap={{ ...base, prevWeek: { count: 0, distanceKm: 0, avgPaceSecPerKm: null }, trend: "unknown", paceDeltaSec: null }}
      />,
    );
    expect(screen.getByText(/4번 달려서 28.4km 달렸어요/)).toBeInTheDocument();
    expect(screen.queryByText(/그 전주에는/)).not.toBeInTheDocument();
  });

  it("지난주에 달린 적이 없으면 렌더하지 않는다", () => {
    const { container } = render(
      <WeeklyRecapCard
        recap={{
          lastWeek: { count: 0, distanceKm: 0, avgPaceSecPerKm: null },
          prevWeek: { count: 2, distanceKm: 10, avgPaceSecPerKm: 350 },
          paceDeltaSec: null,
          trend: "unknown",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("평균 페이스를 M'SS\" 로 표기", () => {
    render(<WeeklyRecapCard recap={base} />);
    expect(screen.getByText(`5'48"`)).toBeInTheDocument();
  });
});
