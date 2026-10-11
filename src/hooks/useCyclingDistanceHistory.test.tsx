import type { CyclingDistanceHistoryRequest, CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCyclingDistanceHistory } from "./useCyclingDistanceHistory";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, services: { auth: { currentUser: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null } }, available: true, load: vi.fn(), observer: null as null | ((user: { uid: string; isAnonymous: boolean } | null) => void) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../services/trainingAnalysisPeriods", () => ({ trainingAnalysisPeriodsAvailable: () => mocks.available }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, listener: typeof mocks.observer) => { mocks.observer = listener; return vi.fn(); } }));
vi.mock("../services/trainingCyclingDistanceHistory", async original => ({ ...await original<typeof import("../services/trainingCyclingDistanceHistory")>(), loadCyclingDistanceHistory: mocks.load }));
// Derived from actual compiled backend fixture 60a7dc6caa1b556ff04e1128797fe1381cf8c53c95e5a8e9c9ddf6cd6128ea94; anonymous synthetic data only.
const wire = {
  "version": 1,
  "mode": "cycling_distance_history_page",
  "discipline": "bike",
  "calendarBasis": "Asia/Seoul",
  "rangeBasis": "calendar_year",
  "year": 2026,
  "targetsVersion": 1,
  "timingBasis": "original_activity_elapsed",
  "quality": "unknown",
  "coverage": "unknown",
  "scope": "page",
  "queryScope": "owner_activities_with_valid_start_time",
  "range": {
    "fromInclusive": 1767193200000,
    "toExclusive": 1791676800000
  },
  "readTime": {
    "seconds": 1791676800,
    "nanoseconds": 0
  },
  "expiresAt": 1791678600000,
  "page": {
    "limit": 50,
    "scannedActivityCount": 0,
    "candidateActivityCount": 0,
    "skippedActivityCount": 0,
    "exhausted": true,
    "observationCounts": {
      "observed": 0,
      "noObserved": 0,
      "unsupported": 0,
      "unavailable": 0
    },
    "nextCursor": null
  },
  "activities": []
} as CyclingDistanceHistoryResponse;
const native = {
  "activityId": "native",
  "startTime": 1767225600000,
  "activityRevision": "100:1",
  "metricsRevision": "100:1",
  "representativeInput": {
    "source": "orider",
    "type": "Ride",
    "discipline": "bike",
    "localSessionId": null,
    "stravaActivityId": null,
    "stravaTwinActivityId": 123,
    "endTime": 1767226600000,
    "movingSec": null,
    "hasLoad": false
  },
  "analysis": {
    "state": "ready",
    "calculatorVersion": 35,
    "inputCoverage": "complete"
  },
  "distanceObservations": {
    "state": "observed",
    "points": [
      {
        "distance": "5miles",
        "elapsedSec": 1000
      },
      {
        "distance": "10km",
        "elapsedSec": 999
      },
      {
        "distance": "10miles",
        "elapsedSec": 998
      },
      {
        "distance": "20km",
        "elapsedSec": 997
      },
      {
        "distance": "30km",
        "elapsedSec": 996
      },
      {
        "distance": "40km",
        "elapsedSec": 995
      },
      {
        "distance": "50km",
        "elapsedSec": 994
      },
      {
        "distance": "80km",
        "elapsedSec": 993
      },
      {
        "distance": "50miles",
        "elapsedSec": 992
      },
      {
        "distance": "90km",
        "elapsedSec": 991
      },
      {
        "distance": "100km",
        "elapsedSec": 990
      },
      {
        "distance": "100miles",
        "elapsedSec": 989
      },
      {
        "distance": "180km",
        "elapsedSec": 988
      }
    ]
  }
} as CyclingDistanceHistoryRow;
const NOW = wire.readTime.seconds * 1000;
const selection: CyclingDistanceHistoryRequest = { mode: "cycling_distance_history_page", discipline: "bike", calendarBasis: "Asia/Seoul", rangeBasis: "calendar_year", year: 2026 };
function row(id = "native", offset = 1000): CyclingDistanceHistoryRow { const r=structuredClone(native); r.activityId=id; r.startTime=wire.range.fromInclusive+offset; if(r.representativeInput.endTime!==null)r.representativeInput.endTime=r.startTime+1000000; r.representativeInput.localSessionId=null; r.representativeInput.stravaActivityId=null; r.representativeInput.stravaTwinActivityId=null; return r; }
function page(rows: CyclingDistanceHistoryRow[] = [row()], exhausted = true, offset = 0): CyclingDistanceHistoryResponse {
 const r=structuredClone(wire); r.activities=rows;
 const observed={observed:0,noObserved:0,unsupported:0,unavailable:0};
 for(const item of rows)observed[item.distanceObservations.state === "observed"?"observed":item.distanceObservations.state === "no_observed_efforts"?"noObserved":item.distanceObservations.state === "legacy_unsupported"?"unsupported":"unavailable"]++;
 r.page={limit:50,scannedActivityCount:exhausted?rows.length:50,candidateActivityCount:rows.length,skippedActivityCount:exhausted?0:50-rows.length,exhausted,observationCounts:observed,nextCursor:exhausted?null:{scope:"cycling_distance_history_v1_targets1",readTime:r.readTime,range:r.range,after:{startTime:wire.range.fromInclusive+offset+49000,activityId:"zz"},requestBinding:"a".repeat(64)}};
 return r;
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); mocks.user = { uid: "owner", isAnonymous: false }; mocks.services = { auth: { currentUser: mocks.user } }; mocks.available = true; mocks.load.mockReset().mockResolvedValue(page()); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("manual private cycling history", () => {
 it("reads only one page per click and keeps equivalent selection objects", async () => {
  const first = page([], false); mocks.load.mockResolvedValueOnce(first).mockResolvedValueOnce(page([row("next", 50000)]));
  const view = renderHook(({ selected }) => useCyclingDistanceHistory("owner", "A", selected, "head"), { initialProps: { selected: selection } });
  expect(mocks.load).not.toHaveBeenCalled(); await act(async () => { await view.result.current.start(); });
  view.rerender({ selected: { ...selection } }); expect(view.result.current.status).toBe("partial"); expect(mocks.load).toHaveBeenCalledTimes(1);
  await act(async () => { await view.result.current.loadMore(); }); expect(mocks.load.mock.calls[1]![2].cursor).toEqual(first.page.nextCursor);
  expect(view.result.current.status).toBe("complete"); await act(async () => { await view.result.current.loadMore(); }); expect(mocks.load).toHaveBeenCalledTimes(2);
  view.rerender({ selected: { ...selection, year: 2025 } }); expect(view.result.current.pages).toHaveLength(0); expect(mocks.load).toHaveBeenCalledTimes(2);
  view.rerender({ selected: { mode: selection.mode, discipline: "bike", calendarBasis: "Asia/Seoul", rangeBasis: "explicit_range", range: { fromInclusive: NOW-86400000, toExclusive: NOW } } }); expect(mocks.load).toHaveBeenCalledTimes(2);
 });
 it("caps scanned owner documents at 5000 even for 100 empty nonbike pages", async () => {
  let index = 0; mocks.load.mockImplementation(async () => page([], false, index++ * 50000));
  const { result } = renderHook(() => useCyclingDistanceHistory("owner", "A", selection, "head"));
  await act(async () => { await result.current.start(); }); for(let i=1;i<100;i++) await act(async () => { await result.current.loadMore(); });
  expect(result.current.status).toBe("capped"); expect(result.current.pages.reduce((sum,p)=>sum+p.page.scannedActivityCount,0)).toBe(5000);
  expect(result.current.pages.flatMap(p=>p.activities)).toHaveLength(0); await act(async () => { await result.current.loadMore(); }); expect(mocks.load).toHaveBeenCalledTimes(100);
 });
 it.each(["head", "activity", "selection", "services"])("rejects late ABA results for %s", async axis => {
  let done!: (r: CyclingDistanceHistoryResponse)=>void; mocks.load.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
  const original = mocks.services;
  const view=renderHook(({id,head,selected})=>useCyclingDistanceHistory("owner",id,selected,head),{initialProps:{id:"A",head:"head",selected:selection}});
  let pending!:Promise<void>; act(()=>{pending=view.result.current.start();});
  if(axis==="services")mocks.services={auth:{currentUser:mocks.user}};
  view.rerender({id:axis==="activity"?"B":"A",head:axis==="head"?"other":"head",selected:axis==="selection"?{...selection,year:2025}:selection});
  mocks.services=original; view.rerender({id:"A",head:"head",selected:selection});
  await act(async()=>{done(page());await pending;}); expect(view.result.current.pages).toHaveLength(0); expect(view.result.current.status).toBe("idle");
 });
 it("fences actual SDK auth ABA even when React owner context never changes", async()=>{
  let done!:(r:CyclingDistanceHistoryResponse)=>void;mocks.load.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
  const view=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head")); let pending!:Promise<void>;act(()=>{pending=view.result.current.start();});
  act(()=>{mocks.services.auth.currentUser={uid:"other",isAnonymous:false};mocks.observer!(mocks.services.auth.currentUser);mocks.services.auth.currentUser=mocks.user;mocks.observer!(mocks.user);});
  await act(async()=>{done(page());await pending;});expect(view.result.current.pages).toHaveLength(0);expect(view.result.current.status).toBe("idle");
 });
 it("expires private rows locally after 30 minutes without reads and restarts only manually",async()=>{
  vi.useFakeTimers();vi.setSystemTime(NOW);vi.spyOn(Date,"now").mockImplementation(()=>new Date().getTime());
  const {result}=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));await act(async()=>{await result.current.start();});
  act(()=>{vi.advanceTimersByTime(1800000);});expect(result.current.status).toBe("expired");expect(result.current.pages).toHaveLength(0);expect(mocks.load).toHaveBeenCalledTimes(1);
  await act(async()=>{await result.current.loadMore();});expect(mocks.load).toHaveBeenCalledTimes(1);
 });
 it("isolates transient failures and manually retries the same snapshot cursor",async()=>{
  mocks.load.mockResolvedValueOnce(page([row()],false)).mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(page([row("next",50000)]));
  const {result}=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));await act(async()=>{await result.current.start();await result.current.loadMore();});
  expect(result.current.status).toBe("error");expect(result.current.pages).toHaveLength(1);expect(mocks.load).toHaveBeenCalledTimes(2);
  await act(async()=>{await result.current.loadMore();});expect(mocks.load.mock.calls[1]![2]).toEqual(mocks.load.mock.calls[2]![2]);expect(result.current.status).toBe("complete");
 });
 it("rejects malformed rows instead of claiming no record",async()=>{
  const bad=page();bad.activities[0]!.metricsRevision="f".repeat(64);mocks.load.mockResolvedValueOnce(bad);
  const {result}=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));await act(async()=>{await result.current.start();});expect(result.current.status).toBe("unsupported");expect(result.current.pages).toHaveLength(0);
 });
 it("blocks anonymous SDK users despite owner context",async()=>{
  mocks.services.auth.currentUser={uid:"owner",isAnonymous:true};const {result}=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));await act(async()=>{await result.current.start();});expect(result.current.available).toBe(false);expect(mocks.load).not.toHaveBeenCalled();
 });
 it("serializes clicks and ignores completion after unmount",async()=>{
  let done!:(r:CyclingDistanceHistoryResponse)=>void;mocks.load.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
  const view=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));let pending!:Promise<void>;act(()=>{pending=view.result.current.start();void view.result.current.start();});expect(mocks.load).toHaveBeenCalledTimes(1);
  view.unmount();await act(async()=>{done(page());await pending;});expect(mocks.load).toHaveBeenCalledTimes(1);
 });
});

it("clears accumulated rows if a later page repeats an activity ID",async()=>{
 mocks.load.mockResolvedValueOnce(page([row("same")],false)).mockResolvedValueOnce(page([row("same",50000)]));const {result}=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));await act(async()=>{await result.current.start();await result.current.loadMore();});expect(result.current.status).toBe("invalidated");expect(result.current.pages).toHaveLength(0);expect(mocks.load).toHaveBeenCalledTimes(2);
});
it("clears private pages on server owner/head invalidation and requires an explicit new snapshot",async()=>{
 mocks.load.mockResolvedValueOnce(page([row()],false)).mockRejectedValueOnce({code:"functions/failed-precondition",details:{reason:"history_source_changed"}});const {result}=renderHook(()=>useCyclingDistanceHistory("owner","A",selection,"head"));await act(async()=>{await result.current.start();await result.current.loadMore();});expect(result.current.status).toBe("invalidated");expect(result.current.pages).toHaveLength(0);await act(async()=>{await result.current.loadMore();});expect(mocks.load).toHaveBeenCalledTimes(2);
});
