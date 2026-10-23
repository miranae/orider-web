import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import DailyTSSChart from "./DailyTSSChart";
it("keeps known partial daily bars and labels unknown-only tooltip without confirmed zero",()=>{
  render(<DailyTSSChart data={[
    {date:"2026-09-27",totalLoad:100,activities:[{load:100,source:"tss"}],unknownCount:1},
    {date:"2026-09-28",totalLoad:0,activities:[],unknownCount:1},
  ]}/>);
  const bars=screen.getAllByRole("button");
  fireEvent.click(bars[0]!);
  expect(screen.getByRole("tooltip")).toHaveTextContent("100 TSS");
  expect(screen.getByText(/100 TSS · 부하 미확인 1건/)).toBeInTheDocument();
  fireEvent.blur(bars[0]!);
  fireEvent.click(bars[1]!);
  expect(screen.getByText(/– TSS · 부하 미확인 1건/)).toBeInTheDocument();
  expect(screen.queryByText("0 TSS")).not.toBeInTheDocument();
});

it("exposes unknown as distinct from rest and supports focus, Enter pinning and Escape dismissal", () => {
  const { container } = render(<DailyTSSChart data={[
    { date: "2026-10-01", totalLoad: 0, activities: [], unknownCount: 1 },
    { date: "2026-10-02", totalLoad: 0, activities: [] },
  ]} />);
  expect(container.querySelector('[data-load-status="unknown"]')).toHaveClass("daily-load-chart__bar--unknown");
  const bars = screen.getAllByRole("button");
  fireEvent.click(bars[0]!);
  expect(screen.getByRole("tooltip")).toHaveTextContent("– TSS");
  fireEvent.click(bars[0]!);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(bars[1]!);
  expect(screen.getByRole("tooltip")).toHaveTextContent("0 TSS");
});
