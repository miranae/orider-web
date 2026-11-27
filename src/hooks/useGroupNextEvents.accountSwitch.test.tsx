import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installEventDiscoveryFixture } from "../__tests__/fixtures/eventDiscovery";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { UpcomingClubMeetings } from "../components/group/ClubListMobile";
import { useGroupNextEvents } from "./useGroupNextEvents";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

const SECRET = { id: "secret-meeting", info: { groupId: "g1", kind: "CLUB_MEETING", visibility: "GROUP", status: "OPEN", startTime: Date.now() + 86_400_000, name: "회원 전용 새벽 정모" }, counters: { totalRegistered: 17 } };

/** 휴대폰 클럽 목록의 다가오는 모임 경로 — 실제 훅과 실제 목록, 매 커밋 직후 DOM 글자를 기록한다. */
function Upcoming({ uid, commits }: { uid: string; commits: string[] }) {
  const { eventByGroup } = useGroupNextEvents(["g1"], undefined, false, uid);
  return <><UpcomingClubMeetings events={[...eventByGroup.values()]} groups={[{ id: "g1", name: "비공개 클럽" }]} /><Commit uid={uid} commits={commits} /></>;
}
function Commit({ uid, commits }: { uid: string; commits: string[] }) {
  // 레이아웃 효과는 DOM 반영 직후·훅의 effect(상태 지우기) 전에 돈다 — 첫 렌더가 무엇을 그렸는지 그대로 남는다.
  useLayoutEffect(() => { commits.push(`${uid}:${document.body.textContent ?? ""}`); });
  return null;
}

describe("account switch (#1842)", () => {
  beforeEach(() => {
    installEventDiscoveryFixture();
    setCollectionDocs("events", [SECRET]);
  });

  it("A 로 다가오는 모임을 읽은 뒤 B 로 바꾸면 첫 렌더부터 A 의 모임 제목·인원이 DOM 에 없다", async () => {
    const commits: string[] = [];
    const view = render(<MemoryRouter><Upcoming uid="user-a" commits={commits} /></MemoryRouter>);
    await waitFor(() => expect(document.body).toHaveTextContent("회원 전용 새벽 정모"));
    expect(document.body.textContent).toMatch(/17/);

    act(() => { view.rerender(<MemoryRouter><Upcoming uid="user-b" commits={commits} /></MemoryRouter>); });
    const asB = commits.filter((entry) => entry.startsWith("user-b:"));
    expect(asB.length).toBeGreaterThan(0);
    for (const text of asB) {
      expect(text).not.toContain("회원 전용 새벽 정모");
      expect(text).not.toMatch(/17/);
    }
  });

  it("훅은 바뀐 조회(계정)의 첫 렌더에 이전 결과 대신 빈 결과와 로딩을 낸다", async () => {
    const renders: Array<{ uid: string; ids: string[]; loading: boolean }> = [];
    const { result, rerender } = renderHook(({ uid }) => {
      const value = useGroupNextEvents(["g1"], undefined, false, uid);
      renders.push({ uid, ids: [...value.eventByGroup.values()].map((event) => event.id), loading: value.loading });
      return value;
    }, { initialProps: { uid: "user-a" } });
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("secret-meeting"));

    rerender({ uid: "user-b" });
    const firstAsB = renders.find((entry) => entry.uid === "user-b");
    expect(firstAsB).toEqual({ uid: "user-b", ids: [], loading: true });
  });
});
