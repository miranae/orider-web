import { screen } from "@testing-library/react";
import HubSubNav from "./HubSubNav";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

describe("HubSubNav", () => {

  it("preserves sport everywhere and the selected date only for the execution plan", () => {
    renderWithProviders(<HubSubNav hubKey="coach" />, { route: "/coach/today?sport=run&date=2026-10-14" });
    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href")!;
      const url = new URL(href, "https://local.test");
      expect(url.searchParams.get("sport")).toBe("run");
      expect(url.searchParams.get("date")).toBe(url.pathname.endsWith("/coach/plan") ? "2026-10-14" : null);
    }
  });
});
