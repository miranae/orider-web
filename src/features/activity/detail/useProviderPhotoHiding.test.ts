// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { useProviderPhotoHiding } from "./useProviderPhotoHiding";

const hide = vi.hoisted(() => vi.fn());
vi.mock("../../../services/nativeActivityPhoto", () => ({ setProviderPhotosHidden: hide }));

const services = {} as FirebaseServices;
type Props = { activityId: string; uid: string; documentHiddenIds: string[] };
const setup = (initial: Props) => renderHook((props: Props) => useProviderPhotoHiding({ ...props, services, onDone: vi.fn(), onError: vi.fn() }), { initialProps: initial });

beforeEach(() => hide.mockReset());

describe("Strava 사진 숨김 상태", () => {
  it("저장 직후엔 응답을 쓰고, 문서 목록이 바뀌면 문서를 따른다(다른 탭 복원 포함)", async () => {
    hide.mockResolvedValue(["1"]);
    const empty: string[] = [];
    const view = setup({ activityId: "a", uid: "me", documentHiddenIds: empty });
    await act(() => view.result.current.change(["1"], true));
    expect(view.result.current.hiddenIds).toEqual(["1"]);
    expect(view.result.current.overriding).toBe(true);
    view.rerender({ activityId: "a", uid: "me", documentHiddenIds: ["1"] });
    expect(view.result.current.overriding).toBe(false);
    // 다른 탭에서 다시 보이게 해 문서가 원래 목록으로 돌아와도 옛 임시 값을 되살리지 않는다
    view.rerender({ activityId: "a", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
  });
  it("다른 활동으로 옮기면 임시 값을 버리고, 돌아와도 되살리지 않는다", async () => {
    hide.mockResolvedValue(["1"]);
    const view = setup({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await act(() => view.result.current.change(["1"], true));
    view.rerender({ activityId: "b", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
    view.rerender({ activityId: "a", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
  });
  it("활동을 옮긴 뒤 도착한 늦은 응답은 적용하지 않는다", async () => {
    let resolve!: (ids: string[]) => void;
    hide.mockReturnValue(new Promise<string[]>(r => { resolve = r; }));
    const view = setup({ activityId: "a", uid: "me", documentHiddenIds: [] });
    let pending!: Promise<void>;
    act(() => { pending = view.result.current.change(["1"], true); });
    view.rerender({ activityId: "b", uid: "me", documentHiddenIds: [] });
    await act(async () => { resolve(["1"]); await pending; });
    view.rerender({ activityId: "a", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
    expect(view.result.current.busy).toBe(false);
  });
});
