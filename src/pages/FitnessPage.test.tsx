import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import FitnessPage from "./FitnessPage";

vi.mock("../hooks/useMobile", () => ({
  useMobile: () => true,
}));

vi.mock("../components/mobile/MobileFitnessPage", () => ({
  default: () => <div>mobile fitness dashboard</div>,
}));

describe("FitnessPage", () => {
  it("shows the login prompt instead of the mobile dashboard for signed-out mobile visitors", async () => {
    renderWithProviders(<FitnessPage />, {
      authenticated: false,
      route: "/fitness",
    });

    expect(await screen.findByText("피트니스 대시보드")).toBeInTheDocument();
    expect(screen.getByText("로그인 후 이용할 수 있습니다")).toBeInTheDocument();
    expect(screen.queryByText("mobile fitness dashboard")).not.toBeInTheDocument();
  });

  it("keeps mobile loading, error, empty, and tri branches before the mobile dashboard return", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/FitnessPage.tsx"), "utf8");
    const mobileDashboardIndex = source.indexOf("return (\n      <MobileFitnessPage");

    expect(source.indexOf("if (isMobile && (loading || !timeseriesLoaded))")).toBeGreaterThan(-1);
    expect(source.indexOf("if (isMobile && error)")).toBeGreaterThan(-1);
    expect(source.indexOf("if (isMobile && activities.length === 0)")).toBeGreaterThan(-1);
    expect(source.indexOf('if (discipline === "tri")')).toBeGreaterThan(-1);
    expect(source.indexOf("if (isMobile && (loading || !timeseriesLoaded))")).toBeLessThan(mobileDashboardIndex);
    expect(source.indexOf("if (isMobile && error)")).toBeLessThan(mobileDashboardIndex);
    expect(source.indexOf("if (isMobile && activities.length === 0)")).toBeLessThan(mobileDashboardIndex);
    expect(source.indexOf('if (discipline === "tri")')).toBeLessThan(mobileDashboardIndex);
  });
});
