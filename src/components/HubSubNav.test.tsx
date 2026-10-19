import { screen } from "@testing-library/react";
import HubSubNav from "./HubSubNav";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("HubSubNav", () => {

  it("preserves sport alone on every coach transition", () => {
    renderWithProviders(<HubSubNav hubKey="coach" />, { route: "/coach/today?sport=run&date=2026-10-14" });
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/\?sport=run$/);
      expect(link.getAttribute("href")).not.toContain("date=");
    }
  });
});
