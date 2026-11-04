import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { useSpectatorPreferences } from "./preferences";
beforeEach(() => localStorage.clear());
it("친구·팔로우·검색·지도 모드를 재진입 후 복원하고 계정과 모임을 분리한다", () => {
  const first = renderHook(() => useSpectatorPreferences("member", "club", "meeting"));
  act(() => first.result.current.update({selectedUid: "friend", followed: ["friend"], search: "친구", followingOnly: true, mapMode: "rider"}));
  first.unmount();
  const next = renderHook(({uid, event}) => useSpectatorPreferences(uid, "club", event), {initialProps: {uid: "member", event: "meeting"}});
  expect(next.result.current.value).toEqual({selectedUid: "friend", followed: ["friend"], search: "친구", followingOnly: true, mapMode: "rider"});
  next.rerender({uid: "other", event: "meeting"});
  expect(next.result.current.value.selectedUid).toBeNull();
  next.rerender({uid: "member", event: "other"});
  expect(next.result.current.value.followed).toEqual([]);
  next.rerender({uid: "member", event: "meeting"});
  expect(next.result.current.value.selectedUid).toBe("friend");
});
