import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthPreferences, ProviderId } from "@shared/types";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { PaneHealthSources } from "./PaneHealthSources";

const mocks = vi.hoisted(() => ({
  prefs: {} as HealthPreferences,
  save: vi.fn(), retain: vi.fn(),
}));
vi.mock("../../hooks/useHealthPreferences", () => ({ useHealthPreferences: () => ({
  prefs: mocks.prefs, loading: false, setPrimarySource: mocks.save, setRetainForever: mocks.retain,
}) }));
vi.mock("../../hooks/useHealthConnections", () => ({ useHealthConnections: () => ({
  loading: false,
  connections: {
    strava: { status: "active", scopes: Array.from({ length: 12 }, (_, i) => `scope-${i}`), lastSyncAt: Date.now() - 120_000 },
    apple_health: { status: "active", scopes: [] }, health_connect: null,
  },
}) }));

describe("PaneHealthSources stored preferences", () => {
  beforeEach(() => { mocks.prefs = {} as HealthPreferences; mocks.save.mockReset().mockResolvedValue(undefined); mocks.retain.mockReset(); });
  it("renders legacy preference documents with no primarySource map as automatic without writes", () => {
    renderWithProviders(<PaneHealthSources />, { authenticated: true });
    const selectors = screen.getAllByRole("combobox");
    expect(selectors).toHaveLength(4);
    selectors.forEach(selector => expect(selector).toHaveTextContent("자동"));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.retain).not.toHaveBeenCalled();
    expect(screen.queryByTestId("S2.loading")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("health-provider-strava")).getByText(/2분 전/)).toBeInTheDocument();
  });
  it("keeps every granted scope available inside the existing disclosure", () => {
    renderWithProviders(<PaneHealthSources />, { authenticated: true });
    const provider = screen.getByTestId("health-provider-strava");
    expect(provider.querySelector("details")).not.toHaveAttribute("open");
    expect(within(provider).getByText("scope-11")).toBeInTheDocument();
    expect(provider.querySelectorAll("li")).toHaveLength(12);
  });
  it("preserves saved sport choices and leaves other sports on the automatic policy", () => {
    mocks.prefs = { primarySource: { bike: "apple_health" }, defaultPrimarySource: "strava" };
    renderWithProviders(<PaneHealthSources />, { authenticated: true });
    const selectors = screen.getAllByRole("combobox");
    expect(selectors[0]).toHaveTextContent("Apple Health");
    expect(selectors[1]).toHaveTextContent("자동");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps a saved disconnected provider visible instead of presenting it as automatic", () => {
    mocks.prefs = { primarySource: { bike: "health_connect" as ProviderId } };
    renderWithProviders(<PaneHealthSources />, { authenticated: true });
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("Health Connect");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("changes only the selected sport when the user explicitly chooses a provider", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PaneHealthSources />, { authenticated: true });
    await user.click(screen.getAllByRole("combobox")[0]!);
    await user.click(screen.getByRole("option", { name: "Apple Health" }));
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("bike", "apple_health");
    expect(mocks.retain).not.toHaveBeenCalled();
  });
});
