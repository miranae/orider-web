import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFtpHistory } from "./useFtpHistory";

type Row = { id: string; changedAt: number; value: number; source: string };
type Constraint = { kind: string; args: unknown[] };
type Target = { path: string; constraints: Constraint[] };
const mock = vi.hoisted(() => ({
  db: {}, auth: { currentUser: { uid: "a" } as { uid: string } | null },
  rows: [] as Row[], reads: [] as { target: Target; returned: number }[],
  listeners: [] as { target: Target; next: (snapshot: unknown) => void; fail: (error: Error) => void; refresh: () => void; stop: ReturnType<typeof vi.fn> }[],
  failPage: false,
  pending: null as null | ((value: unknown) => void), defer: false,
}));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: mock.db, auth: mock.auth }) }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/firestore", () => {
  const select = (target: Target) => {
    let rows = [...mock.rows];
    for (const item of target.constraints.filter(item => item.kind === "where")) {
      const [field, op, value] = item.args as [keyof Row, string, number];
      rows = rows.filter(row => op === ">=" ? row[field] >= value : row[field] < value);
    }
    const ordering = target.constraints.filter(item => item.kind === "orderBy");
    const compare = (a: Row, b: Row) => {
      for (const item of ordering) {
        const field = item.args[0] === "__name__" ? "id" : item.args[0] as keyof Row;
        let result = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
        if (field === "id") {
          const left = new TextEncoder().encode(a.id), right = new TextEncoder().encode(b.id);
          result = 0;
          for (let index = 0; index < Math.min(left.length, right.length); index++) {
            if (left[index] !== right[index]) { result = left[index]! - right[index]!; break; }
          }
          if (!result) result = left.length - right.length;
        }
        if (result) return item.args[1] === "desc" ? -result : result;
      }
      return 0;
    };
    rows.sort(compare);
    const after = target.constraints.find(item => item.kind === "startAfter");
    if (after) rows = rows.filter(row => compare(row, { changedAt: after.args[0], id: after.args[1] } as Row) > 0);
    const size = target.constraints.find(item => item.kind === "limit");
    if (size) rows = rows.slice(0, size.args[0] as number);
    mock.reads.push({ target, returned: rows.length });
    return { docs: rows.map(row => ({ id: row.id, data: () => row })) };
  };
  const constraint = (kind: string) => (...args: unknown[]) => ({ kind, args });
  return {
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    documentId: () => "__name__",
    where: constraint("where"), orderBy: constraint("orderBy"), limit: constraint("limit"), startAfter: constraint("startAfter"),
    query: (ref: Target, ...constraints: Constraint[]) => ({ ...ref, constraints }),
    onSnapshot: (target: Target, next: (snapshot: unknown) => void, fail: (error: Error) => void) => {
      const stop = vi.fn(); mock.listeners.push({ target, next, fail, stop, refresh: () => next(select(target)) }); next(select(target)); return stop;
    },
    getDocs: async (target: Target) => {
      if (mock.failPage) throw new Error("offline");
      const snapshot = select(target);
      if (mock.defer) return new Promise(resolve => { mock.pending = resolve; });
      return snapshot;
    },
  };
});
const now = Date.UTC(2026, 10, 13);
const cutoff = now - 120 * 86400000;
const row = (id: string, changedAt: number, value = 250): Row => ({ id, changedAt, value, source: "manual" });
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  mock.db = {}; mock.auth = { currentUser: { uid: "a" } };
  mock.rows = []; mock.reads = []; mock.listeners = []; mock.failPage = false; mock.pending = null; mock.defer = false;
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("FTP bounded automatic history and explicit older pages", () => {
  it.each([[0, false, 2], [1, false, 2], [501, false, 2], [10000, false, 2], [501, true, 502]])(
    "initial document floors E=%i recent=%s are %i, with no writes or automatic older requests", (count, recent, floors) => {
      mock.rows = Array.from({ length: count }, (_, index) => row(String(index), (recent ? cutoff : 1) + index));
      const view = renderHook(() => useFtpHistory("a"));
      expect(mock.reads.reduce((sum, read) => sum + Math.max(1, read.returned), 0)).toBe(floors);
      expect(mock.listeners).toHaveLength(2);
      expect(view.result.current.entries).toHaveLength(recent ? count : Math.min(1, count));
      expect(view.result.current.loading).toBe(false);
      view.rerender(); expect(mock.reads).toHaveLength(2);
    },
  );
  it("keeps all cutoff ties and the exact predecessor; paginates all 501 ancient records only on demand", async () => {
    mock.rows = Array.from({ length: 501 }, (_, index) => row(String(index).padStart(4, "0"), 1));
    mock.rows.push(row("boundary-a", cutoff), row("boundary-z", cutoff), row("future", now + 1000));
    const view = renderHook(() => useFtpHistory("a"));
    expect(view.result.current.entries.map(entry => entry.id)).toEqual(["0500", "boundary-a", "boundary-z", "future"]);
    for (let page = 0; page < 11; page++) await act(() => view.result.current.loadOlder());
    expect(view.result.current.entries).toHaveLength(504);
    expect(view.result.current.hasMoreOlder).toBe(false);
    expect(mock.reads.slice(2).every(read => read.returned <= 50)).toBe(true);
    expect(mock.reads.slice(2).reduce((sum, read) => sum + Math.max(1, read.returned), 0)).toBe(501);
    expect(new Set(view.result.current.entries.map(entry => entry.id)).size).toBe(504);
    await act(() => view.result.current.loadOlder()); expect(mock.reads).toHaveLength(13);
  });
  it("retains loaded pages on failure and retries the same cursor without duplicate fetches", async () => {
    mock.rows = Array.from({ length: 101 }, (_, index) => row(String(index).padStart(3, "0"), index));
    const view = renderHook(() => useFtpHistory("a"));
    await act(() => view.result.current.loadOlder());
    const entries = view.result.current.entries;
    mock.failPage = true;
    await act(() => view.result.current.loadOlder());
    expect(view.result.current.entries).toEqual(entries); expect(view.result.current.error).toBe(true);
    mock.failPage = false;
    await act(async () => { await Promise.all([view.result.current.loadOlder(), view.result.current.loadOlder()]); });
    expect(view.result.current.entries).toHaveLength(100);
    expect(mock.reads).toHaveLength(4);
    expect(mock.reads[3]!.target.constraints.find(item => item.kind === "startAfter")?.args).toEqual([51, "051"]);
  });
  it("ignores late listeners/pages on account or same-UID SDK replacement, including inactive switches", async () => {
    mock.rows = [row("old", 1)];
    const view = renderHook(({ uid, active }) => useFtpHistory(uid, active), { initialProps: { uid: "a", active: true } });
    const old = [...mock.listeners];
    mock.defer = true;
    let request: Promise<void>;
    act(() => { request = view.result.current.loadOlder(); });
    await act(async () => { await Promise.resolve(); });
    mock.db = {};
    view.rerender({ uid: "a", active: false });
    expect(view.result.current.entries).toEqual([]);
    await act(async () => { mock.pending?.({ docs: [{ id: "stale", data: () => row("stale", 2) }] }); await request; });
    act(() => old[0]!.next({ docs: [{ id: "stale", data: () => row("stale", now) }] }));
    expect(view.result.current.entries).toEqual([]);
    expect(old.every(item => item.stop.mock.calls.length === 1)).toBe(true);
    mock.auth.currentUser = { uid: "b" };
    view.rerender({ uid: "b", active: false });
    expect(view.result.current.entries).toEqual([]);
    expect(mock.listeners).toHaveLength(2);
  });
  it("honestly exposes malformed baseline and listener errors, then accepts an old-entry edit on retry", () => {
    mock.rows = [row("old", 1, 0)];
    const view = renderHook(() => useFtpHistory("a"));
    expect(view.result.current.error).toBe(true);
    expect(view.result.current.entries).toEqual([]);
    mock.rows = [row("old", 1, 260)];
    act(() => view.result.current.retry());
    expect(view.result.current.error).toBe(false);
    expect(view.result.current.entries[0]?.value).toBe(260);
    act(() => mock.listeners.at(-1)!.fail(new Error("offline")));
    expect(view.result.current.error).toBe(true);
    expect(view.result.current.entries[0]?.value).toBe(260);
  });
  it("tracks edits/deletes of the exact old baseline and live boundary changes without all-history fallback", () => {
    mock.rows = [row("older", 1, 230), row("baseline", cutoff - 1, 240), row("edge", cutoff, 250)];
    const view = renderHook(() => useFtpHistory("a"));
    mock.rows = [row("older", 1, 235), row("edge", cutoff, 260)];
    act(() => mock.listeners.forEach(listener => listener.refresh()));
    expect(view.result.current.entries.map(entry => [entry.id, entry.value])).toEqual([["older", 235], ["edge", 260]]);
    expect(mock.listeners).toHaveLength(2);
    expect(mock.reads.every(read => read.target.constraints.some(item => item.kind === "where"))).toBe(true);
  });
  it("keeps malformed older-page coverage visibly incomplete even after a later valid page", async () => {
    mock.rows = Array.from({ length: 51 }, (_, index) => row(String(index).padStart(3, "0"), index + 1, index === 49 ? 0 : 250));
    const view = renderHook(() => useFtpHistory("a"));
    await act(() => view.result.current.loadOlder());
    expect(view.result.current.error).toBe(true);
    await act(() => view.result.current.loadOlder());
    expect(view.result.current.hasMoreOlder).toBe(false);
    expect(view.result.current.error).toBe(true);
    expect(view.result.current.entries).toHaveLength(50);
  });
  it("performs no database work when the SDK account disagrees or the view is inactive", async () => {
    mock.auth.currentUser = { uid: "other" };
    const view = renderHook(({ active }) => useFtpHistory("a", active), { initialProps: { active: true } });
    await act(() => view.result.current.loadOlder());
    expect(mock.reads).toEqual([]);
    expect(view.result.current.entries).toEqual([]);
    view.rerender({ active: false });
    mock.auth.currentUser = { uid: "a" };
    await act(() => view.result.current.loadOlder());
    expect(mock.reads).toEqual([]);
  });

  it("invalidates pending pages and the visible cache when the SDK User object changes with the same UID", async () => {
    mock.rows = [row("old", 1)];
    const view = renderHook(() => useFtpHistory("a"));
    const old = mock.listeners[0]!;
    mock.defer = true;
    let request: Promise<void>;
    act(() => { request = view.result.current.loadOlder(); });
    await act(async () => { await Promise.resolve(); });
    mock.auth.currentUser = { uid: "a" };
    mock.rows = [];
    view.rerender();
    expect(view.result.current.entries).toEqual([]);
    await act(async () => { mock.pending?.({ docs: [{ id: "stale", data: () => row("stale", 1) }] }); await request; });
    act(() => old.next({ docs: [{ id: "stale", data: () => row("stale", now) }] }));
    expect(view.result.current.entries).toEqual([]);
    expect(mock.listeners).toHaveLength(4);
  });
  it("routes the retry button to the failed older page, with no recent listener reread", async () => {
    mock.rows = Array.from({ length: 101 }, (_, index) => row(String(index).padStart(3, "0"), index + 1));
    const view = renderHook(() => useFtpHistory("a"));
    await act(() => view.result.current.loadOlder());
    mock.failPage = true;
    await act(() => view.result.current.loadOlder());
    mock.failPage = false;
    await act(async () => { view.result.current.retry(); });
    expect(view.result.current.entries).toHaveLength(100);
    expect(view.result.current.error).toBe(false);
    expect(mock.listeners).toHaveLength(2);
    expect(mock.reads).toHaveLength(4);
    expect(mock.reads[3]!.target.constraints.find(item => item.kind === "startAfter")?.args).toEqual([52, "051"]);
  });
  it("releases a hung page at the existing read deadline and ignores its late result after retry", async () => {
    vi.useFakeTimers();
    mock.rows = [row("old", 1)]; mock.defer = true;
    const view = renderHook(() => useFtpHistory("a"));
    let request: Promise<void>;
    act(() => { request = view.result.current.loadOlder(); });
    await act(async () => { await Promise.resolve(); });
    const late = mock.pending;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); await request; });
    expect(view.result.current.loadingOlder).toBe(false);
    expect(view.result.current.error).toBe(true);
    mock.defer = false;
    await act(async () => { view.result.current.retry(); });
    expect(view.result.current.error).toBe(false);
    await act(async () => { late?.({ docs: [{ id: "late", data: () => row("late", 2) }] }); });
    expect(view.result.current.entries.map(entry => entry.id)).toEqual(["old"]);
  });
  it("preserves Firestore UTF-8 document-ID tie ordering for legal legacy Unicode IDs", () => {
    mock.rows = [row("\u{10000}", cutoff), row("\uE000", cutoff), row("a", cutoff)];
    const view = renderHook(() => useFtpHistory("a"));
    expect(view.result.current.entries.map(entry => entry.id)).toEqual(["a", "\uE000", "\u{10000}"]);
  });

  it("can explicitly restart malformed older history after its source is repaired without automatic full-history work", async () => {
    mock.rows = [row("old", 1, 0)];
    const view = renderHook(() => useFtpHistory("a"));
    await act(() => view.result.current.loadOlder());
    expect(view.result.current.error).toBe(true);
    mock.rows = [row("old", 1, 260)];
    await act(async () => { view.result.current.retry(); });
    expect(view.result.current.error).toBe(false);
    expect(view.result.current.entries[0]?.value).toBe(260);
    expect(mock.reads).toHaveLength(6); // two automatic queries + manual + retry auto pair + retry first manual page
  });

});
