import { act, renderHook, waitFor } from "@testing-library/react";
import { useAthletePublicPeriod, publicPeriodBounds } from "./useAthletePublicPeriod";
const mocks = vi.hoisted(() => ({ load: vi.fn(), listener: null as null | ((user: unknown) => void), services: { auth: { currentUser: {uid:"viewer"}, app: {} } } }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/activityDiscovery", () => ({ loadActivityDiscovery: mocks.load }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, listener: (user: unknown) => void) => { mocks.listener = listener; return vi.fn(); } }));
const page = (ids: string[], cursor: string | null = null) => ({items:ids.map(id=>({id})),nextCursor:cursor,exhausted:cursor===null,expiresAt:Date.now()+600000});
beforeEach(() => { mocks.load.mockReset(); Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"}); });
it("validates KST dates and a bounded one-year selection", () => {
 expect(publicPeriodBounds("2026-01-01","2026-01-01")).toEqual({start:Date.parse("2025-12-31T15:00Z"),end:Date.parse("2026-01-01T15:00Z")});
 expect(publicPeriodBounds("2026-02-30","2026-03-01")).toBeNull();
 expect(publicPeriodBounds("2020-01-01","2026-01-01")).toBeNull();
});
it("preserves an empty intermediate page and reads only on explicit continuation, deduplicating current seek rows", async () => {
 mocks.load.mockResolvedValueOnce(page([],"ad1.next")).mockResolvedValueOnce(page(["a"],"ad1.second")).mockResolvedValueOnce(page(["a","b"]));
 const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
 await waitFor(()=>expect(result.current.status).toBe("partial")); expect(mocks.load).toHaveBeenCalledTimes(1);
 await act(()=>result.current.more()); expect(result.current.items).toHaveLength(1);
 await act(()=>result.current.more()); expect(result.current.status).toBe("complete"); expect(result.current.items.map(x=>x.id)).toEqual(["a","b"]);
 expect(mocks.load.mock.calls[1][1]).toMatchObject({cursor:"ad1.next",fromInclusive:Date.parse("2025-12-31T15:00Z")});
});
it("retains rows on 429 retry, but discards expired or denied continuation", async () => {
 mocks.load.mockResolvedValueOnce(page(["a"],"ad1.next")).mockRejectedValueOnce({code:"functions/resource-exhausted"}).mockRejectedValueOnce({code:"functions/failed-precondition"});
 const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
 await waitFor(()=>expect(result.current.status).toBe("partial"));
 await act(()=>result.current.more()); expect(result.current.status).toBe("error"); expect(result.current.items).toHaveLength(1);
 await act(()=>result.current.more()); expect(result.current.status).toBe("restart"); expect(result.current.items).toHaveLength(0);
});
it("rejects an elapsed cursor before dispatch", async () => {
 mocks.load.mockResolvedValueOnce({...page(["a"],"ad1.next"),expiresAt:Date.now()-1});
 const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
 await waitFor(()=>expect(result.current.status).toBe("partial")); await act(()=>result.current.more());
 expect(result.current.status).toBe("restart"); expect(mocks.load).toHaveBeenCalledTimes(1);
});
it("discards late old-scope and same-UID SDK-session responses", async () => {
 let resolve!: (value: unknown)=>void;
 mocks.load.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue(page(["new"]));
 const {result,rerender}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
 act(()=>{mocks.services.auth.currentUser={uid:"viewer"}; mocks.listener?.(mocks.services.auth.currentUser);}); rerender();
 await waitFor(()=>expect(result.current.status).toBe("complete"));
 await act(async()=>resolve(page(["old"]))); expect(result.current.items.map(x=>x.id)).toEqual(["new"]);
});
it("hides old rows while backgrounded and refreshes on return", async () => {
 mocks.load.mockResolvedValueOnce(page(["a"])).mockResolvedValueOnce(page([]));
 const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
 await waitFor(()=>expect(result.current.status).toBe("complete"));
 act(()=>{Object.defineProperty(document,"visibilityState",{value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));}); expect(result.current.items).toEqual([]);
 act(()=>{Object.defineProperty(document,"visibilityState",{value:"visible"});document.dispatchEvent(new Event("visibilitychange"));});
 await waitFor(()=>expect(result.current.status).toBe("complete")); expect(result.current.items).toEqual([]);
});
it("does not extend the oldest authorization deadline through continuation or 429", async () => {
 vi.useFakeTimers();
 try {
  mocks.load.mockResolvedValueOnce(page(["a"],"ad1.next")).mockRejectedValueOnce({code:"functions/resource-exhausted"});
  const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
  await act(async()=>{}); expect(result.current.status).toBe("partial");
  await act(async()=>vi.advanceTimersByTime(29000)); await act(()=>result.current.more());
  expect(result.current.status).toBe("error"); expect(result.current.items).toHaveLength(1);
  await act(async()=>vi.advanceTimersByTime(1000)); expect(result.current.status).toBe("stale"); expect(result.current.items).toEqual([]);
 } finally {vi.useRealTimers();}
});
it("can complete 201 records through eleven explicit bounded requests without an automatic loop", async () => {
 for(let pageIndex=0;pageIndex<11;pageIndex++) mocks.load.mockResolvedValueOnce(page(Array.from({length:pageIndex===10?1:20},(_,i)=>String(pageIndex*20+i)),pageIndex===10?null:`ad1.${pageIndex+1}`));
 const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-12-31"));
 await waitFor(()=>expect(result.current.status).toBe("partial")); expect(mocks.load).toHaveBeenCalledTimes(1);
 for(let index=0;index<10;index++) await act(()=>result.current.more());
 expect(result.current.status).toBe("complete"); expect(result.current.items).toHaveLength(201); expect(mocks.load).toHaveBeenCalledTimes(11);
 expect(mocks.load.mock.calls.every(call=>call[1].limit===20)).toBe(true);
});
it("invalidates a delayed continuation when the first page authorization expires", async () => {
 vi.useFakeTimers();
 try {
  let resolve!: (value:unknown)=>void;
  mocks.load.mockResolvedValueOnce(page(["a"],"ad1.next")).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31")); await act(async()=>{});
  await act(async()=>vi.advanceTimersByTime(29000)); act(()=>{void result.current.more();});
  await act(async()=>vi.advanceTimersByTime(1000)); expect(result.current.status).toBe("stale");
  await act(async()=>resolve(page(["late"]))); expect(result.current.items).toEqual([]);
 } finally {vi.useRealTimers();}
});
it("bounds the first request including AppCheck and never accepts its late result", async () => {
 vi.useFakeTimers();
 try {
  let resolve!: (value:unknown)=>void; mocks.load.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const {result}=renderHook(()=>useAthletePublicPeriod("target","2026-01-01","2026-01-31"));
  await act(async()=>vi.advanceTimersByTime(15000)); expect(result.current.status).toBe("error");
  await act(async()=>resolve(page(["late"]))); expect(result.current.items).toEqual([]);
 } finally {vi.useRealTimers();}
});
it("retains the 200-record global budget and requires explicit steps for 21 records", async () => {
 mocks.load.mockResolvedValueOnce(page(Array.from({length:20},(_,i)=>String(i)),"ad1.next")).mockResolvedValueOnce(page(["last"]));
 const {result}=renderHook(()=>useAthletePublicPeriod("target","","",true,true));
 await waitFor(()=>expect(result.current.status).toBe("partial")); expect(mocks.load).toHaveBeenCalledTimes(1);
 await act(()=>result.current.more()); expect(result.current.status).toBe("complete");expect(result.current.items).toHaveLength(21);
 expect(mocks.load.mock.calls[0][1]).toMatchObject({order:"id_asc"}); expect(mocks.load.mock.calls[0][1]).not.toHaveProperty("fromInclusive");
});
