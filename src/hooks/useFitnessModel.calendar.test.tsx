import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TriFitnessView from "../pages/fitness/TriFitnessView";
import { MemoryRouter } from "react-router-dom";
import type { Activity } from "@shared/types";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import { getDoc } from "firebase/firestore";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { clearTrainingSurfaceCache } from "../embedded/trainingSurfaceCache";
import { useFitnessModel } from "../hooks/useFitnessModel";
import { FitnessView } from "../pages/FitnessPage";
const mocks = vi.hoisted(() => ({user:{uid:"rider-a",isAnonymous:false},firestore:{},services:{firestore:{}},timeseries:null as FitnessTimeseriesDoc|null, canonicalOn: false, envelope: null as unknown, pendingFetch: null as Promise<unknown> | null}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, profile: null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks.services }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../hooks/useTrainingDecision", () => ({useTrainingDecision:()=>({enabled:false,envelope:null})}));
vi.mock("../hooks/useFtpHistory", () => ({ useFtpHistory: () => ({ entries: [] }) }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => false }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("../features/fitness/useFitnessCurves", () => ({ useFitnessCurves: () => ({
  run: { recent28: [], prev28: [] }, swim: { recent28: [], prev28: [] },
  activityWindow: null, activityWindowLoaded: true, activityWindowError: false,
}) }));
vi.mock("../hooks/useBikeFtpDecision", () => ({ useBikeFtpDecision: () => ({ decision: null }) }));
vi.mock("../hooks/useCoachRiderInsight", () => ({ useCoachRiderInsight: () => ({ insight: null }) }));
vi.mock("../hooks/useUserFitness", () => ({ useUserFitness: () => ({ fitness: null }) }));
vi.mock("../hooks/useConsistencyStreak", () => ({ useConsistencyStreak: () => ({ summary: null }) }));
vi.mock("../hooks/useRunRecords", () => ({ useRunRecords: () => ({ run: null }) }));
vi.mock("../hooks/useMilestones", () => ({ useMilestones: () => ({ achieved: new Map(), markCelebrated: vi.fn() }) }));
vi.mock("../hooks/useFreshTraining", () => ({ useFreshTraining: () => ({ revalidating: false, justRecomputed: false }) }));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({
  timeseries: mocks.timeseries, loaded: true, error: null, cacheHit: true, freshLoaded: true,
}) }));


const options = { enableCoachRiderInsight: false };
const fixedNow = Date.parse("2026-09-28T12:00:00Z");
const point = {date:"2026-09-28",ctl:40,atl:45,tsb:-5,dailyLoad:100};
function activity(summary: Activity["summary"] | null, id="published"): Activity {
  return {id,userId:"rider-a",type:"Ride",startTime:Date.now(),summary,
    serverDerivedLoad:{schemaVersion:1,userId:"rider-a",inputBinding:"published",streamTss:100}} as unknown as Activity;
}
function seed(activities: Activity[]) {
  setCollectionDocs("activities", activities as unknown as Array<Record<string,unknown>&{id:string}>);
  for (const a of activities) setDocData(`activity_metrics/${a.id}`,{tss:100});
}
beforeEach(()=>{clearTrainingSurfaceCache();mocks.timeseries=null;mocks.canonicalOn=false;mocks.pendingFetch=null;vi.mocked(getDoc).mockClear();vi.spyOn(Date,"now").mockReturnValue(fixedNow);});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});


// Real canonical hook/parser; replace its network transport and rollout verdict only.
vi.mock("../services/canonicalApi", async importOriginal => ({
  ...await importOriginal<typeof import("../services/canonicalApi")>(),
  canonicalConsumersEnabled: () => mocks.canonicalOn,
  fetchCanonicalFitnessSummary: async () => mocks.pendingFetch ?? mocks.envelope,
}));
vi.mock("./useCanonicalRollout", () => ({
  useCanonicalRollout: () => ({ gateEnabled: true, loading: false, verdictOk: true, surfaces: { fitnessSummary: true } }),
  canonicalRolloutAllows: () => mocks.canonicalOn,
}));
import MobileFitnessPage from "../components/mobile/MobileFitnessPage";

function timeseries(points: typeof point[]): FitnessTimeseriesDoc {
  return {discipline:"bike",schemaVersion:1,computedAt:Date.now(),startDate:points[0]!.date,
    endDate:points.at(-1)!.date,pointCount:points.length,points};
}
function enableCanonical(doc: FitnessTimeseriesDoc | null) {
  mocks.canonicalOn = true;
  const empty = {ctl:0,atl:0,tsb:0,weeklyTSS:0};
  mocks.envelope = {schemaVersion:1,algorithmVersion:"v1",status:"canonical",computedAt:Date.now(),
    inputRevision:null,inputDigest:null,period:null,error:null,data:{
      current:{totalCTL:40,totalATL:45,totalTSB:-5,totalsBasis:["bike","run","swim"],
        breakdown:{bike:{ctl:40,atl:45,tsb:-5,weeklyTSS:100},run:empty,swim:empty}},
      timeseries:{bike:doc,run:null,swim:null},projection:null,summaries:{},projections:{},pdc:{},
    }};
}
async function settle() { await act(async () => { for(let i=0;i<12;i++) await Promise.resolve(); }); }

// Full model and real derived-document hook → real translated desktop/mobile/tri consumers.
// Auth/Firebase contexts, Firestore transport and unrelated auxiliary hooks above are mocked.
describe("calendar load reaches actual fitness screens",()=>{
 it.each([false,true])("calendar buckets retain saved CTL and exclude old/future loads (canonical API=%s)",async canonical=>{
  const doc=timeseries([{...point,date:"2026-09-14"},point,{...point,date:"2026-09-29",dailyLoad:900}]);
  if(canonical) enableCanonical(doc); else mocks.timeseries=doc;
  seed([]);const h=renderHook(()=>useFitnessModel("bike",options));
  await waitFor(()=>expect(h.result.current.currentPoint?.ctl).toBe(40));
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(100);
  expect(h.result.current.weeklyStats.avgWeekTSS).toBe(67);
  expect(h.result.current.mobilePageProps.data.weeklyTSS).toEqual([0,100,0,100]);
  const desktop=render(<MemoryRouter><FitnessView model={h.result.current}/></MemoryRouter>);
  expect(screen.getByText("이번 주 TSS").parentElement).toHaveTextContent("100");desktop.unmount();
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(/이번 주 100/)).toBeInTheDocument();
  const label=screen.getByText("이번 주");expect(label.parentElement).toHaveTextContent("100");
  expect(screen.getByText("2주 전").parentElement).toHaveTextContent("100");
 });
 it("old-only sparse point is not current week and current day maps to latest mobile bar",async()=>{
  mocks.timeseries=timeseries([{...point,date:"2026-09-14"}]);seed([]);
  const h=renderHook(()=>useFitnessModel("bike",options));await settle();
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(0);
  expect(h.result.current.weeklyStats.restDays).toBe(0);
  expect(h.result.current.currentPoint?.ctl).toBe(40);
  render(<MemoryRouter><FitnessView model={h.result.current}/></MemoryRouter>);
  expect(screen.getByText("이번 주 TSS").parentElement).toHaveTextContent("0");
 });
 it("old unknown-only legacy filler cannot prove current rest",async()=>{
  seed([{...activity(null,"unknown-old"),startTime:Date.now()-14*86_400_000,serverDerivedLoad:undefined}]);
  const h=renderHook(()=>useFitnessModel("bike",options));await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
  expect(h.result.current.weeklyStats).toMatchObject({thisWeekTSS:0,hasKnownThisWeekLoad:false,restDays:0,unknownCount:1});
  expect(h.result.current.currentPoint).toBeNull();
 });
 it("proven zero is known; missing yesterday cannot extend a rest streak",async()=>{
  mocks.timeseries=timeseries([{...point,date:"2026-09-26",dailyLoad:0},{...point,dailyLoad:0}]);seed([]);
  const h=renderHook(()=>useFitnessModel("bike",options));await settle();
  expect(h.result.current.weeklyStats).toMatchObject({thisWeekTSS:0,hasKnownThisWeekLoad:true,restDays:1});
 });
 it("canonical API tri daily chart remains available without synthesized integrated timeline",async()=>{
  enableCanonical(timeseries([point]));seed([]);
  const h=renderHook(()=>useFitnessModel("tri",options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
  expect(h.result.current.triFitnessTimeline).toEqual([]);
  const r=render(<MemoryRouter><TriFitnessView range={90} onRangeChange={vi.fn()} breakdown={h.result.current.triFitnessBreakdown} timeline={[]} combinedLoad={h.result.current.combinedLoad} loadFocus={null}/></MemoryRouter>);
  const chart=r.container.querySelector("[data-daily-point-count]")!;
  fireEvent.pointerEnter(chart.firstElementChild!.firstElementChild!);
  expect(chart).toHaveTextContent("100 TSS");expect(h.result.current.currentPoint?.ctl).toBe(40);
 });
 it.each([false,true])("real tri daily chart preserves known100 when another activity is unknown (%s)",async unknown=>{
  const known={...activity(null),type:"Run"};seed(unknown?[known,{...activity(null,"unknown"),type:"Run",serverDerivedLoad:undefined}]:[known]);
  const h=renderHook(()=>useFitnessModel("tri",options));await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
  expect(h.result.current.triFitnessBreakdown.run.weeklyTSS).toBe(100);
  expect(h.result.current.triFitnessTimeline.length>0).toBe(!unknown);
  const r=render(<MemoryRouter><TriFitnessView range={90} onRangeChange={vi.fn()} breakdown={h.result.current.triFitnessBreakdown} timeline={h.result.current.triFitnessTimeline} combinedLoad={h.result.current.combinedLoad} loadFocus={null}/></MemoryRouter>);
  const chart=r.container.querySelector("[data-daily-point-count]");expect(chart).not.toBeNull();
  const bar=chart!.firstElementChild!.firstElementChild!;fireEvent.pointerEnter(bar);
  expect(chart).toHaveTextContent("100 TSS");
  if(unknown)expect(chart).toHaveTextContent("부하 미확인 1건 · 확인된 값만 합산");
 });
 it("unknown-only daily chart displays dash without resting zeros or synthetic PMC",async()=>{
  seed([{...activity(null,"unknown"),type:"Run",serverDerivedLoad:undefined}]);
  const h=renderHook(()=>useFitnessModel("tri",options));await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
  expect(h.result.current.triFitnessTimeline).toEqual([]);
  const r=render(<MemoryRouter><TriFitnessView range={90} onRangeChange={vi.fn()} breakdown={h.result.current.triFitnessBreakdown} timeline={[]} combinedLoad={null} loadFocus={null}/></MemoryRouter>);
  const chart=r.container.querySelector("[data-daily-point-count]")!;
  expect(screen.getByLabelText("부하 미확인 1건 · 확인된 값만 합산")).toBeInTheDocument();
  fireEvent.pointerEnter(chart.firstElementChild!.firstElementChild!);
  expect(chart).toHaveTextContent("— TSS");expect(chart).toHaveTextContent("부하 미확인 1건");
 });
 it.each(["processed","pending","failed"] as const)("modern %s keeps saved CTL and classified history status",async status=>{
  const now=Date.now(), date=point.date;
  mocks.timeseries={...timeseries([point]),
    loadSnapshot:{inputRevision:1,inputDigest:"a".repeat(64),asOf:now,inputReadTime:{seconds:Math.floor(now/1000),nanoseconds:(now%1000)*1e6},coverageStartDate:date,coverageEndDate:date,points:[{date,dailyLoad:100,status:"final",quality:"precomputed"}]},
    pmc:{status,attemptId:"one",inputRevision:1,processedInputRevision:status==="processed"?1:null,deadlineAt:now+60000,asOf:status==="processed"?now:null}} as FitnessTimeseriesDoc;
  seed([]);const h=renderHook(()=>useFitnessModel("bike",options));await settle();
  expect(h.result.current.currentPoint?.ctl).toBe(40);
  expect(h.result.current.pmcHistoryPoints.at(-1)?.calculationStatus).toBe(status==="processed"?"server":status);
 });
 it("modern malformed null fields cannot enable the genuine legacy fallback",async()=>{
  mocks.timeseries={...timeseries([point]),loadSnapshot:null,pmc:null} as unknown as FitnessTimeseriesDoc;
  seed([activity(null)]);const h=renderHook(()=>useFitnessModel("bike",options));await settle();
  expect(h.result.current.dailyData).toEqual([]);expect(h.result.current.currentPoint).toBeNull();
 });
 it.each([[2026,2,8],[2026,10,1]])("local legacy window rolls at local midnight on DST calendar %s-%s-%s",async(year,month,day)=>{
  vi.restoreAllMocks();vi.useFakeTimers();const now=new Date(year,month,day,23,50);vi.setSystemTime(now);
  const old=new Date(year,month,day-6,12);
  seed([{...activity(null),startTime:old.getTime()}]);
  const h=renderHook(()=>useFitnessModel("bike",options));await settle();
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(100);
  const savedCtl=h.result.current.currentPoint?.ctl;
  await act(async()=>{await vi.advanceTimersByTimeAsync(11*60000);});
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(0);
  expect(h.result.current.currentPoint?.ctl).toBe(savedCtl);
  expect(h.result.current.weeklyStats.restDays).toBe(0);
 });
 it.each([false,true])("UTC rollover recomputes actual model weekly evidence without losing CTL (canonical API=%s)",async canonical=>{
  vi.restoreAllMocks();vi.useFakeTimers();vi.setSystemTime(Date.parse("2026-09-28T23:50:00Z"));
  const doc=timeseries([{...point,date:"2026-09-22"}]);
  if(canonical)enableCanonical(doc);else mocks.timeseries=doc;seed([]);
  const h=renderHook(()=>useFitnessModel("bike",options));await settle();
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(100);
  await act(async()=>{await vi.advanceTimersByTimeAsync(11*60000);});
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(0);
  expect(h.result.current.mobilePageProps.data.weeklyTSS).toEqual([0,0,100,0]);
  expect(h.result.current.currentPoint?.ctl).toBe(40);
 });
});

function weeklySummary(sport: "bike" | "run" | "swim", computedAt: unknown, totalTss = 100) {
  const envelope = mocks.envelope as {data:{summaries:Record<string,unknown>}};
  envelope.data.summaries[sport] = { discipline: sport, computedAt, week: { totalTss } };
}
function currentWireCtl(ctl: number, weeklyTSS: number) {
  const envelope = mocks.envelope as {data:{current:{totalCTL:number;totalATL:number;totalTSB:number;breakdown:{bike:{ctl:number;atl:number;tsb:number;weeklyTSS:number}}}}};
  envelope.data.current.totalCTL = ctl;envelope.data.current.totalATL = ctl;envelope.data.current.totalTSB = 0;
  envelope.data.current.breakdown.bike = {ctl,atl:ctl,tsb:0,weeklyTSS};
}

describe("actual canonical wire weekly proof without historical data",()=>{
 it("publication arrives after model mount with a same-day source clock100ms later",async()=>{
  enableCanonical(null);weeklySummary("bike",fixedNow+100);seed([]);
  let resolve: (value: unknown) => void = () => undefined;
  mocks.pendingFetch=new Promise(done=>{resolve=done;});
  const h=renderHook(()=>useFitnessModel("bike",options));
  expect(h.result.current.canonicalFitness.values).toBeNull();
  await act(async()=>{resolve(mocks.envelope);await Promise.resolve();});
  await waitFor(()=>expect(h.result.current.weeklyStats.thisWeekTSS).toBe(100));
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(/이번 주 100/)).toBeInTheDocument();
 });
 it.each(["processing","failed"])("no accepted values in %s cannot manufacture weekly zero or history",async status=>{
  enableCanonical(null);mocks.envelope={...(mocks.envelope as object),status,data:null,
    error:status==="failed"?{code:"test",message:"failed",retryable:true}:null};seed([]);
  const h=renderHook(()=>useFitnessModel("bike",options));await waitFor(()=>expect(h.result.current.canonicalFitness.status).toBe(status));
  expect(h.result.current.canonicalFitness.values).toBeNull();expect(h.result.current.currentPoint).toBeNull();
  expect(h.result.current.weeklyStats.thisWeekTSS).toBeNull();expect(h.result.current.mobilePageProps.data.weeklyTSS).toEqual([]);
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.queryByText(/이번 주 0/)).not.toBeInTheDocument();
 });
 it.each(["bike","tri"] as const)("%s preserves same-day weekly100/normalCTL0 and parsed savedCTL40 without historical zeros",async sport=>{
  for(const ctl of [0,40]) {
    enableCanonical(null);currentWireCtl(ctl,100);weeklySummary("bike",Date.now()+100);seed([]);
    const h=renderHook(()=>useFitnessModel(sport,options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
    expect(h.result.current.weeklyStats).toMatchObject({thisWeekTSS:100,avgWeekTSS:null,restDays:null,unknownCount:0});
    expect(h.result.current.mobilePageProps.data.weeklyTSS).toEqual([100]);
    expect(h.result.current.dailyData).toEqual([]);expect(h.result.current.currentPoint?.ctl).toBe(ctl);
    const desktop=render(<MemoryRouter><FitnessView model={h.result.current}/></MemoryRouter>);
    if(sport==="bike")expect(screen.getByText("이번 주 TSS").parentElement).toHaveTextContent("100");
    else expect(screen.getByText("총합").parentElement).toHaveTextContent("100 총합");
    desktop.unmount();
    const mobile=render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
    expect(screen.getByText(/이번 주 100.*평균 –.*휴식 –/)).toBeInTheDocument();
    expect(screen.queryByText("3주 전")).not.toBeInTheDocument();expect(screen.getByText("부분 집계")).toBeInTheDocument();
    mobile.unmount();h.unmount();
  }
 });
 it.each(["bike","tri"] as const)("%s preserves real weekly zero while absence stays distinct",async sport=>{
  enableCanonical(null);currentWireCtl(0,0);weeklySummary("bike",Date.now(),0);seed([]);
  const h=renderHook(()=>useFitnessModel(sport,options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(0);
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(/이번 주 0.*평균 –.*휴식 –/)).toBeInTheDocument();
 });
 it.each([undefined,null,"2026-09-28",1.5,Number.MAX_SAFE_INTEGER,fixedNow-86_400_000,fixedNow+86_400_000])("source clock %s cannot borrow a fresh envelope/global clock",async clock=>{
  enableCanonical(null);weeklySummary("bike",clock);seed([]);
  const h=renderHook(()=>useFitnessModel("bike",options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
  expect(h.result.current.currentPoint?.ctl).toBe(40);
  expect(h.result.current.weeklyStats).toMatchObject({thisWeekTSS:null,avgWeekTSS:null,restDays:null,unknownCount:0});
  expect(h.result.current.mobilePageProps.data.weeklyTSS).toEqual([]);
  const d=render(<MemoryRouter><FitnessView model={h.result.current}/></MemoryRouter>);
  expect(screen.getByText("이번 주 TSS").parentElement).toHaveTextContent("–");d.unmount();
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(/이번 주 –.*평균 –.*휴식 –/)).toBeInTheDocument();
 });
 it.each([true,false])("mixed sport preserves history50 plus same-day summary proof=%s without borrowing sport clocks",async fresh=>{
  enableCanonical(null);weeklySummary("bike",Date.now()-(fresh?0:86_400_000));
  const e=mocks.envelope as {data:{timeseries:{run:FitnessTimeseriesDoc|null};current:{totalCTL:number;breakdown:{run:{ctl:number;atl:number;tsb:number;weeklyTSS:number}}}}};
  e.data.timeseries.run={...timeseries([{...point,dailyLoad:50}]),discipline:"run"};
  e.data.current.breakdown.run={ctl:40,atl:45,tsb:-5,weeklyTSS:50};e.data.current.totalCTL=80;seed([]);
  const h=renderHook(()=>useFitnessModel("tri",options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
  expect(h.result.current.weeklyStats.thisWeekTSS).toBe(fresh?150:50);
  expect(h.result.current.weeklyStats.avgWeekTSS).toBeNull();
  expect(h.result.current.dailyData).toEqual([]);expect(h.result.current.triFitnessBreakdown.run.dailyData?.at(-1)?.totalLoad).toBe(50);
  const d=render(<MemoryRouter><FitnessView model={h.result.current}/></MemoryRouter>);
  expect(screen.getByText("총합").parentElement).toHaveTextContent(`${fresh?150:50} 총합`);expect(screen.getByText("부분 집계")).toBeInTheDocument();d.unmount();
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(new RegExp(`이번 주 ${fresh?150:50}.*평균 –`))).toBeInTheDocument();
 });
 it.each(["bike","tri"] as const)("%s source period crosses UTC midnight without rewriting saved CTL or creating new-week100",async sport=>{
  vi.restoreAllMocks();vi.useFakeTimers();vi.setSystemTime(Date.parse("2026-09-28T23:50:00Z"));
  enableCanonical(null);weeklySummary("bike",Date.now());seed([]);
  let model:ReturnType<typeof useFitnessModel>|undefined;
  function Page(){model=useFitnessModel(sport,options);return <MobileFitnessPage {...model.mobilePageProps} embedded/>;}
  render(<MemoryRouter><Page/></MemoryRouter>);await settle();
  expect(screen.getByText(/이번 주 100/)).toBeInTheDocument();
  await act(async()=>{await vi.advanceTimersByTimeAsync(11*60000);});
  expect(model!.weeklyStats.thisWeekTSS).toBeNull();expect(model!.currentPoint?.ctl).toBe(40);
  expect(screen.getByText(/이번 주 –/)).toBeInTheDocument();expect(model!.dailyData).toEqual([]);
 });
 it.each(["processing","failed"])("same-owner %s refresh preserves prior source clock rather than retagging last-good weekly100",async status=>{
  enableCanonical(null);weeklySummary("bike",fixedNow-86_400_000);seed([]);
  const h=renderHook(()=>useFitnessModel("bike",options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
  mocks.envelope={...(mocks.envelope as object),status,computedAt:fixedNow,data:null,error:status==="failed"?{code:"test",message:"failed",retryable:true}:null};
  act(()=>h.result.current.canonicalFitness.retry());await waitFor(()=>expect(h.result.current.canonicalFitness.status).toBe(status));
  expect(h.result.current.canonicalFitness.showingLastGood).toBe(true);expect(h.result.current.currentPoint?.ctl).toBe(40);
  expect(h.result.current.weeklyStats.thisWeekTSS).toBeNull();
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(/이번 주 –/)).toBeInTheDocument();
 });
});

// Captured from actual BE writeCurrentFitness → Express scope middleware/fitness route
// at88d8b1eff using mocked Firebase IO; these are supported legacy wire outputs, not live incidence.
const backendNullHistoryEnvelopes = [{"data":{"current":{"updatedAt":1790578800000,"totalCTL":0,"totalATL":0,"totalTSB":0,"breakdown":{"bike":{"ctl":0,"atl":0,"tsb":0,"weeklyTSS":100},"run":{"ctl":0,"atl":0,"tsb":0,"weeklyTSS":0},"swim":{"ctl":0,"atl":0,"tsb":0,"weeklyTSS":0}},"inputs":{"bike":"absent","run":"absent","swim":"absent"},"totalsBasis":[],"sourceVersions":{"timeseries_bike":null,"summary_bike":"1:2","timeseries_run":null,"summary_run":null,"timeseries_swim":null,"summary_swim":null},"state":"final","processingState":"legacy","processingSourceAsOf":null,"inputRevision":null,"inputDigest":null,"thresholds":{"bike":{"ftp":200,"ftpRevision":null,"ftpUpdatedAt":null},"run":{"thresholdPace":0},"swim":{"css":0}},"computedAt":1790578800000,"currentCtl":0,"currentAtl":0,"currentTsb":0,"source":"activities","discipline":"all"},"loadStates":{"bike":{"status":"unavailable","inputRevision":null,"processedInputRevision":null,"inputDigest":null,"asOf":null,"thresholdBasis":null},"run":{"status":"unavailable","inputRevision":null,"processedInputRevision":null,"inputDigest":null,"asOf":null,"thresholdBasis":null},"swim":{"status":"unavailable","inputRevision":null,"processedInputRevision":null,"inputDigest":null,"asOf":null,"thresholdBasis":null}},"projection":null,"summaries":{"bike":{"discipline":"bike","computedAt":1790578800000,"week":{"totalTss":100},"meta":{"lastActivityAt":1790578799000}},"run":null,"swim":null},"projections":{"bike":null,"run":null,"swim":null},"pdc":{"bike":null},"timeseries":{"bike":null,"run":null,"swim":null}},"schemaVersion":1,"algorithmVersion":"fitness-snapshot@2","status":"canonical","computedAt":1790578800000,"inputRevision":null,"inputDigest":null,"period":null,"error":null},{"data":{"current":{"updatedAt":1790578800000,"totalCTL":0,"totalATL":0,"totalTSB":0,"breakdown":{"bike":{"ctl":0,"atl":0,"tsb":0,"weeklyTSS":0},"run":{"ctl":0,"atl":0,"tsb":0,"weeklyTSS":0},"swim":{"ctl":0,"atl":0,"tsb":0,"weeklyTSS":0}},"inputs":{"bike":"absent","run":"absent","swim":"absent"},"totalsBasis":[],"sourceVersions":{"timeseries_bike":null,"summary_bike":"1:2","timeseries_run":null,"summary_run":null,"timeseries_swim":null,"summary_swim":null},"state":"final","processingState":"legacy","processingSourceAsOf":null,"inputRevision":null,"inputDigest":null,"thresholds":{"bike":{"ftp":200,"ftpRevision":null,"ftpUpdatedAt":null},"run":{"thresholdPace":0},"swim":{"css":0}},"computedAt":1790578800000,"currentCtl":0,"currentAtl":0,"currentTsb":0,"source":"activities","discipline":"all"},"loadStates":{"bike":{"status":"unavailable","inputRevision":null,"processedInputRevision":null,"inputDigest":null,"asOf":null,"thresholdBasis":null},"run":{"status":"unavailable","inputRevision":null,"processedInputRevision":null,"inputDigest":null,"asOf":null,"thresholdBasis":null},"swim":{"status":"unavailable","inputRevision":null,"processedInputRevision":null,"inputDigest":null,"asOf":null,"thresholdBasis":null}},"projection":null,"summaries":{"bike":{"discipline":"bike","computedAt":1790578800000,"week":{"totalTss":0},"meta":{"lastActivityAt":1790578799000}},"run":null,"swim":null},"projections":{"bike":null,"run":null,"swim":null},"pdc":{"bike":null},"timeseries":{"bike":null,"run":null,"swim":null}},"schemaVersion":1,"algorithmVersion":"fitness-snapshot@2","status":"canonical","computedAt":1790578800000,"inputRevision":null,"inputDigest":null,"period":null,"error":null}] as const;
describe("actual producer/route null-history wire reaches actual mobile screen",()=>{
 it.each(["bike","tri"] as const)("%s retains actual supported weekly100 and confirmed0",async sport=>{
  for(const captured of backendNullHistoryEnvelopes) {
    mocks.canonicalOn=true;mocks.envelope=captured;seed([]);
    const expected=captured.data.current.breakdown.bike.weeklyTSS;
    const h=renderHook(()=>useFitnessModel(sport,options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
    expect(h.result.current.currentPoint?.ctl).toBe(0);expect(h.result.current.dailyData).toEqual([]);
    expect(h.result.current.weeklyStats.thisWeekTSS).toBe(expected);
    const r=render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
    expect(screen.getByText(new RegExp(`이번 주 ${expected}.*평균 –.*휴식 –`))).toBeInTheDocument();
    r.unmount();h.unmount();
  }
 });
 it.each(["wrong-discipline","different-total"])("malformed optional weekly proof %s only removes weekly evidence",async kind=>{
  enableCanonical(null);weeklySummary("bike",fixedNow);
  const raw=(mocks.envelope as {data:{summaries:{bike:{discipline:string;week:{totalTss:number}}}}}).data.summaries.bike;
  if(kind==="wrong-discipline")raw.discipline="run";else raw.week.totalTss=99;
  seed([]);const h=renderHook(()=>useFitnessModel("bike",options));await waitFor(()=>expect(h.result.current.canonicalFitness.values).not.toBeNull());
  expect(h.result.current.currentPoint?.ctl).toBe(40);expect(h.result.current.weeklyStats.thisWeekTSS).toBeNull();
  render(<MemoryRouter><MobileFitnessPage {...h.result.current.mobilePageProps} embedded/></MemoryRouter>);
  expect(screen.getByText(/이번 주 –/)).toBeInTheDocument();
 });
});
