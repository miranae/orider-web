import { createElement } from "react";
import { screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import DashboardPage from "./DashboardPage";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";

vi.mock("../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../utils/yearRecapSeason", () => ({ isYearRecapSeason: () => false }));

const sourceFiles = [
  "src/pages/FitnessPage.tsx",
  "src/pages/DashboardPage.tsx",
  "src/components/dashboard/HomeTodayStrip.tsx",
  "src/components/mobile/MobileFeedPage.tsx",
];

describe("Strava empty-state settings links", () => {
  it("does not use the obsolete settings integration anchor", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toContain("/settings#integrations");
    }
    expect(readFileSync(join(process.cwd(), "src/pages/FitnessPage.tsx"), "utf8")).toContain('href: "/settings/connections"');
  });

  it("keeps the home Strava connection in guidance and the existing-record import in the empty feed", async () => {
    const { container } = renderWithProviders(createElement(DashboardPage), {
      route: "/ko/", authenticated: true, profile: { stravaConnected: false, onboardingStep: "done" },
    });
    const importLink = await screen.findByRole("link", { name: "기존 기록 가져오기" });
    expect(importLink).toHaveAttribute("href", "/ko/athlete/me/activities?import=1");
    const guidance = container.querySelector('[data-home-slot="guidance"]');
    expect(guidance).not.toBeNull();
    expect(within(guidance as HTMLElement).getByRole("link", { name: "Strava 연결" })).toHaveAttribute("href", "/ko/settings/connections");
    const emptyFeed = within(importLink.closest('[role="status"]') as HTMLElement);
    expect(emptyFeed.getByRole("link", { name: "Google Play" })).toHaveAttribute("href", ORIDER_PLAY_STORE_URL);
    expect(emptyFeed.getByRole("link", { name: "App Store" })).toHaveAttribute("href", ORIDER_APP_STORE_URL);
  });
});
