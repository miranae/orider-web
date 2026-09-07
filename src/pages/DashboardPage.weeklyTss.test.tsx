import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WeeklyTssBars } from "./DashboardPage";

/**
 * 부하를 알 수 없는 주(`tss=null`)를 0 막대로 그리면 "쉰 주"라는 거짓 확정값이 된다 (#2237).
 * 빈 칸 + "기록 없음" 툴팁이어야 한다.
 */
describe("WeeklyTssBars", () => {
  const weeks = [
    { week: "W1", tss: 300 },
    { week: "W2", tss: null },
    { week: "W3", tss: 150 },
  ];
  const tooltipFor = (w: { week: string; tss: number | null }) =>
    w.tss == null ? `${w.week}: 기록 없음` : `${w.week}: ${w.tss} TSS`;

  it("tss=null 인 주는 막대가 아니라 빈 칸으로 그린다", () => {
    render(<WeeklyTssBars weeks={weeks} tooltipFor={tooltipFor} />);

    expect(screen.getAllByTestId("weekly-tss-bar")).toHaveLength(2);
    expect(screen.getAllByTestId("weekly-tss-bar-unknown")).toHaveLength(1);
  });

  it("빈 칸에 호버하면 '기록 없음' 툴팁이 뜬다 — 0 TSS 라고 말하지 않는다", () => {
    render(<WeeklyTssBars weeks={weeks} tooltipFor={tooltipFor} />);

    fireEvent.pointerEnter(screen.getByTestId("weekly-tss-bar-unknown"));
    expect(screen.getByText("W2: 기록 없음")).toBeInTheDocument();
    expect(screen.queryByText("W2: 0 TSS")).not.toBeInTheDocument();
  });

  it("최고값 정규화에 null 주가 끼어들지 않는다", () => {
    render(<WeeklyTssBars weeks={weeks} tooltipFor={tooltipFor} />);

    const [first, second] = screen.getAllByTestId("weekly-tss-bar");
    expect(first).toHaveStyle({ height: "100%" });
    expect(second).toHaveStyle({ height: "50%" });
  });
});
