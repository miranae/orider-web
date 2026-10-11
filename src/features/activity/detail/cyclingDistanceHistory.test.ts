import type { CyclingDistanceHistoryRequest, CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { describe, expect, it } from "vitest";
import { cyclingDistanceHistory, cyclingDistanceHistoryLeaders } from "./cyclingDistanceHistory";
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
