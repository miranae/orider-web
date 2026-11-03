import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { EmbeddedCoachNavigation } from "./EmbeddedCoachNavigation";

// 앱 코치 상단 탭은 웹과 같은 네 개 — 오늘·계획을 상단에 따로 두면 계획/기록 하위 탭과 겹쳤다(2026-11-03).
it.each(["today", "plan", "records"])("shows the web coach tabs and highlights plan/records for %s", page => {
  render(<MemoryRouter initialEntries={[`/ko/embed/fitness?page=${page}`]}><EmbeddedCoachNavigation defaultPage="condition" selectionKey={0} /></MemoryRouter>);
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(4);
  expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  expect(tabs.filter(tab => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
});
