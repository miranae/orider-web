import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActivitySocialSummary from "./ActivitySocialSummary";
import type { ActivitySocialSummary as Summary } from "../../hooks/useActivityNarrative";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const retry = vi.hoisted(() => vi.fn());
vi.mock("../../services/activityNarrativeApi", () => ({ retryActivitySocialSummary: retry }));
const summary: Summary = {
  narrative: "A strong finish", achievements: [{ id: "pr", text: "New personal best" }], shareText: "Exact server share text",
  fitnessImpact: { status: "available", asOf: 1788739200000, timezone: "UTC", before: { ctl: 39, atl: 50, tsb: -11 }, after: { ctl: 40.1, atl: 55.6, tsb: -15.5 }, delta: { ctl: 1.1, atl: 5.6, tsb: -4.5 }, inputDigest: "test" },
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
  it("shows integrated before/after values and copies the server text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ActivitySocialSummary summary={summary} isActivityOwner />);
    expect(screen.getByText("39.0 → 40.1 (+1.1)")).toBeTruthy();
    expect(screen.getByText("-11.0 → -15.5 (-4.5)")).toBeTruthy();
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
  it("shows a recoverable clipboard failure", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<ActivitySocialSummary summary={summary} isActivityOwner />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("socialSummary.error"));
  });
});
