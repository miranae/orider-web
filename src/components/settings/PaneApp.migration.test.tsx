import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
vi.mock("../../hooks/useStrava", () => ({ useStrava: () => ({ deleteUserData: vi.fn(), loading: false }) }));
vi.mock("../../hooks/useExport", () => ({ useExport: () => ({ exportData: vi.fn(), loading: false, progress: { current: 0, total: 0 } }) }));
import { PaneApp } from "./PaneApp";
describe("data settings migration destination", () => {
  it("provides and scrolls the real migration section linked from connections", async () => {
    const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
    renderWithProviders(<PaneApp part="data" />, { authenticated: true, route: "/ko/settings/data#migrate", profile: { stravaConnected: true } });
    await waitFor(() => expect(document.getElementById("migrate")).not.toBeNull());
    expect(screen.getByTestId("S3-3-1").querySelector("a")).toHaveAttribute("href", "/ko/migrate");
    expect(scroll).toHaveBeenCalled();
  });
  it("sends disconnected accounts to connections instead of starting migration", async () => {
    renderWithProviders(<PaneApp part="data" />, { authenticated: true, profile: { stravaConnected: false } });
    await waitFor(() => expect(screen.getByTestId("S3-3-1").querySelector("a")).toHaveAttribute("href", "/ko/settings/connections"));
  });
});
