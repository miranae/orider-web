import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import TodayPlanLink from "./TodayPlanLink";

describe("TodayPlanLink", () => {
  it("opens the localized plan page without a discipline when none is provided", () => {
    renderWithProviders(<TodayPlanLink />, { route: "/ko/" });

    const link = screen.getByRole("link", { name: "오늘 계획 보기" });
    expect(link).toHaveAttribute("href", "/ko/plan");
    expect(link).toHaveClass("ds-btn--ghost", "ds-btn--sm");
  });

  it("keeps a supported discipline in the plan route", () => {
    renderWithProviders(<TodayPlanLink discipline="run" />, { route: "/ko/?sport=run" });

    expect(screen.getByRole("link", { name: "오늘 계획 보기" }))
      .toHaveAttribute("href", "/ko/plan?sport=run");
  });

  it("renders the localized swim route under the English URL", () => {
    render(
      <MemoryRouter initialEntries={["/en/?sport=swim"]}>
        <Routes>
          <Route path="/:lang/*" element={<TodayPlanLink discipline="swim" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "오늘 계획 보기" }))
      .toHaveAttribute("href", "/en/plan?sport=swim");
  });
});
