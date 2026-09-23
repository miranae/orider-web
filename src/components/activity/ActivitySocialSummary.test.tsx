import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActivitySocialSummary from "./ActivitySocialSummary";
import type { ActivitySocialSummary as Summary } from "../../hooks/useActivityNarrative";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const retry = vi.hoisted(() => vi.fn());
vi.mock("../../services/activityNarrativeApi", () => ({ retryActivitySocialSummary: retry }));
const summary: Summary = {
  narrative: "A strong finish", achievements: [{ id: "pr", text: "New personal best" }], shareText: "Exact server share text",
  fitnessImpact: { status: "available", discipline: "bike", asOf: 1788739200000, timezone: "UTC", before: { ctl: 51.9, atl: 65.2, tsb: -13.3 }, after: { ctl: 53.3, atl: 71.6, tsb: -18.3 }, delta: { ctl: 1.4, atl: 6.4, tsb: -5 } },
};
describe("ActivitySocialSummary", () => {
  it("ignores a late retry response after changing viewer scope", async () => {
    let resolve!: (value: { socialSummary: Summary }) => void;
    retry.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<ActivitySocialSummary key="owner" activityId="ride" isActivityOwner />);
    fireEvent.click(screen.getByRole("button", { name: "socialSummary.retry" }));
    rerender(<ActivitySocialSummary key="other" activityId="ride" isActivityOwner={false} />);
    resolve({ socialSummary: summary });
    await waitFor(() => expect(screen.queryByText("A strong finish")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows the same settled pre-session value as the overview and copies the server text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ActivitySocialSummary summary={summary} isActivityOwner />);
    expect(screen.getByText("socialSummary.sports.bike · socialSummary.settled")).toBeTruthy();
    expect(screen.getByText("51.9 → 53.3 (+1.4)")).toBeTruthy();
    expect(screen.getByText("-13.3 → -18.3 (-5.0)")).toBeTruthy();
    expect(screen.getByText("socialSummary.dailyBasis")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(summary.shareText));
    expect(screen.getByRole("status").textContent).toBe("socialSummary.copied");
  });
  it("hides private load and copy action from other viewers", () => {
    render(<ActivitySocialSummary summary={summary} isActivityOwner={false} />);
    expect(screen.queryByText("socialSummary.ctl")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("New personal best")).toBeTruthy();
  });
  it("shows the settled prior value while the activity day is still open", () => {
    render(<ActivitySocialSummary summary={{ ...summary, fitnessImpact: {
      status: "pending", discipline: "bike", asOf: 1788739200000, timezone: "UTC",
      before: { ctl: 51.9, atl: 65.2, tsb: -13.3 },
    } }} isActivityOwner />);
    expect(screen.getByText("socialSummary.sports.bike · socialSummary.pendingTitle")).toBeTruthy();
    expect(screen.getByText("51.9")).toBeTruthy();
    expect(screen.queryByText(/53\.3/)).toBeNull();
    expect(screen.getByText("socialSummary.pendingBasis")).toBeTruthy();
  });
  it("explains when privacy settings suppress fitness values", () => {
    render(<ActivitySocialSummary summary={{ ...summary, fitnessImpact: { status: "unavailable", reason: "privacy-hidden" } }} isActivityOwner />);
    expect(screen.getByText("socialSummary.private")).toBeTruthy();
    expect(screen.queryByText("51.9 → 53.3 (+1.4)")).toBeNull();
  });
  it("shows a recoverable clipboard failure", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<ActivitySocialSummary summary={summary} isActivityOwner />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("socialSummary.error"));
  });
});
