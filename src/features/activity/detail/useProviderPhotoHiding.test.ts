// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { useProviderPhotoHiding } from "./useProviderPhotoHiding";

const hide = vi.hoisted(() => vi.fn());
vi.mock("../../../services/nativeActivityPhoto", () => ({ setProviderPhotosHidden: hide }));
const getDoc = vi.hoisted(() => vi.fn());
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...path: string[]) => path.join("/"), getDoc }));
vi.mock("../../../services/errorLogger", () => ({ logClientError: vi.fn() }));

const services = {} as FirebaseServices;
type Props = { activityId: string; uid: string; documentHiddenIds: string[] };
const setup = (initial: Props) => renderHook((props: Props) => useProviderPhotoHiding({ ...props, services, onDone: vi.fn(), onError: vi.fn() }), { initialProps: initial });

beforeEach(() => hide.mockReset());

const firestore = {} as Firestore;
type LiveProps = Props & { firestore?: Firestore; refreshEnabled?: boolean; documentFeedRevision?: string | null };
const live = (initial: Props, extra: { firestore?: Firestore; refreshEnabled?: boolean } = {}) => renderHook((props: LiveProps) =>
  useProviderPhotoHiding({ ...props, services, onDone: vi.fn(), onError: vi.fn() }), { initialProps: { firestore, refreshEnabled: true, ...extra, ...initial } as LiveProps });
const stored = (ids: string[]) => ({ data: () => ({ userId: "me", hiddenProviderPhotosV1: { version: 1, userId: "me", ids } }) });
let visibility: DocumentVisibilityState = "visible";
const showTab = async () => { visibility = "visible"; await act(async () => { document.dispatchEvent(new Event("visibilitychange")); }); };

describe("탭 복귀 때 숨김 목록 새로 읽기(다른 탭 변경 반영)", () => {
  beforeEach(() => {
    getDoc.mockReset(); getDoc.mockResolvedValue({ data: () => undefined }); visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => vi.restoreAllMocks());
  it("다른 탭에서 바꾼 목록을 탭이 다시 보일 때 반영한다", async () => {
    getDoc.mockResolvedValue(stored(["1"]));
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await showTab();
    await waitFor(() => expect(view.result.current.hiddenIds).toEqual(["1"]));
    expect(getDoc).toHaveBeenCalledWith("activities/a");
  });
  it("탭이 가려질 때와 refreshEnabled 가 아닐 때는 읽지 않는다", async () => {
    const first = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    visibility = "hidden";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    first.unmount();
    live({ activityId: "a", uid: "me", documentHiddenIds: [] }, { refreshEnabled: false });
    await showTab();
    expect(getDoc).toHaveBeenCalledTimes(0);
  });
  it("이 탭에서 숨긴 뒤 다른 탭에서 복원하고 돌아오면 복원을 따른다", async () => {
    hide.mockResolvedValue(["1"]);
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await act(() => view.result.current.change(["1"], true));
    expect(view.result.current.hiddenIds).toEqual(["1"]);
    getDoc.mockResolvedValue(stored([]));
    await showTab();
    await waitFor(() => expect(view.result.current.hiddenIds).toEqual([]));
    expect(view.result.current.overriding).toBe(false);
  });
  it("새로 읽은 뒤 문서가 바뀌었다 원래 값으로 돌아와도 새로 읽은 옛 값을 되살리지 않는다", async () => {
    getDoc.mockResolvedValue(stored(["1"]));
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await showTab();
    await waitFor(() => expect(view.result.current.hiddenIds).toEqual(["1"]));
    view.rerender({ firestore, refreshEnabled: true, activityId: "a", uid: "me", documentHiddenIds: ["2"] });
    view.rerender({ firestore, refreshEnabled: true, activityId: "a", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
  });
  it("다른 활동에 갔다 돌아오거나 Firestore 가 바뀌면 새로 읽은 값을 버린다", async () => {
    getDoc.mockResolvedValue(stored(["1"]));
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await showTab();
    await waitFor(() => expect(view.result.current.hiddenIds).toEqual(["1"]));
    view.rerender({ firestore, refreshEnabled: true, activityId: "b", uid: "me", documentHiddenIds: [] });
    view.rerender({ firestore, refreshEnabled: true, activityId: "a", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
    await showTab();
    await waitFor(() => expect(view.result.current.hiddenIds).toEqual(["1"]));
    view.rerender({ firestore: {} as Firestore, refreshEnabled: true, activityId: "a", uid: "me", documentHiddenIds: [] });
    expect(view.result.current.hiddenIds).toEqual([]);
  });
  it("조회가 겹치면 늦게 도착한 이전 조회 응답이 최신 값을 덮지 않는다", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    getDoc.mockImplementation(() => new Promise(r => { resolvers.push(r); }));
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await showTab();
    await showTab();
    await act(async () => { resolvers[1](stored(["2"])); });
    await waitFor(() => expect(view.result.current.hiddenIds).toEqual(["2"]));
    await act(async () => { resolvers[0](stored(["1"])); });
    expect(view.result.current.hiddenIds).toEqual(["2"]);
  });
  it("저장 중 탭에 복귀하면 조회를 미뤘다가 저장이 끝난 뒤 조회해, 저장 결과를 버리지 않는다", async () => {
    let resolveSave!: (ids: string[]) => void;
    hide.mockReturnValue(new Promise<string[]>(r => { resolveSave = r; }));
    getDoc.mockResolvedValue(stored(["1"]));
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    let pending!: Promise<void>;
    act(() => { pending = view.result.current.change(["1"], true); });
    await showTab();
    expect(getDoc).not.toHaveBeenCalled();
    await act(async () => { resolveSave(["1"]); await pending; });
    expect(view.result.current.hiddenIds).toEqual(["1"]);
    await waitFor(() => expect(getDoc).toHaveBeenCalledTimes(1));
    expect(view.result.current.hiddenIds).toEqual(["1"]);
  });
  it("저장 뒤 활동 문서를 다시 읽어 새 피드 본문을 내준다(복원한 사진이 옛 본문에는 없다)", async () => {
    hide.mockResolvedValue([]);
    const feed = { version: 1, photos: [{ id: "1" }] };
    getDoc.mockResolvedValue({ data: () => ({ userId: "me", hiddenProviderPhotosV1: { version: 1, userId: "me", ids: [] }, feedContentV1: feed }) });
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: ["1"] });
    expect(view.result.current.feedContentV1).toBeUndefined();
    await act(() => view.result.current.change(["1"], false));
    await waitFor(() => expect(view.result.current.feedContentV1).toBe(feed));
    expect(view.result.current.hiddenIds).toEqual([]);
    // 새로 읽은 문서의 본문을 쓰므로 사진 총수도 현재 값이다
    expect(view.result.current.overriding).toBe(false);
  });
  it("새로 읽은 본문 뒤 화면 문서의 피드 본문 리비전이 바뀌면 문서를 따른다(숨김 목록이 같아도)", async () => {
    const feed = { version: 1, revision: "r2" };
    getDoc.mockResolvedValue({ data: () => ({ userId: "me", hiddenProviderPhotosV1: { version: 1, userId: "me", ids: ["1"] }, feedContentV1: feed }) });
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: ["1"] });
    await showTab();
    await waitFor(() => expect(view.result.current.feedContentV1).toBe(feed));
    view.rerender({ firestore, refreshEnabled: true, activityId: "a", uid: "me", documentHiddenIds: ["1"], documentFeedRevision: "r3" } as LiveProps);
    expect(view.result.current.feedContentV1).toBeUndefined();
  });
  it("저장 요청보다 먼저 시작한 조회의 늦은 응답은 저장 결과를 덮지 않는다", async () => {
    let resolveRead!: (value: unknown) => void;
    getDoc.mockReturnValueOnce(new Promise(r => { resolveRead = r; })).mockResolvedValue(stored(["1"]));
    hide.mockResolvedValue(["1"]);
    const view = live({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await showTab();
    await act(() => view.result.current.change(["1"], true));
    await act(async () => { resolveRead(stored([])); });
    expect(view.result.current.hiddenIds).toEqual(["1"]);
  });
});

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
  it("요청 중 문서가 바뀌었다 원래 값으로 돌아와도, 늦은 응답으로 최신 상태를 덮지 않는다", async () => {
    let resolve!: (ids: string[]) => void;
    hide.mockReturnValue(new Promise<string[]>(r => { resolve = r; }));
    const view = setup({ activityId: "a", uid: "me", documentHiddenIds: [] });
    let pending!: Promise<void>;
    act(() => { pending = view.result.current.change(["1"], true); });
    view.rerender({ activityId: "a", uid: "me", documentHiddenIds: ["1"] });
    view.rerender({ activityId: "a", uid: "me", documentHiddenIds: [] });
    await act(async () => { resolve(["1"]); await pending; });
    expect(view.result.current.hiddenIds).toEqual([]);
    expect(view.result.current.busy).toBe(false);
  });
});
