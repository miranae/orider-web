import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EventDetailNavigation from "./EventDetailNavigation";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
function StateTrace() { const location = useLocation(); return <span data-testid="event-origin">{JSON.stringify(location.state)}</span>; }
describe("event overview/participation/results route tabs", () => {
  it.each(["ko", "en"])("preserves %s routes and keeps spectator live outside the three tabs", lang => {
    render(<MemoryRouter initialEntries={[{ pathname: `/${lang}/event/event-1/results`, state: { fromHub: "club" } }]}><Routes>
      <Route path="/:lang/event/:eventId/*" element={<EventDetailNavigation eventId="event-1" live />} />
    </Routes><StateTrace /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "detail.overviewTab" })).toHaveAttribute("href", `/${lang}/event/event-1`);
    expect(screen.getByRole("link", { name: "resultsTitle" })).toHaveAttribute("href", `/${lang}/event/event-1/results`);
    expect(screen.getByRole("link", { name: "resultsTitle" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "detail.liveSpectator" })).toHaveAttribute("href", `/${lang}/live/event-1`);
    expect(screen.getByRole("link", { name: "detail.participationTab" })).toHaveAttribute("href", `/${lang}/event/event-1/register`);
    fireEvent.click(screen.getByRole("link", { name: "detail.participationTab" }));
    expect(screen.getByRole("link", { name: "detail.participationTab" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("event-origin")).toHaveTextContent('"fromHub":"club"');
    fireEvent.click(screen.getByRole("link", { name: "detail.overviewTab" }));
    expect(screen.getByTestId("event-origin")).toHaveTextContent('"fromHub":"club"');
    fireEvent.click(screen.getByRole("link", { name: "resultsTitle" }));
    expect(screen.getByTestId("event-origin")).toHaveTextContent('"fromHub":"club"');
  });
  it("keeps participation accessible without prematurely exposing results", () => {
    render(<MemoryRouter><EventDetailNavigation eventId="event-1" results={false} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "detail.participationTab" })).toHaveAttribute("href", "/ko/event/event-1/register");
    expect(screen.queryByRole("link", { name: "resultsTitle" })).not.toBeInTheDocument();
  });
});
