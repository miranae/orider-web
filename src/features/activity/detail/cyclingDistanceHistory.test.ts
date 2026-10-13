import type { CyclingDistanceHistoryRequest, CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { describe, expect, it } from "vitest";
import { cyclingDistanceHistory, cyclingDistanceHistoryLeaders, cyclingDistanceHistoryTrend, cyclingHistoryTotalLeaders, cyclingHistoryValueText } from "./cyclingDistanceHistory";
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

describe("source-qualified cycling history",()=>{
 it("deduplicates cross-page explicit twins while keeping native measurement attribution",()=>{
  const native=row("native");native.representativeInput.stravaTwinActivityId=123;
  const strava=row("strava_123",50000);strava.representativeInput.source="strava";strava.representativeInput.stravaActivityId=123;strava.distanceObservations={state:"legacy_unsupported",points:[]};
  const summary=cyclingDistanceHistory([page([native],false),page([strava])]);expect(summary.groups).toHaveLength(1);expect(summary.representatives[0]!.activityId).toBe("strava_123");
  const leaders=cyclingDistanceHistoryLeaders(summary,"10km",5);expect(leaders.sources).toHaveLength(1);expect(leaders.sources[0]!.activityId).toBe("native");expect(leaders.sources[0]!.canonicalActivityId).toBe("strava_123");expect(leaders.underlyingSourceCount).toBe(1);
 });
 it("selects an eligible subgroup per distance using existing representative policy, not fastest twin",()=>{
  const a=row("a"),b=row("b");a.representativeInput.localSessionId=b.representativeInput.localSessionId="session";a.representativeInput.hasLoad=true;
  a.distanceObservations.points=[{distance:"10km",elapsedSec:800}];b.distanceObservations.points=[{distance:"10km",elapsedSec:700},{distance:"80km",elapsedSec:900}];
  const summary=cyclingDistanceHistory([page([a,b])]);expect(cyclingDistanceHistoryLeaders(summary,"10km",5).sources[0]!.activityId).toBe("a");expect(cyclingDistanceHistoryLeaders(summary,"80km",5).sources[0]!.activityId).toBe("b");
 });
 it("does not infer groups from similar timestamps or route names",()=>{
  expect(cyclingDistanceHistory([page([row("a"),row("b")])]).groups).toHaveLength(2);
 });
 it("sorts received observations globally and bounds year five/range ten",()=>{
  const rows=Array.from({length:12},(_,i)=>{const r=row(`r${i}`,i*1000);r.distanceObservations.points[1]!.elapsedSec=900-i;return r;});
  const summary=cyclingDistanceHistory([page(rows.slice(0,6),false),page(rows.slice(6))]);expect(cyclingDistanceHistoryLeaders(summary,"10km",5).sources.map(r=>r.activityId)).toEqual(["r11","r10","r9","r8","r7"]);expect(cyclingDistanceHistoryLeaders(summary,"10km",10).sources).toHaveLength(10);
 });
 it("keeps 80km and 50miles distinct and includes observed virtual rides without GPS PR claims",()=>{
  const r=row();r.representativeInput.type="VirtualRide";r.distanceObservations.points=[{distance:"80km",elapsedSec:900}];const summary=cyclingDistanceHistory([page([r])]);expect(cyclingDistanceHistoryLeaders(summary,"80km",5).observed).toBe(1);expect(cyclingDistanceHistoryLeaders(summary,"50miles",5).observed).toBe(0);
 });
 it("separates known no effort from unsupported and unavailable",()=>{
  const a=row("a"),b=row("b"),c=row("c");a.distanceObservations={state:"no_observed_efforts",points:[]};b.distanceObservations={state:"legacy_unsupported",points:[]};c.analysis={state:"pending",calculatorVersion:35,inputCoverage:"pending"};c.distanceObservations={state:"unavailable",points:[]};
  expect(cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page([a,b,c])]),"10km",5)).toMatchObject({noObserved:1,unsupported:1,unavailable:1,observed:0});
 });
 it("tracks scanned empty pages and partial coverage, rejecting memory overflow",()=>{
  const pages=Array.from({length:100},(_,i)=>page([],false,i*50000));const result=cyclingDistanceHistory(pages);expect(result.scanned).toBe(5000);expect(result.capped).toBe(true);expect(result.scanComplete).toBe(false);expect(()=>cyclingDistanceHistory([...pages,page([],false)])).toThrow("history_memory_cap");
 });
 it("rejects repeated document IDs across received pages",()=>{expect(()=>cyclingDistanceHistory([page([row()]),page([row()])])).toThrow("history_repeated_activity");});
});

it("retains the actual synthetic calendar binding",()=>{expect(selection.year).toBe(2026);expect(NOW).toBe(wire.readTime.seconds*1000);});

describe("all observed cycling date scatter",()=>{
 it("includes every qualified source beyond the annual five and range ten",()=>{
  const rows=Array.from({length:13},(_,i)=>row(`source-${i}`,i*86400000));const leaders=cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page(rows)]),"10km",5);
  expect(leaders.sources).toHaveLength(5);expect(cyclingDistanceHistoryTrend(leaders.allSources, r => r.elapsedSec).points).toHaveLength(13);
 });
 it("places exact timestamp gaps rather than ordinal index positions",()=>{
  const rows=[row("a",0),row("b",86400000),row("c",10*86400000)];const sources=cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page(rows)]),"10km",10).allSources;
  const points=cyclingDistanceHistoryTrend(sources, r => r.elapsedSec).points;expect(points.map(p=>p.x)).toEqual([65,97,385]);expect(cyclingDistanceHistoryTrend([...sources].reverse(), r => r.elapsedSec).points).toEqual(points);
 });
 it("keeps same-day milliseconds and tied timestamps without fictitious jitter",()=>{
  const rows=[row("b",0),row("a",0),row("c",1),row("d",10)];const sources=cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page(rows)]),"10km",5).allSources;const points=cyclingDistanceHistoryTrend(sources, r => r.elapsedSec).points;
  expect(points.map(p=>p.source.activityId)).toEqual(["a","b","c","d"]);expect(points.map(p=>p.x)).toEqual([65,65,97,385]);
 });
 it("uses centered single/equal values and preserves smaller elapsed as lower plot values",()=>{
  const a=row("a"),b=row("b");a.distanceObservations.points[1]!.elapsedSec=100;b.distanceObservations.points[1]!.elapsedSec=200;const values=cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page([a,b])]),"10km",5).allSources;
  const trend=cyclingDistanceHistoryTrend(values, r => r.elapsedSec);expect(trend.points.map(p=>p.x)).toEqual([225,225]);expect(trend.points[0]!.y).toBeGreaterThan(trend.points[1]!.y);expect(cyclingDistanceHistoryTrend([values[0]!], r => r.elapsedSec).points[0]).toMatchObject({x:225,y:80});expect(cyclingDistanceHistoryTrend([], () => 0).points).toEqual([]);
 });
 it("retains all 5000 already qualified observations with finite coordinates",()=>{
  const base=cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page()]),"10km",5).allSources[0]!;const sources=Array.from({length:5000},(_,i)=>({...base,activityId:`p${i}`,startTime:base.startTime+i,elapsedSec:i+1}));const trend=cyclingDistanceHistoryTrend(sources, r => r.elapsedSec);expect(trend.points).toHaveLength(5000);expect(trend.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);expect(()=>cyclingDistanceHistoryTrend([...sources,base], r => r.elapsedSec)).toThrow();
 });
 it("rejects invalid date/time domains rather than inventing zero points",()=>{
  const base=cyclingDistanceHistoryLeaders(cyclingDistanceHistory([page()]),"10km",5).allSources[0]!;expect(()=>cyclingDistanceHistoryTrend([{...base,startTime:1e100}], r => r.elapsedSec)).toThrow();expect(()=>cyclingDistanceHistoryTrend([{...base,elapsedSec:-1}], r => r.elapsedSec)).toThrow();expect(()=>cyclingDistanceHistoryTrend([{...base,elapsedSec:Infinity}], r => r.elapsedSec)).toThrow();
 });
});

// Actual compiled totals wire 0a9a5b0aae9f0ebd539c7bdd747230121f4e407368b9c12cb14ece9071f67b4d.
const nativeTotals = {
  "scope": "observed_activity_totals",
  "distanceM": 120000,
  "elevationGainM": 800,
  "sourceBasis": {
    "distanceM": "canonical_metrics",
    "elevationGainM": "canonical_metrics"
  },
  "distanceSource": "stream_counter",
  "sourceLayer": "raw_parts",
  "elevationQuality": "reliable",
  "gpsEligibility": "unknown"
} as NonNullable<CyclingDistanceHistoryRow["activityTotals"]>;

describe("per-metric whole-activity source qualification",()=>{
 it("preserves Strava canonical policy but chooses native gain when the preferred twin has no gain",()=>{
  const native=row("native"),strava=row("strava_123",50000);native.activityTotals=structuredClone(nativeTotals);native.representativeInput.stravaTwinActivityId=123;strava.activityTotals={...structuredClone(nativeTotals),elevationGainM:null,elevationQuality:"suspect",sourceLayer:"inline_streams",sourceBasis:{distanceM:"canonical_metrics",elevationGainM:"unavailable"}};strava.representativeInput.source="strava";strava.representativeInput.stravaActivityId=123;
  const summary=cyclingDistanceHistory([page([native],false),page([strava])]);expect(summary.representatives[0]!.activityId).toBe("strava_123");expect(cyclingHistoryTotalLeaders(summary,"distanceM","canonical_metrics",5).sources[0]!.activityId).toBe("strava_123");const gain=cyclingHistoryTotalLeaders(summary,"elevationGainM","canonical_metrics",5);expect(gain.sources[0]!.activityId).toBe("native");expect(gain.sources[0]!.canonicalActivityId).toBe("strava_123");expect(gain.underlyingSourceCount).toBe(1);
 });
 it("keeps canonical and summary observations separate, zero outside positive rankings but inside the plot",()=>{
  const canon=row("canon"),saved=row("saved");canon.activityTotals=structuredClone(nativeTotals);saved.analysis={state:"missing",calculatorVersion:null,inputCoverage:null};saved.metricsRevision=null;saved.distanceObservations={state:"unavailable",points:[]};saved.activityTotals={...structuredClone(nativeTotals),distanceM:60000,elevationGainM:0,sourceBasis:{distanceM:"activity_summary",elevationGainM:"activity_summary"},sourceLayer:null,distanceSource:null,elevationQuality:"unknown"};
  const summary=cyclingDistanceHistory([page([canon,saved])]);const savedGain=cyclingHistoryTotalLeaders(summary,"elevationGainM","activity_summary",5);expect(savedGain).toMatchObject({observed:0,zero:1,otherBasis:1,missing:0});expect(savedGain.sources).toHaveLength(0);expect(cyclingDistanceHistoryTrend(savedGain.allSources,r=>r.value).points[0]).toMatchObject({value:0,y:80});expect(cyclingHistoryTotalLeaders(summary,"distanceM","canonical_metrics",5).sources[0]!.activityId).toBe("canon");
 });
 it("uses the existing representative comparator within each eligible subgroup rather than fastest/largest twin",()=>{
  const a=row("a"),b=row("b");a.activityTotals=structuredClone(nativeTotals);b.activityTotals={...structuredClone(nativeTotals),distanceM:200000};a.representativeInput.localSessionId=b.representativeInput.localSessionId="session";a.representativeInput.hasLoad=true;const leaders=cyclingHistoryTotalLeaders(cyclingDistanceHistory([page([a,b])]),"distanceM","canonical_metrics",10);expect(leaders.sources).toHaveLength(1);expect(leaders.sources[0]!.activityId).toBe("a");expect(leaders.sources[0]!.value).toBe(120000);
 });
 it("includes all whole-activity observations beyond leaders with exact dates and bigger values higher",()=>{
  const rows=Array.from({length:12},(_,i)=>{const r=row(`t${i}`,i*86400000);r.activityTotals={...structuredClone(nativeTotals),distanceM:i*1000};return r;});const leaders=cyclingHistoryTotalLeaders(cyclingDistanceHistory([page(rows)]),"distanceM","canonical_metrics",5);expect(leaders.sources).toHaveLength(5);expect(leaders.zero).toBe(1);const trend=cyclingDistanceHistoryTrend(leaders.allSources,r=>r.value);expect(trend.points).toHaveLength(12);expect(trend.points[0]!.y).toBeGreaterThan(trend.points[11]!.y);
 });
 it("keeps absent optional evidence missing rather than zero",()=>{expect(cyclingHistoryTotalLeaders(cyclingDistanceHistory([page()]),"distanceM","canonical_metrics",5)).toMatchObject({observed:0,zero:0,missing:1});});
 it("guards unit/domain extremes and very tiny values without Infinity, NaN or fabricated zero",()=>{
  for(const value of [Number.MAX_VALUE,Number.MIN_VALUE,0,0.000001])for(const metric of ["elapsed","distanceM","elevationGainM"] as const)for(const units of ["metric","imperial"] as const){const text=cyclingHistoryValueText(value,metric,units);expect(text).not.toMatch(/Infinity|NaN/);if(value>0){if(metric==="elapsed")expect(text).not.toMatch(/^0(?::00|s)$/);else expect(Number.parseFloat(text)).toBeGreaterThan(0);}}
  expect(cyclingHistoryValueText(Number.MAX_VALUE,"elevationGainM","imperial")).toBe(`${Number.MAX_VALUE}m`);expect(cyclingHistoryValueText(NaN,"distanceM","imperial")).toBe("—");
 });
});

it("keeps finite whole-total scatter domains at finite SI/date extremes and tiny values", () => {
 const sources = [row("max-date"),row("tiny"),row("zero")];
 sources[0]!.startTime = 8640000000000000; sources[1]!.startTime = 1; sources[2]!.startTime = 0;
 const values: Record<string,number> = {"max-date":Number.MAX_VALUE,tiny:Number.MIN_VALUE,zero:0};
 const trend = cyclingDistanceHistoryTrend(sources, source => values[source.activityId]!);
 expect(trend.points.map(point => point.source.activityId)).toEqual(["zero","tiny","max-date"]);
 expect(trend.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
 expect(trend.points[0]).toMatchObject({x:65,y:135,value:0});expect(trend.points[2]).toMatchObject({x:385,y:25,value:Number.MAX_VALUE});
 for(const point of trend.points) for(const units of ["metric","imperial"] as const) expect(cyclingHistoryValueText(point.value,"elevationGainM",units)).not.toMatch(/Infinity|NaN/);
});
