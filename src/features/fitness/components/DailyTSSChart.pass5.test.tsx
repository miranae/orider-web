import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import DailyTSSChart from "./DailyTSSChart";
it("keeps known partial daily bars and labels unknown-only tooltip without confirmed zero",()=>{
  const {container}=render(<DailyTSSChart data={[
    {date:"2026-09-27",totalLoad:100,activities:[{load:100,source:"tss"}],unknownCount:1},
    {date:"2026-09-28",totalLoad:0,activities:[],unknownCount:1},
  ]}/>);
  const bars=container.firstElementChild!.firstElementChild!.children;
  fireEvent.pointerEnter(bars[0]!);
  expect(screen.getByText("100 TSS")).toBeInTheDocument();
  expect(screen.getByText("부하 미확인 1건 · 확인된 값만 합산")).toBeInTheDocument();
  fireEvent.pointerEnter(bars[1]!);
  expect(screen.getByText("– TSS")).toBeInTheDocument();
  expect(screen.queryByText("0 TSS")).not.toBeInTheDocument();
});
