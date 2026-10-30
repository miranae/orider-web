import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
import AthleteRecentSummary from "./AthleteRecentSummary";

it("shows calendar dates and activity counts in the shared tooltip for focus and touch", () => {
  renderWithProviders(<AthleteRecentSummary activities={[createMockActivity()]} loading={false} error={false} />);
  const days = screen.getAllByRole("button");
  const today = days[27]!;
  expect(today).not.toHaveAttribute("title");
  fireEvent.focus(today);
  expect(screen.getByRole("tooltip")).toHaveTextContent("1");
  expect(today).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  fireEvent.keyDown(today, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.click(today);
  expect(screen.getByRole("tooltip")).toHaveTextContent("1");
  fireEvent.blur(today);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("preserves weekly hours in a shared data tooltip instead of the browser title", () => {
  renderWithProviders(<AthleteRecentSummary activities={[]} loading={false} error={false} />);
  const week = screen.getAllByRole("button")[31]!;
  expect(week).not.toHaveAttribute("title");
  fireEvent.mouseEnter(week);
  expect(screen.getByRole("tooltip")).toHaveTextContent("0.0 h");
  fireEvent.mouseLeave(week);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("keeps the KST day label and tooltip when UTC is still the previous year", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2025-12-31T15:30:00Z"));
  try {
    renderWithProviders(<AthleteRecentSummary activities={[createMockActivity({startTime: Date.parse("2025-12-31T15:10:00Z")})]} loading={false} error={false} />);
    const today = screen.getAllByRole("button")[27]!;
    expect(today.getAttribute("aria-label")).toContain("2026");
    fireEvent.focus(today);
    expect(screen.getByRole("tooltip")).toHaveTextContent("2026");
    expect(screen.getByText("한국 시간(KST) 기준")).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});
