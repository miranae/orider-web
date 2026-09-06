import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StravaSummaryPublishing, { parseStravaSummaryTarget } from "./StravaSummaryPublishing";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), publish: vi.fn(), status: vi.fn(), connect: vi.fn(), ready: vi.fn(), functions: {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => name === "stravaSummarySettings" ? mocks.settings : name === "stravaSummaryPublishStatus" ? mocks.status : mocks.publish }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ functions: mocks.functions, ensureAppCheckReady: mocks.ready }) }));
vi.mock("../../hooks/useStrava", () => ({ useStrava: () => ({ connectStrava: mocks.connect }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready.mockResolvedValue(undefined);
  mocks.settings.mockResolvedValue({ data: { enabled: false, lang: "ko" } });
  mocks.publish.mockResolvedValue({ data: { status: "published", stravaActivityId: "12345" } });
});
afterEach(() => { vi.useRealTimers(); });

describe("Strava summary publishing", () => {
  it("observes queued completion without making another publishing request", async () => {
    vi.useFakeTimers();
    mocks.publish.mockResolvedValue({ data: { status: "queued", stravaActivityId: "12345" } });
    mocks.status.mockResolvedValue({ data: { status: "published", stravaActivityId: "12345" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" })); });
    expect(screen.getByText("stravaSummary.queued")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByText("stravaSummary.published")).toBeInTheDocument();
    expect(mocks.status).toHaveBeenCalledWith({ activityId: "own-ride", stravaActivityId: "12345" });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });
  it("does not publish or enable automation on mount; publishes only after the owner action", async () => {
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(mocks.settings).toHaveBeenCalledWith({});
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith({ activityId: "own-ride", lang: "ko" }));
    expect(await screen.findByRole("link", { name: "stravaSummary.view" })).toHaveAttribute("href", "https://www.strava.com/activities/12345");
  });

  it("passes an explicitly selected target and requests write authorization on insufficient scope", async () => {
    mocks.publish.mockResolvedValue({ data: { status: "reauthorization-required" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="en" />);
    fireEvent.change(screen.getByLabelText("stravaSummary.targetLabel"), { target: { value: "https://www.strava.com/activities/98765" } });
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    expect(await screen.findByText("stravaSummary.reauthorization-required")).toBeInTheDocument();
    expect(mocks.publish).toHaveBeenCalledWith({ activityId: "own-ride", lang: "en", stravaActivityId: "98765" });
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.reconnect" }));
    expect(mocks.connect).toHaveBeenCalledWith(window.location.pathname, { writeActivities: true });
  });

  it("retries loading settings without disabling an existing automatic setting", async () => {
    mocks.settings.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: { enabled: true, lang: "ko" } });
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await screen.findByText("stravaSummary.settingsError");
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.loadSettings" }));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
    expect(mocks.settings.mock.calls).toEqual([[{}], [{}]]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("only saves opt-in after an explicit checkbox action", async () => {
    render(<StravaSummaryPublishing activityId="own-ride" lang="ko" />);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    mocks.settings.mockResolvedValue({ data: { enabled: true, lang: "ko" } });
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(mocks.settings).toHaveBeenLastCalledWith({ enabled: true, lang: "ko" }));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("discards a late publish result after changing accounts", async () => {
    let complete!: (result: unknown) => void;
    mocks.publish.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const { rerender } = render(<StravaSummaryPublishing key="owner" activityId="own-ride" lang="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "stravaSummary.publish" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalled());
    rerender(<StravaSummaryPublishing key="other" activityId="other-ride" lang="ko" />);
    await act(async () => { complete({ data: { status: "published", stravaActivityId: "12345" } }); });
    expect(screen.queryByRole("link", { name: "stravaSummary.view" })).not.toBeInTheDocument();
  });

  it("rejects lookalike hosts, invalid IDs and non-HTTPS activity links", () => {
    expect(parseStravaSummaryTarget("https://www.strava.com/activities/123?foo=bar")).toBe("123");
    for (const value of ["https://strava.com.evil/activities/123", "http://strava.com/activities/123", "0", "9007199254740993", "abc"]) {
      expect(parseStravaSummaryTarget(value)).toBeNull();
    }
  });
});
