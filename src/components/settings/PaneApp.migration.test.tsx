import settingsKo from "../../i18n/resources/ko/settings.json";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
const exportData = vi.hoisted(() => vi.fn());
const exportState = vi.hoisted(() => ({ error: null as string | null }));
const deletion = vi.hoisted(() => ({ run: vi.fn(), confirm: vi.fn() }));
vi.mock("../../hooks/useStrava", () => ({ useStrava: () => ({ deleteUserData: deletion.run, loading: false }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: deletion.confirm }) }));
vi.mock("../../hooks/useExport", () => ({ useExport: () => ({ exportData, loading: false, error: exportState.error, progress: { current: 0, total: 0 } }) }));
import { PaneApp } from "./PaneApp";
describe("data settings migration destination", () => {
  beforeEach(() => { exportState.error = null; exportData.mockClear(); deletion.run.mockReset().mockResolvedValue(undefined); deletion.confirm.mockReset().mockResolvedValue(true); });
  it("deletes only streams after confirming the explicit server-detail scope", async () => {
    renderWithProviders(<PaneApp part="data" />, { authenticated: true });
    expect(screen.getByText(settingsKo.pane.app.clearCacheHint)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: settingsKo.pane.app.clearCacheBtn }));
    await waitFor(() => expect(deletion.run).toHaveBeenCalledExactlyOnceWith(true));
    expect(deletion.confirm).toHaveBeenCalledWith(settingsKo.pane.app.streamsDeleteConfirm, { destructive: true });
  });
  it("passes the broader Strava deletion flag only after its own scope confirmation", async () => {
    renderWithProviders(<PaneApp part="data" />, { authenticated: true });
    fireEvent.click(screen.getByRole("button", { name: settingsKo.pane.app.deleteAllBtn }));
    await waitFor(() => expect(deletion.run).toHaveBeenCalledExactlyOnceWith(false));
    expect(deletion.confirm).toHaveBeenCalledWith(settingsKo.pane.app.stravaDeleteConfirm, { destructive: true });
  });
  it("does not delete anything when either destructive confirmation is cancelled", async () => {
    deletion.confirm.mockResolvedValue(false);
    renderWithProviders(<PaneApp part="data" />, { authenticated: true });
    fireEvent.click(screen.getByRole("button", { name: settingsKo.pane.app.clearCacheBtn }));
    fireEvent.click(screen.getByRole("button", { name: settingsKo.pane.app.deleteAllBtn }));
    await waitFor(() => expect(deletion.confirm).toHaveBeenCalledTimes(2));
    expect(deletion.run).not.toHaveBeenCalled();
  });
  it("shows export failure and waits for an explicit retry without stale progress", () => {
    exportState.error = "export failed";
    renderWithProviders(<PaneApp part="data" />, { authenticated: true });
    expect(screen.getByRole("alert")).toHaveTextContent(settingsKo.pane.app.exportFailed);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(exportData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: settingsKo.data.downloadAll }));
    expect(exportData).toHaveBeenCalledOnce();
  });
  it("names display choices individually within a group", () => {
    renderWithProviders(<PaneApp part="display" />, { authenticated: true });
    const language = screen.getByRole("group", { name: settingsKo.pane.app.fieldLang });
    expect(within(language).getByRole("button", { name: "한국어" })).toBeInTheDocument();
    expect(within(language).getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "km / kg" })).toBeInTheDocument();
  });
  it("describes the actual ZIP contents and exports without a cosmetic format selection", async () => {
    renderWithProviders(<PaneApp part="data" />, { authenticated: true });
    expect(screen.getByText(/프로필·활동 JSON, 활동 목록 CSV/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "FIT" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "TCX" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /전체.*다운로드/ }));
    expect(exportData).toHaveBeenCalledOnce();
  });
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
