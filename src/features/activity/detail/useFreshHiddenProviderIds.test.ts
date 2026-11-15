// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { useFreshHiddenProviderIds } from "./useFreshHiddenProviderIds";

const getDoc = vi.hoisted(() => vi.fn());
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...path: string[]) => path.join("/"), getDoc }));
vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn() }));

const firestore = {} as Firestore;
type Props = { activityId: string; enabled: boolean; documentHiddenIds: string[] };
const setup = (initial: Props) => renderHook((props: Props) => useFreshHiddenProviderIds({ ...props, firestore }), { initialProps: initial });
const stored = (ids: string[]) => ({ data: () => ({ userId: "me", hiddenProviderPhotosV1: { version: 1, userId: "me", ids } }) });
let visibility: DocumentVisibilityState = "visible";
const showTab = async () => {
  visibility = "visible";
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
};

beforeEach(() => {
  getDoc.mockReset();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => vi.restoreAllMocks());

describe("탭 복귀 때 Strava 사진 숨김 목록 새로 읽기", () => {
  it("다른 탭에서 바꾼 숨김 목록을 탭이 다시 보일 때 반영한다", async () => {
    getDoc.mockResolvedValue(stored(["1"]));
    const view = setup({ activityId: "a", enabled: true, documentHiddenIds: [] });
    expect(view.result.current).toEqual([]);
    await showTab();
    await waitFor(() => expect(view.result.current).toEqual(["1"]));
    expect(getDoc).toHaveBeenCalledWith("activities/a");
  });
  it("탭이 가려질 때는 읽지 않는다", async () => {
    setup({ activityId: "a", enabled: true, documentHiddenIds: [] });
    visibility = "hidden";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(getDoc).not.toHaveBeenCalled();
  });
  it("주인의 Strava 활동이 아니면 읽지 않는다", async () => {
    const view = setup({ activityId: "a", enabled: false, documentHiddenIds: ["2"] });
    await showTab();
    expect(getDoc).not.toHaveBeenCalled();
    expect(view.result.current).toEqual(["2"]);
  });
  it("새로 읽은 뒤 문서 값이 바뀌면 문서를 따른다", async () => {
    getDoc.mockResolvedValue(stored(["1"]));
    const view = setup({ activityId: "a", enabled: true, documentHiddenIds: [] });
    await showTab();
    await waitFor(() => expect(view.result.current).toEqual(["1"]));
    view.rerender({ activityId: "a", enabled: true, documentHiddenIds: ["3"] });
    expect(view.result.current).toEqual(["3"]);
  });
  it("다른 활동으로 옮긴 뒤 도착한 늦은 응답은 쓰지 않는다", async () => {
    let resolve!: (value: unknown) => void;
    getDoc.mockReturnValue(new Promise(r => { resolve = r; }));
    const view = setup({ activityId: "a", enabled: true, documentHiddenIds: [] });
    await showTab();
    view.rerender({ activityId: "b", enabled: true, documentHiddenIds: [] });
    await act(async () => { resolve(stored(["1"])); });
    expect(view.result.current).toEqual([]);
  });
  it("같은 목록이면 문서 배열을 그대로 돌려준다", async () => {
    const documentIds = ["1"];
    getDoc.mockResolvedValue(stored(["1"]));
    const view = setup({ activityId: "a", enabled: true, documentHiddenIds: documentIds });
    await showTab();
    await waitFor(() => expect(getDoc).toHaveBeenCalled());
    expect(view.result.current).toBe(documentIds);
  });
});
