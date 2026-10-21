import { createElement } from "react";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import DashboardPage from "./DashboardPage";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";

vi.mock("../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../utils/yearRecapSeason", () => ({ isYearRecapSeason: () => false }));

describe("Strava empty-state settings links", () => {

  it("keeps the home Strava connection in guidance and the existing-record import in the empty feed", async () => {
    const { container } = renderWithProviders(createElement(DashboardPage), {
      route: "/ko/", authenticated: true, profile: { stravaConnected: false, onboardingStep: "done" },
    });
    const importLink = await screen.findByText("기존 기록 가져오기", { selector: "a" });
    expect(importLink).toHaveRole("link");
    expect(importLink).toHaveAccessibleName("기존 기록 가져오기");
    expect(importLink).toBeVisible();
    expect(importLink).toHaveAttribute("href", "/ko/athlete/me/activities?import=1");
    const guidance = container.querySelector('[data-home-slot="guidance"]');
    expect(guidance).not.toBeNull();
    expect(within(guidance as HTMLElement).getByRole("link", { name: "Strava 연결" })).toHaveAttribute("href", "/ko/settings/connections");
    expect(screen.getByRole("link", { name: "Google Play" })).toHaveAttribute("href", ORIDER_PLAY_STORE_URL);
    expect(screen.getByRole("link", { name: "App Store" })).toHaveAttribute("href", ORIDER_APP_STORE_URL);
  });
});
