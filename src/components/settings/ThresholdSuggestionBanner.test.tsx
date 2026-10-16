import enSettings from "../../i18n/resources/en/settings.json";
import koSettings from "../../i18n/resources/ko/settings.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";
const mocks = vi.hoisted(() => ({ user: { uid: "test" }, dismiss: vi.fn(), log: vi.fn(), reason: "recent", locale: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key === "threshold.reason.observedMaxHr" ? (mocks.locale === "en" ? enSettings : koSettings).threshold.reason.observedMaxHr : key }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../hooks/useBikeFtpDecision", () => ({ useBikeFtpDecision: () => ({ decision: null, loading: false }) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: mocks.log }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.dismiss }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), onSnapshot: (_query: unknown, next: (value: unknown) => void) => {
  next({ docs: [{ id: "activity-test", data: () => ({ lthr: { current: 150, proposed: 160, reason: mocks.reason } }) }] });
  return () => {};
} }));
beforeEach(() => { vi.clearAllMocks(); mocks.reason = "recent"; mocks.locale = "en"; });
it("announces a rejected dismissal and permits an explicit retry without accepting the suggestion", async () => {
  mocks.dismiss.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: {} });
  render(<ThresholdSuggestionBanner />);
  fireEvent.click(screen.getByRole("button", { name: "threshold.dismiss" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("threshold.dismissFailed");
  const retry = screen.getByRole("button", { name: "common:button.retry" });
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledTimes(2));
  expect(mocks.dismiss).toHaveBeenNthCalledWith(2, { activityId: "activity-test" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});


it.each([
  ['en', '활동 중 관측된 최대 심박', enSettings.threshold.reason.observedMaxHr],
  ['ko', '활동 중 관측된 최대 심박', koSettings.threshold.reason.observedMaxHr],
  ['en', '새로운 서버 판정 사유', '새로운 서버 판정 사유'],
])('localizes only the exact known reason in %s and preserves unknown text', (locale, reason, expected) => {
  mocks.locale = locale; mocks.reason = reason;
  render(<ThresholdSuggestionBanner />);
  expect(screen.getByText(expected)).toBeInTheDocument();
  if (locale === 'en' && reason === '활동 중 관측된 최대 심박') expect(screen.queryByText(reason)).not.toBeInTheDocument();
  expect(mocks.reason).toBe(reason);
  expect(mocks.dismiss).not.toHaveBeenCalled();
});
