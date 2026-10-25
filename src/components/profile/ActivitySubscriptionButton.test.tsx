import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { getActivitySubscriptionSummary, setActivitySubscription } from "../../services/activitySubscriptions";
import { simulateLogin } from "../../__tests__/mocks/firebase";
import ActivitySubscriptionButton from "./ActivitySubscriptionButton";
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock("../../config/activitySubscriptions", () => ({ get ACTIVITY_SUBSCRIPTIONS_ENABLED() { return flags.enabled; } }));
vi.mock("../../services/activitySubscriptions", () => ({ getActivitySubscriptionSummary: vi.fn(), setActivitySubscription: vi.fn(),
  isSubscriptionsNotDeployed: (error: { code?: string }) => error?.code === "subscriptions/not-deployed" }));
beforeEach(() => {
  flags.enabled = true;
  vi.mocked(getActivitySubscriptionSummary).mockReset().mockResolvedValue({ targetUid: "target", subscribed: false, subscriberCount: 0, subscriptionCount: 0 });
  vi.mocked(setActivitySubscription).mockReset().mockImplementation(async (_uid, targetUid, subscribed) => ({ targetUid, subscribed }));
});
it.each(["guest", "self", "disabled"])("does not query or expose subscription actions for %s", mode => {
  flags.enabled = mode !== "disabled";
  renderWithProviders(<ActivitySubscriptionButton targetUid={mode === "self" ? "test-uid" : "target"} />, { authenticated: mode !== "guest" });
  expect(screen.queryByRole("button", { name: /구독/ })).not.toBeInTheDocument();
  expect(getActivitySubscriptionSummary).not.toHaveBeenCalled();
});
it("subscribes and unsubscribes only after the real server response", async () => {
  renderWithProviders(<ActivitySubscriptionButton targetUid="target" />, { authenticated: true });
  await userEvent.click(await screen.findByRole("button", { name: "구독" }));
  expect(await screen.findByRole("button", { name: "구독 취소" })).toHaveAttribute("aria-pressed", "true");
  expect(setActivitySubscription).toHaveBeenLastCalledWith("test-uid", "target", true);
  await userEvent.click(screen.getByRole("button", { name: "구독 취소" }));
  expect(await screen.findByRole("button", { name: "구독" })).toHaveAttribute("aria-pressed", "false");
  expect(setActivitySubscription).toHaveBeenLastCalledWith("test-uid", "target", false);
});
it("keeps an undeployed endpoint unavailable without claiming success", async () => {
  vi.mocked(getActivitySubscriptionSummary).mockRejectedValue({ code: "subscriptions/not-deployed" });
  renderWithProviders(<ActivitySubscriptionButton targetUid="target" />, { authenticated: true });
  expect(await screen.findByRole("button", { name: "구독 기능 준비 중" })).toBeDisabled();
  expect(setActivitySubscription).not.toHaveBeenCalled();
});
it("does not grant or retain an actionable state when access is blocked", async () => {
  vi.mocked(getActivitySubscriptionSummary).mockRejectedValue({ code: "functions/permission-denied" });
  renderWithProviders(<ActivitySubscriptionButton targetUid="target" />, { authenticated: true });
  expect(await screen.findByRole("button", { name: "구독할 수 없음" })).toBeDisabled();
  expect(setActivitySubscription).not.toHaveBeenCalled();
});
it.each(["other", "test-uid"])("discards pending mutation after SDK session replacement (%s)", async replacementUid => {
  let finish!: (value: { targetUid: string; subscribed: boolean }) => void;
  vi.mocked(setActivitySubscription).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderWithProviders(<ActivitySubscriptionButton targetUid="target" />, { authenticated: true });
  await userEvent.click(await screen.findByRole("button", { name: "구독" }));
  vi.mocked(getActivitySubscriptionSummary).mockImplementation(() => new Promise(() => {}));
  act(() => simulateLogin({ uid: replacementUid }));
  act(() => finish({ targetUid: "target", subscribed: true }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "구독 취소" })).not.toBeInTheDocument());
});
