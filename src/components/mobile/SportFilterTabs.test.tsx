import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import SportFilterTabs from "./SportFilterTabs";

describe("SportFilterTabs first label", () => {
  it("keeps the generic all-sports filter label by default", () => {
    renderWithProviders(<SportFilterTabs value="all" onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "종목 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🚴 사이클", pressed: false })).toBeInTheDocument();
  });

  it("allows fitness to name its integrated view without changing generic filters", () => {
    renderWithProviders(<SportFilterTabs value="all" onChange={vi.fn()} allLabelKey="discipline.tri" />);
    expect(screen.getByRole("button", { name: "통합", pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
  });
});
