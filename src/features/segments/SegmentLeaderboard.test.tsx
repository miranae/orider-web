import { fireEvent, screen, waitFor, act } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import SegmentLeaderboard from "./SegmentLeaderboard";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../services/segmentLeaderboard", () => ({ loadSegmentLeaderboard: mocks.load }));
vi.mock("../../hooks/useGroup", () => ({ useMyGroups: () => ({ groups: [{ id: "club", name: "남산 클럽" }], error: null, retry: vi.fn() }) }));
const response = (name = "라이더", nextCursor: string | null = "next") => ({ entries: [{ id: "e", activityId: "a", userId: "rider", nickname: name, elapsedTime: 100000, averageSpeed: 36, startDate: Date.now() }], nextCursor, scannedCount: 50, limitReached: false, scopeMemberCount: null });
beforeEach(() => { mocks.load.mockReset(); mocks.load.mockResolvedValue(response()); });
it("uses server units, transmits period and scope, and replaces rather than retaining old pages", async () => {
  renderWithProviders(<SegmentLeaderboard segmentId="s" />, { authenticated: true });
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  expect(await screen.findByRole("link", { name: /라이더/ })).toHaveAttribute("href", "/ko/activity/a");
  expect(screen.getByText(/36.0 km\/h/)).toBeInTheDocument();
  mocks.load.mockResolvedValueOnce(response("다음 라이더", null));
  fireEvent.click(screen.getByRole("button", { name: "다음 빠른 기록 확인" }));
  await screen.findByRole("link", { name: /다음 라이더/ });
  expect(mocks.load).toHaveBeenLastCalledWith(expect.anything(), "test-uid", expect.objectContaining({ cursor: "next", scope: "all", fromMs: expect.any(Number), toMs: expect.any(Number) }));
  fireEvent.change(screen.getByLabelText("비교 대상"), { target: { value: "club" } });
  expect(screen.queryByRole("link", { name: /다음 라이더/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "처음부터 조회·새로고침" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("내 클럽"), { target: { value: "club" } });
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  await waitFor(() => expect(mocks.load).toHaveBeenLastCalledWith(expect.anything(), "test-uid", expect.objectContaining({ scope: "club", clubId: "club" })));
});
it("drops late scope responses and clears previously visible records on denied refresh", async () => {
  let resolve!: (v: unknown) => void;
  mocks.load.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  renderWithProviders(<SegmentLeaderboard segmentId="s" />, { authenticated: true });
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  fireEvent.change(screen.getByLabelText("비교 대상"), { target: { value: "following" } });
  await act(async () => resolve(response("오래된 라이더")));
  expect(screen.queryByRole("link", { name: /오래된 라이더/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  await screen.findByRole("link", { name: /라이더/ });
  mocks.load.mockRejectedValueOnce({ code: "functions/permission-denied" });
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  await screen.findByRole("alert"); expect(screen.queryByRole("link", { name: /라이더/ })).not.toBeInTheDocument();
});
it("offers continuation even when a scanned page has no eligible rider", async () => {
  mocks.load.mockResolvedValue({ ...response(), entries: [] });
  renderWithProviders(<SegmentLeaderboard segmentId="s" />, { authenticated: true });
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  expect(await screen.findByRole("button", { name: "다음 빠른 기록 확인" })).toBeEnabled();
});

it("keeps detailed criteria collapsed and gives anonymous riders a readable label", async () => {
  mocks.load.mockResolvedValue({ ...response("", null), scopeMemberCount: 3 });
  renderWithProviders(<SegmentLeaderboard segmentId="s" />, { authenticated: true });
  expect(screen.getByText("비교 기준과 조회 범위").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "처음부터 조회·새로고침" }));
  expect(await screen.findByRole("link", { name: /라이더/ })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("이 페이지에서 확인된 라이더 1명 · 대상 회원 3명");
});
