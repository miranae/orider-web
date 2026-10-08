import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TriFitnessView from "../pages/fitness/TriFitnessView";
import { MemoryRouter } from "react-router-dom";
import type { Activity } from "@shared/types";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import { getDoc } from "firebase/firestore";
import { setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { clearTrainingSurfaceCache } from "../embedded/trainingSurfaceCache";
import { useFitnessModel } from "./useFitnessModel";
import { FitnessView } from "../pages/FitnessPage";
import FitnessCoachBriefing from "../features/fitness/components/FitnessCoachBriefing";
import { deriveActivityImpacts, activityIdsCoveredByImpacts } from "../features/fitness/activityImpact";
import { deriveActivityStimulus } from "../features/fitness/activityStimulus";
const mocks = vi.hoisted(() => ({user:{uid:"rider-a",isAnonymous:false},firestore:{},timeseries:null as FitnessTimeseriesDoc|null}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, profile: null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: mocks.firestore }) }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./useTrainingDecision", () => ({useTrainingDecision:()=>({enabled:false,envelope:null})}));
vi.mock("./useFtpHistory", () => ({ useFtpHistory: () => ({ entries: [] }) }));
vi.mock("./useMobile", () => ({ useMobile: () => false }));
vi.mock("./usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("../features/fitness/useFitnessCurves", () => ({ useFitnessCurves: () => ({
  run: { recent28: [], prev28: [] }, swim: { recent28: [], prev28: [] },
}) }));
vi.mock("./useBikeFtpDecision", () => ({ useBikeFtpDecision: () => ({ decision: null }) }));
vi.mock("./useCoachRiderInsight", () => ({ useCoachRiderInsight: () => ({ insight: null }) }));
vi.mock("./useUserFitness", () => ({ useUserFitness: () => ({ fitness: null }) }));
vi.mock("./useFitnessClock", () => ({ useFitnessClock: () => Date.now() }));
vi.mock("./useConsistencyStreak", () => ({ useConsistencyStreak: () => ({ summary: null }) }));
vi.mock("./useRunRecords", () => ({ useRunRecords: () => ({ run: null }) }));
vi.mock("./useMilestones", () => ({ useMilestones: () => ({ achieved: new Map(), markCelebrated: vi.fn() }) }));
vi.mock("./useFreshTraining", () => ({ useFreshTraining: () => ({ revalidating: false, justRecomputed: false }) }));
vi.mock("./useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({
  timeseries: mocks.timeseries, loaded: true, error: null, cacheHit: true, freshLoaded: true,
}) }));


const options = { enableCoachRiderInsight: false };
const point = {date:new Date().toISOString().slice(0,10),ctl:40,atl:45,tsb:-5,dailyLoad:100};
function activity(summary: Activity["summary"] | null, id="published"): Activity {
  return {id,userId:"rider-a",type:"Ride",startTime:Date.now(),summary,
    serverDerivedLoad:{schemaVersion:1,userId:"rider-a",inputBinding:"published",streamTss:100}} as unknown as Activity;
}
function seed(activities: Activity[]) {
  setCollectionDocs("activities", activities as unknown as Array<Record<string,unknown>&{id:string}>);
  for (const a of activities) setDocData(`activity_metrics/${a.id}`,{tss:100});
}
beforeEach(()=>{clearTrainingSurfaceCache();mocks.timeseries=null;vi.mocked(getDoc).mockClear();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("retained activity without raw summary",()=>{
  it.each([null, {distance:10000, ridingTimeMillis:3600000,averagePower:180}])("real model and derived reads preserve published load with summary %s",async summary=>{
    const a=activity(summary as Activity["summary"]|null);seed([a]);
    const h=renderHook(()=>useFitnessModel("bike",options));
    await waitFor(()=>expect(h.result.current.metricsMap.get(a.id)).toEqual({tss:100}));
    expect(h.result.current.activities).toEqual([a]);
    expect(h.result.current.dailyData.at(-1)?.totalLoad).toBe(100);
    expect(h.result.current.derivedMetricsSettled).toBe(true);
    expect(vi.mocked(getDoc).mock.calls.some(([ref])=>(ref as {path:string}).path===`activity_metrics/${a.id}`)).toBe(true);
  });
  it("real desktop view preserves known partial load and unknown count without PMC",async()=>{
    const known=activity(null);const unknown={...activity(null,"unknown"),serverDerivedLoad:undefined};seed([known,unknown]);
    function Page(){return <FitnessView model={useFitnessModel("bike",options)}/>;}
    render(<MemoryRouter><Page/></MemoryRouter>);
    await waitFor(()=>expect(screen.getAllByText(/100/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/미확인/).length).toBeGreaterThan(0);
  });
  it("canonical impact and covered activity identity preserve a summary-null accepted load",()=>{
    const a=activity(null);const impacts=deriveActivityImpacts([point],[a]);
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({attributedLoad:100,confidence:"canonical-single"});
    expect(activityIdsCoveredByImpacts([a],impacts).has(a.id)).toBe(true);
    expect(deriveActivityStimulus(a)).toMatchObject({durationSec:null,intensityFactor:null,workoutType:"unknown",source:"insufficient"});
    render(<FitnessCoachBriefing impacts={impacts} selectedActivityId={a.id} onSelectActivity={vi.fn()} forecast={null} current={point} decisionSlot={null} locale="ko" canonicalAvailable discipline="bike"/>);
    expect(screen.getByText("반영 부하 100 TSS")).toBeInTheDocument();
    expect(screen.queryByText(/0 min|0분|0.0 km|NaN/)).not.toBeInTheDocument();
  });
  it("pending briefing retains its activity without inventing raw duration or distance",()=>{
    const a=activity(null);
    render(<FitnessCoachBriefing impacts={[]} selectedActivityId={a.id} onSelectActivity={vi.fn()} forecast={null} current={point} decisionSlot={null} locale="ko" canonicalAvailable pendingActivity={a} discipline="bike"/>);
    expect(screen.getAllByText("일일 부하 반영을 기다리는 중").length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 min|0분|0.0 km|NaN/)).not.toBeInTheDocument();
  });
  it("server stimulus remains available without raw summary",()=>{
    expect(deriveActivityStimulus(activity(null),{workoutType:"interval",durationSec:5400,if:0.88,avgHr:151} as never)).toMatchObject({source:"server-analysis",workoutType:"interval",durationSec:5400,intensityFactor:0.88,heartRateRecorded:true});
  });
  it.each([true,false])("actual tri view displays partial known100 or unknown-only dash (known=%s)",async known=>{
    const unknown={...activity(null,"unknown"),type:"Run",serverDerivedLoad:undefined};
    seed(known ? [{...activity(null),type:"Run"},unknown] : [unknown]);
    function Page(){const model=useFitnessModel("tri",options);return <TriFitnessView range={90} onRangeChange={vi.fn()} breakdown={model.triFitnessBreakdown} timeline={model.triFitnessTimeline} combinedLoad={model.combinedLoad} loadFocus={null}/>;}
    render(<MemoryRouter><Page/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText("부하 미확인 1건 · 확인된 값만 합산")).toBeInTheDocument());
    expect(screen.getByText("총합").parentElement).toHaveTextContent(known ? "100 총합" : "— 총합");
    const runLink=screen.getByRole("link",{name:/러닝.*CTL/});
    expect(runLink).toHaveTextContent(known ? "100 TSS/주" : "— TSS/주");
    expect(runLink).toHaveTextContent("—CTL");
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });
  it("tri weekly warning excludes an old unknown while retaining healthy sport evidence",async()=>{
    const unknown={...activity(null,"old-unknown"),type:"Run",startTime:Date.now()-14*86400000,serverDerivedLoad:undefined};
    mocks.timeseries={discipline:"bike",schemaVersion:1,computedAt:Date.now(),startDate:point.date,endDate:point.date,pointCount:1,points:[point]};
    seed([unknown]);
    function Page(){const model=useFitnessModel("tri",options);return <TriFitnessView range={90} onRangeChange={vi.fn()} breakdown={model.triFitnessBreakdown} timeline={model.triFitnessTimeline} combinedLoad={model.combinedLoad} loadFocus={null}/>;}
    render(<MemoryRouter><Page/></MemoryRouter>);
    await waitFor(()=>expect(screen.getByText("총합").parentElement).toHaveTextContent("100 총합"));
    expect(screen.queryByText(/부하 미확인/)).not.toBeInTheDocument();
    expect(screen.getByRole("link",{name:/사이클링.*CTL/})).toHaveTextContent("40.0CTL");
  });
  it.each([-14, 1])("tri excludes an out-of-week canonical point (%s days) from weekly load but preserves saved CTL",async days=>{
    const date=new Date(Date.now()+days*86400000).toISOString().slice(0,10);
    mocks.timeseries={discipline:"bike",schemaVersion:1,computedAt:Date.now(),startDate:date,endDate:date,pointCount:1,points:[{...point,date}]};
    seed([{...activity(null),type:"Run",serverDerivedLoad:undefined}]);
    const h=renderHook(()=>useFitnessModel("tri",options));
    await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
    expect(h.result.current.triFitnessBreakdown.bike).toMatchObject({weeklyTSS:0,hasKnownWeeklyLoad:false,weeklyUnknownCount:0});
    render(<MemoryRouter><TriFitnessView range={90} onRangeChange={vi.fn()} breakdown={h.result.current.triFitnessBreakdown} timeline={h.result.current.triFitnessTimeline} combinedLoad={h.result.current.combinedLoad} loadFocus={null}/></MemoryRouter>);
    expect(screen.getByText("총합").parentElement).toHaveTextContent("— 총합");
    expect(screen.getByRole("link",{name:/사이클링.*CTL/})).toHaveTextContent("40.0CTL");
  });
  it.each([-7,-6,0,1])("canonical UTC weekly boundary at day%s is independent of browser timezone",async days=>{
    const now=Date.parse("2026-09-28T23:30:00Z");vi.spyOn(Date,"now").mockReturnValue(now);
    const date=new Date(now+days*86400000).toISOString().slice(0,10);
    mocks.timeseries={discipline:"bike",schemaVersion:1,computedAt:now,startDate:date,endDate:date,pointCount:1,points:[{...point,date}]};
    seed([{...activity(null),type:"Run",serverDerivedLoad:undefined}]);
    const h=renderHook(()=>useFitnessModel("tri",options));
    await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
    expect(h.result.current.triFitnessBreakdown.bike.weeklyTSS).toBe(days>=-6&&days<=0 ? 100 : 0);
    expect(h.result.current.triFitnessBreakdown.run.weeklyUnknownCount).toBe(1);
  });
  it("fallback local-day weekly boundary retains accepted load and current unknown",async()=>{
    const now=Date.parse("2026-09-28T23:30:00Z");vi.spyOn(Date,"now").mockReturnValue(now);
    const earliest=new Date(now);earliest.setDate(earliest.getDate()-6);
    seed([{...activity(null),type:"Run",startTime:earliest.getTime()},{...activity(null,"unknown"),type:"Run",serverDerivedLoad:undefined}]);
    const h=renderHook(()=>useFitnessModel("tri",options));
    await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
    expect(h.result.current.triFitnessBreakdown.run).toMatchObject({weeklyTSS:100,hasKnownWeeklyLoad:true,weeklyUnknownCount:1});
  });
  it("tri unknown input has no confirmed aggregate PMC",async()=>{
    seed([{...activity(null),serverDerivedLoad:undefined}]);
    const h=renderHook(()=>useFitnessModel("tri",options));
    await waitFor(()=>expect(h.result.current.derivedMetricsSettled).toBe(true));
    expect(h.result.current.triFitnessTimeline).toEqual([]);
    expect(h.result.current.combinedLoad).toBeNull();
  });
  it("tri retains healthy explicit zero backed by a valid canonical timeline",()=>{
    mocks.timeseries={discipline:"bike",schemaVersion:1,computedAt:Date.now(),startDate:point.date,endDate:point.date,pointCount:1,points:[{...point,ctl:0,atl:0,tsb:0,dailyLoad:0}]};
    seed([]);
    const h=renderHook(()=>useFitnessModel("tri",options));
    expect(h.result.current.triFitnessTimeline.length).toBeGreaterThan(0);
    expect(h.result.current.combinedLoad).toMatchObject({ctl:0,atl:0,tsb:0});
  });
});
