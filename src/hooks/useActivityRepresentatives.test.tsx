import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { doc, limit, onSnapshot, query, type Firestore } from "firebase/firestore";
import type { Activity } from "@shared/types";
import { acceptedPhysicalActivities } from "../utils/estimateTSS";
import { MAX_MISSING_REPRESENTATIVES, useActivityRepresentatives, withActivityRepresentatives } from "./useActivityRepresentatives";

const monthStart = Date.UTC(2026, 9, 1);
const fragment = { id: "fragment", userId: "rider", source: "orider", type: "Ride", startTime: monthStart,
  endTime: monthStart + 3600000, rollupSupersededBy: "full", summary: {distance: 3000, ridingTimeMillis: 3600000} } as unknown as Activity;
const full = { ...fragment, id: "full", source: "strava", startTime: monthStart - 30 * 3600000,
  summary: {distance: 100000, ridingTimeMillis: 31 * 3600000}, rollupSupersededBy: null } as Activity;
type Callback = (snapshot: never) => void;
let callbacks: Map<string, Callback>;
let stops: Map<string, ReturnType<typeof vi.fn>>;
const emit = (id: string, row: Activity | null) => act(() => callbacks.get(id)?.({exists: () => row !== null, data: () => row} as never));

beforeEach(() => {
  callbacks = new Map();
  stops = new Map();
  vi.mocked(onSnapshot).mockClear().mockImplementation((ref, optionsOrNext, callback) => {
    const next = typeof optionsOrNext === "function" ? optionsOrNext : callback;
    const id = (ref as unknown as {path: string}).path.split("/").at(-1)!;
    callbacks.set(id, next as Callback);
    const stop = vi.fn();
    stops.set(id, stop);
    return stop;
  });
});
afterEach(cleanup);

it("30시간 밖 대표만 조회하고 동시 후보를 합치고 비활성 구독은 해제한다", async () => {
  const {result, rerender} = renderHook(({rows}) => useActivityRepresentatives(rows, "rider"), {initialProps: {rows: [fragment]}});
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(true);
  emit("full", full);
  const accepted = () => acceptedPhysicalActivities(withActivityRepresentatives([fragment], result.current.representatives, "rider"));
  expect(accepted().map(row => row.id)).toEqual(["full"]);
  expect(accepted().filter(row => row.startTime >= monthStart)).toEqual([]);
  rerender({rows: []});
  rerender({rows: [fragment, {...fragment, id: "second"}]});
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  // 대표 삭제·무효 상태는 서버 flag 정리보다 먼저 원본 조각을 복원한다.
  emit("full", {...full, invalidSummary: true} as unknown as Activity);
  expect(accepted().map(row => row.id)).toEqual(["fragment"]);
  emit("full", null);
  expect(accepted().map(row => row.id)).toEqual(["fragment"]);
  expect(acceptedPhysicalActivities(withActivityRepresentatives([fragment, full], result.current.representatives, "rider")).map(row => row.id)).toEqual(["fragment"]);
  // 오래된 flag가 남아도 최신 대표 시각이 다른 운동이면 조각을 억제하지 않는다.
  emit("full", {...full, startTime: monthStart - 100 * 3600000, endTime: monthStart - 99 * 3600000});
  expect(accepted().map(row => row.id)).toContain("fragment");
  rerender({rows: [{...fragment, rollupSupersededBy: null} as Activity]});
  expect(onSnapshot).toHaveBeenCalledTimes(3); // 시각 정정으로 그룹 증거 조회 1회
});

it("owner 전환은 이전 구독과 지연 callback을 격리하고 다른 owner 후보는 조회하지 않는다", async () => {
  const {result, rerender} = renderHook(({uid, rows}) => useActivityRepresentatives(rows, uid), {initialProps: {uid: "rider", rows: [fragment]}});
  const previousCallback = callbacks.get("full")!;
  rerender({uid: "other", rows: [fragment]});
  expect(stops.get("full")).toHaveBeenCalledTimes(1);
  act(() => previousCallback({exists: () => true, data: () => full} as never));
  await waitFor(() => expect(result.current.representatives.size).toBe(0));
  expect(onSnapshot).toHaveBeenCalledTimes(1);
});

it("교차 owner 대표나 권한 오류는 미확인 처리하고 잘못된 합계를 제공하지 않는다", () => {
  const {result} = renderHook(() => useActivityRepresentatives([fragment], "rider"));
  emit("full", {...full, userId: "other"});
  expect(result.current.error).toBe(true);
  expect(result.current.representatives.get("full")).toBeNull();
});

it("상한 초과는 조회 전에 차단하고 무한 fan-out을 만들지 않는다", () => {
  const rows = Array.from({length: MAX_MISSING_REPRESENTATIVES + 1}, (_, index) => ({...fragment, id: `part-${index}`, rollupSupersededBy: `full-${index}`} as Activity));
  const {result} = renderHook(() => useActivityRepresentatives(rows, "rider"));
  expect(result.current.error).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(onSnapshot).not.toHaveBeenCalled();
});


it("권한 거절은 결과를 0으로 확정하지 않고 명시적 재시도 전까지 추가 조회하지 않는다", () => {
  let reject: (() => void) | undefined;
  vi.mocked(onSnapshot).mockImplementation((_ref, _next, error) => { reject = error as () => void; return vi.fn(); });
  const {result, rerender} = renderHook(() => useActivityRepresentatives([fragment], "rider"));
  act(() => reject!());
  expect(result.current.error).toBe(true);
  expect(result.current.loading).toBe(false);
  rerender();
  expect(onSnapshot).toHaveBeenCalledTimes(1);
});


it("직전 월 preload나 방문 순서와 무관하게 고정 월에 이미 아는 대표를 보강한다", () => {
  const {result, rerender} = renderHook(({known}) => useActivityRepresentatives([fragment], "rider", known), {initialProps: {known: [fragment, full]}});
  const accepted = () => acceptedPhysicalActivities(withActivityRepresentatives([fragment], result.current.representatives, "rider"));
  expect(accepted().map(row => row.id)).toEqual(["full"]);
  expect(onSnapshot).not.toHaveBeenCalled();
  rerender({known: [full, fragment]});
  expect(accepted().filter(row => row.startTime >= monthStart)).toEqual([]);
  expect(onSnapshot).not.toHaveBeenCalled();
});

it("직접 겹치지 않는 대표는 제한된 sibling 증거로 전이적 그룹을 재구성한다", () => {
  const farFull = {...full, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000, summary: {distance: 100000, ridingTimeMillis: 7200000}} as Activity;
  const bridge = {...fragment, id: "bridge", startTime: monthStart - 59 * 3600000, endTime: fragment.endTime, summary: {distance: 100000, ridingTimeMillis: 60 * 3600000}} as Activity;
  const {result} = renderHook(() => useActivityRepresentatives([fragment], "rider", [farFull, fragment]));
  expect(onSnapshot).toHaveBeenCalledTimes(2); // 대표 1문서 + 소유자 제한 그룹 query
  expect(result.current.loading).toBe(true);
  emit("full", farFull);
  act(() => callbacks.get("activities")!({docs: [{id: bridge.id, data: () => bridge}, {id: fragment.id, data: () => fragment}]} as never));
  const accepted = () => acceptedPhysicalActivities(withActivityRepresentatives([fragment], result.current.representatives, "rider"));
  expect(result.current.loading).toBe(false);
  expect(accepted().map(row => row.id)).toEqual(["full"]);
  act(() => callbacks.get("activities")!({docs: [{id: bridge.id, data: () => ({...bridge, invalidSummary: true})}, {id: fragment.id, data: () => fragment}]} as never));
  expect(accepted().map(row => row.id)).toContain("fragment");
  expect(query).toHaveBeenCalled();
});

it("summary 없는 대표를 정규화하고 측정값이나 부하 0을 만들지 않는다", () => {
  const {result} = renderHook(() => useActivityRepresentatives([fragment], "rider"));
  emit("full", {...full, summary: undefined} as unknown as Activity);
  const selected = acceptedPhysicalActivities(withActivityRepresentatives([fragment], result.current.representatives, "rider"));
  expect(selected[0].summary).toEqual({});
  expect(selected[0].summary.distance).toBeUndefined();
});

it("과거 월 탐색은 활성 listener 상한을 소모하지 않고 해제한 callback을 격리한다", () => {
  const {result, rerender} = renderHook(({rows}) => useActivityRepresentatives(rows, "rider"), {initialProps: {rows: [fragment]}});
  emit("full", full);
  const previousCallback = callbacks.get("full")!;
  for (let index = 0; index < 40; index++) {
    const row = {...fragment, id: `part-${index}`, rollupSupersededBy: `full-${index}`} as Activity;
    rerender({rows: [row]});
    emit(`full-${index}`, {...full, id: `full-${index}`});
    expect(result.current.error).toBe(false);
  }
  rerender({rows: [fragment]});
  expect(result.current.error).toBe(false);
  expect(result.current.loading).toBe(false); // cached 값으로 즉시 표시하며 재검증
  act(() => previousCallback({exists: () => false} as never));
  expect(result.current.representatives.get("full")?.id).toBe("full");
  expect([...stops.values()].filter(stop => stop.mock.calls.length === 0)).toHaveLength(1);
});


it("그룹 witness 초기 스캔은 직렬화하고 남은 총 문서 예산으로 다음 쿼리를 제한한다", () => {
  vi.mocked(limit).mockClear();
  const roots = Array.from({length: 7}, (_, index) => ({...fragment, id: `part-${index}`, rollupSupersededBy: `full-${index}`} as Activity));
  const known = roots.concat(roots.map((row, index) => ({...full, id: `full-${index}`, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000})));
  const {result} = renderHook(() => useActivityRepresentatives(roots, "rider", known));
  for (let group = 0; group < 7; group++) {
    const readCount = group === 6 ? 21 : 30;
    const witnesses = Array.from({length: readCount}, (_, index) => ({...roots[group], id: `witness-${group}-${index}`}));
    act(() => callbacks.get("activities")!({docs: witnesses.map(row => ({id: row.id, data: () => row}))} as never));
  }
  expect(limit).toHaveBeenLastCalledWith(21);
  expect(result.current.error).toBe(true);
  expect(result.current.loading).toBe(false);
});


it("확실히 제외된 무효 원본은 대표 조회나 구독 예산을 소모하지 않는다", () => {
  const invalidRows = Array.from({length: 40}, (_, index) => ({...fragment, id: `invalid-${index}`, invalidSummary: true, rollupSupersededBy: index === 0 ? "full" : `missing-${index}`} as Activity));
  const {result, rerender} = renderHook(({rows}) => useActivityRepresentatives(rows, "rider"), {initialProps: {rows: invalidRows}});
  expect(result.current.error).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(onSnapshot).not.toHaveBeenCalled();
  expect(withActivityRepresentatives(invalidRows, result.current.representatives, "rider")).toHaveLength(40);
  rerender({rows: [...invalidRows, fragment]});
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  emit("full", full);
  expect(result.current.error).toBe(false);
  expect(acceptedPhysicalActivities(withActivityRepresentatives([...invalidRows, fragment], result.current.representatives, "rider")).map(row => row.id)).toEqual(["full"]);
});


it("known 편입 후에도 direct 구독을 유지하고 다음 live 결과로 수렴한다", () => {
  const {result, rerender} = renderHook(({known}) => useActivityRepresentatives([fragment], "rider", known), {initialProps: {known: [fragment]}});
  emit("full", full);
  const fresh = {...full, summary: {...full.summary, distance: 20000}};
  const stop = stops.get("full")!;
  rerender({known: [fragment, fresh]});
  expect(result.current.representatives.get("full")?.summary.distance).toBe(100000);
  expect(stop).not.toHaveBeenCalled();
  emit("full", fresh);
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe(false);
});

it("late stale known 새 객체는 더 최신 live snapshot을 덮지 않는다", () => {
  const stale = {...full, startTime: monthStart - 100 * 3600000, endTime: monthStart - 99 * 3600000};
  const {result, rerender} = renderHook(({known}) => useActivityRepresentatives([fragment], "rider", known), {initialProps: {known: [fragment, stale]}});
  const fresh = {...full, summary: {...full.summary, distance: 20000}};
  emit("full", fresh);
  rerender({known: [fragment, stale]});
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
  const latest = {...fresh, summary: {...fresh.summary, distance: 30000}};
  rerender({known: [fragment, {...stale}]});
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
  rerender({known: [fragment, latest]});
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
  emit("full", latest);
  expect(result.current.representatives.get("full")?.summary.distance).toBe(30000);
});

it.each(["deleted", "foreign-owner", "invalid"] as const)("활성 direct %s 결과를 late known이 부활시키지 않는다", kind => {
  const {result, rerender} = renderHook(({known}) => useActivityRepresentatives([fragment], "rider", known), {initialProps: {known: [fragment]}});
  emit("full", kind === "deleted" ? null : {...full, ...(kind === "foreign-owner" ? {userId: "other"} : {invalidSummary: true})} as Activity);
  rerender({known: [fragment, {...full}]});
  const accepted = acceptedPhysicalActivities(withActivityRepresentatives([fragment], result.current.representatives, "rider"));
  expect(accepted.map(row => row.id)).toEqual(["fragment"]);
  expect(result.current.error).toBe(kind === "foreign-owner");
  expect(stops.get("full")).not.toHaveBeenCalled();
});

it("활성 direct 권한 실패를 known 편입으로 숨기거나 재구독하지 않는다", () => {
  const {result, rerender} = renderHook(({known}) => useActivityRepresentatives([fragment], "rider", known), {initialProps: {known: [fragment]}});
  const reject = vi.mocked(onSnapshot).mock.calls[0][2] as () => void;
  act(() => reject());
  rerender({known: [fragment, {...full}]});
  expect(result.current.error).toBe(true);
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  expect(stops.get("full")).not.toHaveBeenCalled();
});

it("월 이탈한 LRU는 known보다 우선하지 않고 재진입한 새 listener 세대만 권위를 얻는다", () => {
  const {result, rerender} = renderHook(({rows, known}) => useActivityRepresentatives(rows, "rider", known), {
    initialProps: {rows: [fragment], known: [fragment]},
  });
  emit("full", full);
  const oldCallback = callbacks.get("full")!;
  const stop = stops.get("full")!;
  rerender({rows: [], known: []});
  expect(stop).toHaveBeenCalledTimes(1);
  const fresh = {...full, summary: {...full.summary, distance: 20000}};
  rerender({rows: [fragment], known: [fragment, fresh]});
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
  expect(onSnapshot).toHaveBeenCalledTimes(1); // known만으로 연결이 증명되면 신규 조회 없음
  act(() => oldCallback({exists: () => true, data: () => full} as never));
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
  rerender({rows: [fragment], known: [fragment]});
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  emit("full", fresh);
  rerender({rows: [fragment], known: [fragment, {...full}]});
  expect(result.current.representatives.get("full")?.summary.distance).toBe(20000);
});

it("활성 group witness는 late known보다 우선하고 해제 뒤에는 known이 우선한다", () => {
  const farFull = {...full, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000};
  const bridge = {...fragment, id: "bridge", startTime: monthStart - 59 * 3600000, endTime: fragment.endTime};
  const {result, rerender} = renderHook(({rows, known}) => useActivityRepresentatives(rows, "rider", known), {
    initialProps: {rows: [fragment], known: [fragment, farFull, bridge]},
  });
  const updatedBridge = {...bridge, invalidSummary: true} as unknown as Activity;
  act(() => callbacks.get("activities")!({docs: [{id: bridge.id, data: () => updatedBridge}]} as never));
  rerender({rows: [fragment], known: [fragment, farFull, {...bridge}]});
  expect(result.current.representatives.get("bridge")).toMatchObject({invalidSummary: true});
  rerender({rows: [], known: [bridge]});
  expect(result.current.representatives.get("bridge")).not.toHaveProperty("invalidSummary");
});


it("group witness가 원본 구간을 정정해도 같은 raw 링크 동안 재구독 루프를 만들지 않는다", () => {
  const farFull = {...full, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000};
  const {result, rerender} = renderHook(({rows}) => useActivityRepresentatives(rows, "rider", [fragment, farFull]), {
    initialProps: {rows: [fragment]},
  });
  const groupCallback = callbacks.get("activities")!;
  const stop = stops.get("activities")!;
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  const corrected = {...fragment, startTime: farFull.startTime, endTime: farFull.endTime};
  for (let index = 0; index < 3; index++) {
    act(() => groupCallback({docs: [{id: corrected.id, data: () => corrected}]} as never));
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
    expect(result.current.representatives.get("fragment")?.startTime).toBe(farFull.startTime);
  }
  // 권한 경계 위반·그룹 overflow도 재구독으로 우회하지 않는다.
  act(() => groupCallback({docs: [{id: corrected.id, data: () => ({...corrected, userId: "other"})}]} as never));
  expect(result.current.error).toBe(true);
  act(() => groupCallback({docs: Array.from({length: 31}, (_, index) => ({id: `overflow-${index}`, data: () => corrected}))} as never));
  expect(result.current.error).toBe(true);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  expect(stop).not.toHaveBeenCalled();
  act(() => groupCallback({docs: []} as never));
  expect(result.current.error).toBe(false);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
  rerender({rows: []});
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => groupCallback({docs: [{id: corrected.id, data: () => corrected}]} as never));
  expect(result.current.representatives.get("fragment")?.startTime).toBe(fragment.startTime);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
});

it("활성 group 오류를 known이나 재렌더가 숨기거나 자동 재시도하지 않는다", () => {
  const farFull = {...full, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000};
  const {result, rerender} = renderHook(() => useActivityRepresentatives([fragment], "rider", [fragment, farFull]));
  const reject = vi.mocked(onSnapshot).mock.calls[1][2] as () => void;
  act(() => reject());
  for (let index = 0; index < 3; index++) rerender();
  expect(result.current.error).toBe(true);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
});

it("group owner 세대 전환은 이전 witness callback을 격리한다", () => {
  const farFull = {...full, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000};
  const {result, rerender} = renderHook(({uid}) => useActivityRepresentatives([fragment], uid, [fragment, farFull]), {
    initialProps: {uid: "rider"},
  });
  const previous = callbacks.get("activities")!;
  const stop = stops.get("activities")!;
  rerender({uid: "other"});
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => previous({docs: [{id: fragment.id, data: () => fragment}]} as never));
  expect(result.current.representatives.size).toBe(0);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
});

it("uses the injected Firebase instance and clears old-instance representative callbacks", () => {
  const first = {} as Firestore;
  const second = {} as Firestore;
  const h = renderHook(({ firestore }) => useActivityRepresentatives([fragment], "rider", [fragment], firestore), { initialProps: { firestore: first } });
  expect(doc).toHaveBeenLastCalledWith(first, "activities", "full");
  const oldCallback = callbacks.get("full")!;
  const oldStop = stops.get("full")!;
  h.rerender({ firestore: second });
  expect(oldStop).toHaveBeenCalledOnce();
  expect(doc).toHaveBeenLastCalledWith(second, "activities", "full");
  act(() => oldCallback({ exists: () => true, data: () => full } as never));
  expect(h.result.current.representatives.has("full")).toBe(false);
  emit("full", full);
  expect(h.result.current.representatives.get("full")?.id).toBe("full");
});

it.each(["missing", "stale"])("holds %s cached direct evidence until server metadata confirms it", kind => {
  const h = renderHook(() => useActivityRepresentatives([fragment], "rider", [fragment], undefined, true));
  expect(onSnapshot).toHaveBeenLastCalledWith(expect.anything(), { includeMetadataChanges: true }, expect.any(Function), expect.any(Function));
  act(() => callbacks.get("full")!({ exists: () => kind !== "missing", data: () => full, metadata: { fromCache: true, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(true);
  expect(h.result.current.representatives.has("full")).toBe(false);
  act(() => callbacks.get("full")!({ exists: () => true, data: () => full, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.representatives.get("full")?.id).toBe("full");
  // 문서 내용이 같아도 pending-write metadata가 바뀌면 정확한 집계를 보류한다.
  act(() => callbacks.get("full")!({ exists: () => true, data: () => full, metadata: { fromCache: false, hasPendingWrites: true } } as never));
  expect(h.result.current.loading).toBe(true);
  act(() => callbacks.get("full")!({ exists: () => true, data: () => full, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(false);
});

it("waits for server-confirmed group witnesses, including metadata-only group confirmation", () => {
  const farFull = { ...full, startTime: monthStart - 60 * 3600000, endTime: monthStart - 58 * 3600000, summary: { distance: 100000, ridingTimeMillis: 7200000 } } as Activity;
  const bridge = { ...fragment, id: "bridge", startTime: monthStart - 59 * 3600000, endTime: fragment.endTime, summary: { distance: 100000, ridingTimeMillis: 60 * 3600000 } } as Activity;
  const h = renderHook(() => useActivityRepresentatives([fragment], "rider", [fragment, farFull], undefined, true));
  act(() => callbacks.get("full")!({ exists: () => true, data: () => farFull, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  const docs = [{ id: bridge.id, data: () => bridge }, { id: fragment.id, data: () => fragment }];
  act(() => callbacks.get("activities")!({ docs, metadata: { fromCache: true, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(true);
  expect(h.result.current.representatives.has("bridge")).toBe(false);
  act(() => callbacks.get("activities")!({ docs, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.representatives.has("bridge")).toBe(true);
});

it("does not reuse an inactive cached confirmation when a range opens a new strict subscription", () => {
  const h = renderHook(({ rows }) => useActivityRepresentatives(rows, "rider", rows, undefined, true), { initialProps: { rows: [fragment] } });
  act(() => callbacks.get("full")!({ exists: () => true, data: () => full, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(false);
  h.rerender({ rows: [] });
  h.rerender({ rows: [fragment] });
  expect(h.result.current.loading).toBe(true);
  act(() => callbacks.get("full")!({ exists: () => true, data: () => full, metadata: { fromCache: true, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(true);
  act(() => callbacks.get("full")!({ exists: () => true, data: () => full, metadata: { fromCache: false, hasPendingWrites: false } } as never));
  expect(h.result.current.loading).toBe(false);
});
