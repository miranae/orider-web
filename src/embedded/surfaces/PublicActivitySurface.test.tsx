import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicActivitySurface from "./PublicActivitySurface";
import type { PublicActivityDetail } from "../../services/publicActivityDetail";

const mocks = vi.hoisted(() => ({ load: vi.fn(), setKudos: vi.fn(), postComment: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "viewer", isAnonymous: false } }) }));
vi.mock("../../services/publicActivityDetail", () => ({ isPublicActivityAccessError: () => false, createPublicActivityClient: () => mocks }));
const fixture = (): PublicActivityDetail => ({
  activity: { id: "native-ride", userId: "owner", nickname: "라이더", profileImage: null,
    description: "한강 라이딩", type: "Ride", startTime: 1792800000000, kudosCount: 2, commentCount: 0,
    summary: { distance: 45000, ridingTimeMillis: 7200000, elevationGain: 88 },
    effectiveFacts: { status: "canonical", metrics: { distanceKm: 44.8, durationSec: 7000, elevationGainM: null } } },
  viewerHasKudos: false, content: { status: "ready", activityId: "native-ride", comments: [], memo: "바람이 좋았어요", photos: [] },
});
const props = { activityId: "native-ride", retryKey: 0, onReady: vi.fn(), onError: vi.fn() };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(fixture()); mocks.setKudos.mockResolvedValue({ enabled: true }); mocks.postComment.mockResolvedValue({ commentId: "new" }); });
describe("public embedded activity", () => {
  it("converts native recorded metres to kilometres when canonical facts are unavailable", async () => {
    const data = fixture();
    data.activity.summary.distance = 25000;
    data.activity.effectiveFacts = { status: "unavailable", metrics: null };
    mocks.load.mockResolvedValue(data);
    render(<PublicActivitySurface {...props} />);
    expect(await screen.findByText("25")).toBeInTheDocument();
    expect(screen.queryByText("0.03")).not.toBeInTheDocument();
  });
  it("shows native public facts and canonical missing values without owner analysis", async () => {
    render(<PublicActivitySurface {...props} />);
    expect(await screen.findByText("한강 라이딩")).toBeInTheDocument();
    expect(screen.getByText("44.8")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(screen.getByText("바람이 좋았어요")).toBeInTheDocument();
    expect(props.onReady).toHaveBeenCalledTimes(1);
  });
  it("preserves comment text on failure and reads back after confirmed success", async () => {
    mocks.postComment.mockRejectedValueOnce(new Error("offline"));
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "함께 타요" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByRole("alert");
    expect(input).toHaveValue("함께 타요");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(mocks.postComment).toHaveBeenLastCalledWith("native-ride", "함께 타요", expect.any(String));
    expect(mocks.postComment.mock.calls[0][2]).toBe(mocks.postComment.mock.calls[1][2]);
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("serializes reaction taps while a request is pending", async () => {
    let resolve!: (value: { enabled: boolean }) => void;
    mocks.setKudos.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    const button = screen.getByRole("button", { name: /좋아요/ });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.setKudos).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ enabled: true }));
  });
  it("clears public content if permissions fail on mutation readback", async () => {
    mocks.load.mockResolvedValueOnce(fixture()).mockRejectedValue(new Error("permission-denied"));
    render(<PublicActivitySurface {...props} />);
    await screen.findByText("한강 라이딩");
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    await waitFor(() => expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: /다시/ })).toBeInTheDocument();
  });
  it("drops late results from a previous activity", async () => {
    let resolve!: (value: PublicActivityDetail) => void;
    mocks.load.mockReturnValueOnce(new Promise(r => { resolve = r; })).mockRejectedValueOnce(new Error("missing"));
    const { rerender } = render(<PublicActivitySurface {...props} />);
    rerender(<PublicActivitySurface {...props} activityId="next-ride" />);
    await act(async () => resolve(fixture()));
    expect(screen.queryByText("한강 라이딩")).not.toBeInTheDocument();
  });
});
