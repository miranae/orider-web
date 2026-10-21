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
