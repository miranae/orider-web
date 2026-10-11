import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CyclingDistanceHistoryResponse, CyclingDistanceHistoryRequest } from "@shared/types/training-cycling-distance-history";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadCyclingDistanceHistory, validateCyclingDistanceHistoryResponse, validCyclingDistanceHistoryRequest } from "./trainingCyclingDistanceHistory";
const mocks=vi.hoisted(()=>({call:vi.fn(),callable:vi.fn()}));
vi.mock("firebase/functions",()=>({httpsCallable:mocks.callable}));
// Actual compiled backend response, provenance SHA256 60a7dc6caa1b556ff04e1128797fe1381cf8c53c95e5a8e9c9ddf6cd6128ea94.
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
    "scannedActivityCount": 5,
    "candidateActivityCount": 5,
    "skippedActivityCount": 0,
    "exhausted": true,
    "observationCounts": {
      "observed": 1,
      "noObserved": 1,
      "unsupported": 1,
      "unavailable": 2
    },
    "nextCursor": null
  },
  "activities": [
    {
      "activityId": "bad",
      "startTime": 1767225600000,
      "activityRevision": "100:1",
      "metricsRevision": "100:1",
      "representativeInput": {
        "source": "orider",
        "type": "Ride",
        "discipline": "bike",
        "localSessionId": null,
        "stravaActivityId": null,
        "stravaTwinActivityId": null,
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
        "state": "unavailable",
        "points": []
      }
    },
    {
      "activityId": "empty",
      "startTime": 1767225600000,
      "activityRevision": "100:1",
      "metricsRevision": "100:1",
      "representativeInput": {
        "source": "orider",
        "type": "Ride",
        "discipline": "bike",
        "localSessionId": null,
        "stravaActivityId": null,
        "stravaTwinActivityId": null,
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
        "state": "no_observed_efforts",
        "points": []
      }
    },
    {
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
    },
    {
      "activityId": "pending",
      "startTime": 1767225600000,
      "activityRevision": "100:1",
      "metricsRevision": "100:1",
      "representativeInput": {
        "source": "orider",
        "type": "Ride",
        "discipline": "bike",
        "localSessionId": null,
        "stravaActivityId": null,
        "stravaTwinActivityId": null,
        "endTime": 1767226600000,
        "movingSec": null,
        "hasLoad": false
      },
      "analysis": {
        "state": "pending",
        "calculatorVersion": null,
        "inputCoverage": null
      },
      "distanceObservations": {
        "state": "unavailable",
        "points": []
      }
    },
    {
      "activityId": "strava_123",
      "startTime": 1767225600000,
      "activityRevision": "100:1",
      "metricsRevision": "100:1",
      "representativeInput": {
        "source": "strava",
        "type": "Ride",
        "discipline": "bike",
        "localSessionId": null,
        "stravaActivityId": 123,
        "stravaTwinActivityId": null,
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
        "state": "legacy_unsupported",
        "points": []
      }
    }
  ]
} as CyclingDistanceHistoryResponse;
const NOW=wire.readTime.seconds*1000;
const request: CyclingDistanceHistoryRequest={mode:"cycling_distance_history_page",discipline:"bike",calendarBasis:"Asia/Seoul",rangeBasis:"calendar_year",year:2026};
beforeEach(()=>{vi.restoreAllMocks();vi.spyOn(Date,"now").mockReturnValue(NOW); resetRuntimeConfigForTests({appEnvironment:"stage",firebaseFunctionsBase:"https://asia-northeast3-orider-dev.cloudfunctions.net",trainingAnalysisPeriodsEnabled:true});mocks.call.mockReset().mockResolvedValue({data:structuredClone(wire)});mocks.callable.mockReset().mockReturnValue(mocks.call);});
describe("strict actual cycling history wire contract",()=>{
 it("accepts actual backend response including unsupported and unavailable rows",()=>{expect(validateCyclingDistanceHistoryResponse(wire,request,NOW)).toEqual(wire);});
 it.each([
  (r:CyclingDistanceHistoryResponse)=>{r.mode="history_page" as never;},
  (r:CyclingDistanceHistoryResponse)=>{r.targetsVersion=2 as 1;},
  (r:CyclingDistanceHistoryResponse)=>{r.page.observationCounts.observed++;},
  (r:CyclingDistanceHistoryResponse)=>{r.activities[0]!.metricsRevision="a".repeat(64);},
  (r:CyclingDistanceHistoryResponse)=>{r.activities.find(row => row.distanceObservations.state === "observed")!.distanceObservations.points[0]!.elapsedSec=0;},
  (r:CyclingDistanceHistoryResponse)=>{r.activities.find(row => row.distanceObservations.state === "observed")!.distanceObservations.points[0]!.distance="80miles" as never;},
  (r:CyclingDistanceHistoryResponse)=>{r.activities.find(row => row.distanceObservations.state === "observed")!.distanceObservations.points.push({...r.activities.find(row => row.distanceObservations.state === "observed")!.distanceObservations.points[0]!});},
  (r:CyclingDistanceHistoryResponse)=>{r.activities[0]!.analysis.inputCoverage="partial_terminal";},
  (r:CyclingDistanceHistoryResponse)=>{r.activities[0]!.representativeInput.type="Run";},
  (r:CyclingDistanceHistoryResponse)=>{r.activities[0]!.startTime=1e100;},
  (r:CyclingDistanceHistoryResponse)=>{r.activities.reverse();},
  (r:CyclingDistanceHistoryResponse)=>{r.readTime.nanoseconds=1;},
  (r:CyclingDistanceHistoryResponse)=>{r.expiresAt++;},
  (r:CyclingDistanceHistoryResponse)=>{r.activities[0]!.activityId="../private";},
 ])("fails closed rather than reporting malformed source as no record %#",mutate=>{const r=structuredClone(wire);mutate(r);expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW)).toThrow();});
 it("rejects expiry and unsupported requests; allows a free one-day explicit range",()=>{
  expect(()=>validateCyclingDistanceHistoryResponse(wire,request,wire.expiresAt)).toThrow("history_snapshot_expired");
  expect(validCyclingDistanceHistoryRequest({...request,rangeBasis:"explicit_range",range:{fromInclusive:NOW-86400000,toExclusive:NOW}} as CyclingDistanceHistoryRequest,NOW)).toBe(false);
  const valid:CyclingDistanceHistoryRequest={mode:request.mode,discipline:"bike",calendarBasis:"Asia/Seoul",rangeBasis:"explicit_range",range:{fromInclusive:NOW-86400000,toExclusive:NOW}};
  expect(validCyclingDistanceHistoryRequest(valid,NOW)).toBe(true);
 });
 it("binds exact Stage auth/AppCheck context and invokes only the existing callable",async()=>{
  const app={}; const services={auth:{currentUser:{uid:"owner",isAnonymous:false},app},functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;
  expect(await loadCyclingDistanceHistory(services,"owner",request)).toEqual(wire);expect(mocks.callable).toHaveBeenCalledWith(services.functions,"getTrainingAnalysisPeriods");expect(mocks.call).toHaveBeenCalledExactlyOnceWith(request);
  (services.auth.currentUser as unknown as {isAnonymous:boolean}).isAnonymous=true;await expect(loadCyclingDistanceHistory(services,"owner",request)).rejects.toThrow("account_changed");expect(mocks.call).toHaveBeenCalledOnce();
 });
 it("rechecks owner after AppCheck and after a response without accepting leaked rows",async()=>{
  const app={},auth={app,currentUser:{uid:"owner",isAnonymous:false}};
  const s={auth,functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"},ensureAppCheckReady:vi.fn(async()=>{auth.currentUser.uid="other";})} as unknown as FirebaseServices;
  await expect(loadCyclingDistanceHistory(s,"owner",request)).rejects.toThrow("account_changed");expect(mocks.call).not.toHaveBeenCalled();
  auth.currentUser.uid="owner";s.ensureAppCheckReady=async()=>{};mocks.call.mockImplementation(async()=>{auth.currentUser.uid="other";return{data:wire};});await expect(loadCyclingDistanceHistory(s,"owner",request)).rejects.toThrow("account_changed");
 });
});

it("accepts actual wire timestamps with microseconds and the Admin floored range/expiry",()=>{
 const r=structuredClone(wire);r.readTime.nanoseconds=1000;
 // Actual compiled nanos wire eb2f744cf141c014e47537632b30be1615683caf5f90fe96773137a10abada2b.
 // Admin Timestamp.toMillis() floors the sub-millisecond part in these response fields.
 expect(r.range.toExclusive).toBe(NOW);expect(r.expiresAt).toBe(NOW+1800000);
 expect(validateCyclingDistanceHistoryResponse(r,request,NOW+1)).toEqual(r);
 // Freshness still uses the fractional timestamp, not the floored display fields.
 expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW)).toThrow();
 expect(validateCyclingDistanceHistoryResponse(r,request,NOW+1800000)).toEqual(r);
 expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW+1800001)).toThrow("history_snapshot_expired");
});
it("preserves exact microsecond cursor identity despite matching floored response fields",()=>{
 const r=structuredClone(wire);r.readTime.nanoseconds=1000;r.page.exhausted=false;r.page.scannedActivityCount=50;r.page.skippedActivityCount=50-r.activities.length;
 const last=r.activities[r.activities.length-1]!;
 r.page.nextCursor={scope:"cycling_distance_history_v1_targets1",readTime:{...r.readTime},range:{...r.range},after:{startTime:last.startTime+1000,activityId:"cursor"},requestBinding:"a".repeat(64)};
 expect(validateCyclingDistanceHistoryResponse(r,request,NOW+1)).toEqual(r);
 r.page.nextCursor.readTime.nanoseconds=2000;
 expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW+1)).toThrow("invalid_cycling_distance_history_response");
});
