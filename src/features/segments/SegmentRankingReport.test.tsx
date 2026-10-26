import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { simulateLogin } from "../../__tests__/mocks/firebase";
import SegmentRankingReport from "./SegmentRankingReport";
const mocks = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("../../services/segmentLeaderboard", async importOriginal => ({ ...await importOriginal<typeof import("../../services/segmentLeaderboard")>(), reportSegmentRankingEligibility: mocks.report }));
const result = { reportId: "a".repeat(64), status: "pending", duplicate: false };
beforeEach(() => { mocks.report.mockReset(); mocks.report.mockResolvedValue(result); });
function show() { return renderWithProviders(<SegmentRankingReport activityId="activity" segmentId="segment" />, { authenticated: true }); }
it("only submits after explicit confirmation and focuses the reason and returning trigger", async () => {
  show(); fireEvent.click(screen.getByRole("button", { name: "기록 신고" }));
  expect(screen.getByLabelText("신고 사유")).toHaveFocus(); expect(mocks.report).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("신고 사유"), { target: { value: "electric_bike" } });
  fireEvent.click(screen.getByRole("button", { name: "신고 제출" }));
  expect(await screen.findByRole("status")).toHaveTextContent("검토를 기다리고 있습니다");
  expect(mocks.report).toHaveBeenCalledWith(expect.anything(), "test-uid", { activityId: "activity", segmentId: "segment", reason: "electric_bike" }, expect.any(AbortSignal));
  expect(screen.getByRole("button", { name: "기록 신고" })).toHaveFocus();
});
it("cancel aborts an uncertain POST and ignores its late success", async () => {
  let resolve!: (r: unknown) => void; mocks.report.mockReturnValue(new Promise(r => { resolve = r; }));
  show(); fireEvent.click(screen.getByRole("button", { name: "기록 신고" })); fireEvent.click(screen.getByRole("button", { name: "신고 제출" }));
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(mocks.report.mock.calls[0]![3].aborted).toBe(true);
  await act(async () => resolve(result)); expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "기록 신고" })); expect(screen.getByRole("button", { name: "신고 제출" })).toBeEnabled();
});
it("allows a failed submission to retry without claiming ranking removal", async () => {
  mocks.report.mockRejectedValueOnce(new Error("offline")); show();
  fireEvent.click(screen.getByRole("button", { name: "기록 신고" })); fireEvent.click(screen.getByRole("button", { name: "신고 제출" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("중복 접수되지 않습니다");
  fireEvent.click(screen.getByRole("button", { name: "신고 제출" })); await screen.findByRole("status"); expect(mocks.report).toHaveBeenCalledTimes(2);
});
it("drops a pending response after account replacement and unmount aborts pending work", async () => {
  let resolve!: (r: unknown) => void; mocks.report.mockReturnValue(new Promise(r => { resolve = r; }));
  const rendered = show(); fireEvent.click(screen.getByRole("button", { name: "기록 신고" })); fireEvent.click(screen.getByRole("button", { name: "신고 제출" }));
  await act(async () => { simulateLogin({ uid: "another", isAnonymous: false }); });
  await act(async () => resolve(result)); expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.report.mock.calls[0]![3].aborted).toBe(true)); rendered.unmount();
});

it("closing before submission sends nothing and refresh unmount cancels a pending submission", async () => {
  let resolve!: (r: unknown) => void; mocks.report.mockReturnValue(new Promise(r => { resolve = r; }));
  const rendered = show(); fireEvent.click(screen.getByRole("button", { name: "기록 신고" }));
  fireEvent.click(screen.getByRole("button", { name: "취소" })); expect(mocks.report).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "기록 신고" })); fireEvent.click(screen.getByRole("button", { name: "신고 제출" }));
  rendered.unmount(); expect(mocks.report.mock.calls[0]![3].aborted).toBe(true);
  await act(async () => resolve(result)); expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
