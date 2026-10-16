import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ThresholdSuggestionBanner } from "./ThresholdSuggestionBanner";
const mocks = vi.hoisted(() => ({ user: { uid: "test" }, dismiss: vi.fn(), log: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../hooks/useBikeFtpDecision", () => ({ useBikeFtpDecision: () => ({ decision: null, loading: false }) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: mocks.log }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.dismiss }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), query: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), onSnapshot: (_query: unknown, next: (value: unknown) => void) => {
  next({ docs: [{ id: "activity-test", data: () => ({ lthr: { current: 150, proposed: 160, reason: "recent" } }) }] });
  return () => {};
} }));
beforeEach(() => vi.clearAllMocks());
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
