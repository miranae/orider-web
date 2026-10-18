// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClubMeeting } from "./useClubMeeting";
import {
  getClubMeetingSnapshot,
  type ClubMeetingSnapshot,
} from "../../services/clubMeetings";
import { newClubMeeting } from "./meetingCopy";
vi.mock("../../services/clubMeetings", () => ({
  getClubMeetingSnapshot: vi.fn(),
}));
const snapshot = (revision: number): ClubMeetingSnapshot => ({
  eventId: "event",
  groupId: "club",
  revision,
  isHost: false,
  meeting: newClubMeeting(),
  members: [],
});
afterEach(() => vi.clearAllMocks());
describe("서버 모임 읽기 상태", () => {
  it("이전 poll 응답이 조작 후 최신 응답을 덮어쓰지 않는다", async () => {
    let first!: (value: ClubMeetingSnapshot) => void;
    let second!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            second = resolve;
          }),
      );
    const { result } = renderHook(() =>
      useClubMeeting("event", "user", "club"),
    );
    await waitFor(() =>
      expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1),
    );
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.reload();
    });
    await act(async () => {
      second(snapshot(2));
      await refresh;
    });
    expect(result.current.data?.revision).toBe(2);
    await act(async () => first(snapshot(1)));
    expect(result.current.data?.revision).toBe(2);
  });
  it("사용자 변경 시 이전 사용자의 응답과 명단을 노출하지 않는다", async () => {
    let first!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValueOnce(snapshot(2));
    const { result, rerender } = renderHook(
      ({ uid }) => useClubMeeting("event", uid, "club"),
      { initialProps: { uid: "first" } },
    );
    rerender({ uid: "second" });
    await waitFor(() => expect(result.current.data?.revision).toBe(2));
    await act(async () => first(snapshot(1)));
    expect(result.current.data?.revision).toBe(2);
  });
});
