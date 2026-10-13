import { compiledBikeProvenanceWire } from "./activityBikeDistanceEvidence.fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CyclingDistanceHistoryResponse, CyclingDistanceHistoryRequest } from "@shared/types/training-cycling-distance-history";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadCyclingDistanceHistory, validateCyclingDistanceHistoryResponse, validCyclingDistanceHistoryRequest } from "./trainingCyclingDistanceHistory";
function neutralHistory(value: CyclingDistanceHistoryResponse): CyclingDistanceHistoryResponse {
  return { ...value, provenanceVersion: 2, sourceBasis: "stored_distance_parts", originalClockVerified: false, timingBasis: "stored_explicit_activity_elapsed", activities: value.activities.map(row => ["observed", "no_observed_efforts"].includes(row.distanceObservations.state) ? { ...row, distanceObservations: { ...row.distanceObservations, provenance: { provenanceVersion: 2, sourceBasis: "stored_distance_parts", timingBasis: "stored_explicit_activity_elapsed", originalClockVerified: false, declaredActivitySource: null, status: "legacy_normalized" } } } : row) };
}
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
 it("accepts actual backend response including unsupported and unavailable rows",()=>{expect(validateCyclingDistanceHistoryResponse(wire,request,NOW)).toEqual(neutralHistory(wire));});
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
  expect(await loadCyclingDistanceHistory(services,"owner",request)).toEqual(neutralHistory(wire));expect(mocks.callable).toHaveBeenCalledWith(services.functions,"getTrainingAnalysisPeriods");expect(mocks.call).toHaveBeenCalledExactlyOnceWith(request);
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
 expect(validateCyclingDistanceHistoryResponse(r,request,NOW+1)).toEqual(neutralHistory(r));
 // Freshness still uses the fractional timestamp, not the floored display fields.
 expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW)).toThrow();
 expect(validateCyclingDistanceHistoryResponse(r,request,NOW+1800000)).toEqual(neutralHistory(r));
 expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW+1800001)).toThrow("history_snapshot_expired");
});
it("preserves exact microsecond cursor identity despite matching floored response fields",()=>{
 const r=structuredClone(wire);r.readTime.nanoseconds=1000;r.page.exhausted=false;r.page.scannedActivityCount=50;r.page.skippedActivityCount=50-r.activities.length;
 const last=r.activities[r.activities.length-1]!;
 r.page.nextCursor={scope:"cycling_distance_history_v1_targets1",readTime:{...r.readTime},range:{...r.range},after:{startTime:last.startTime+1000,activityId:"cursor"},requestBinding:"a".repeat(64)};
 expect(validateCyclingDistanceHistoryResponse(r,request,NOW+1)).toEqual(neutralHistory(r));
 r.page.nextCursor.readTime.nanoseconds=2000;
 expect(()=>validateCyclingDistanceHistoryResponse(r,request,NOW+1)).toThrow("invalid_cycling_distance_history_response");
});

// Actual compiled opt-in wire 0a9a5b0aae9f0ebd539c7bdd747230121f4e407368b9c12cb14ece9071f67b4d.
const totalsWire = {
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
    "scannedActivityCount": 6,
    "candidateActivityCount": 6,
    "skippedActivityCount": 0,
    "exhausted": true,
    "observationCounts": {
      "observed": 1,
      "noObserved": 1,
      "unsupported": 1,
      "unavailable": 3
    },
    "nextCursor": null
  },
  "activities": [
    {
      "activityTotals": {
        "scope": "observed_activity_totals",
        "distanceM": null,
        "elevationGainM": 800,
        "sourceBasis": {
          "distanceM": "unavailable",
          "elevationGainM": "canonical_metrics"
        },
        "distanceSource": null,
        "sourceLayer": "raw_parts",
        "elevationQuality": "reliable",
        "gpsEligibility": "unknown"
      },
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
      "activityTotals": {
        "scope": "observed_activity_totals",
        "distanceM": 120000,
        "elevationGainM": null,
        "sourceBasis": {
          "distanceM": "canonical_metrics",
          "elevationGainM": "unavailable"
        },
        "distanceSource": "stream_counter",
        "sourceLayer": "raw_parts",
        "elevationQuality": "suspect",
        "gpsEligibility": "unknown"
      },
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
      "activityTotals": {
        "scope": "observed_activity_totals",
        "distanceM": 66000,
        "elevationGainM": 0,
        "sourceBasis": {
          "distanceM": "activity_summary",
          "elevationGainM": "activity_summary"
        },
        "distanceSource": null,
        "sourceLayer": null,
        "elevationQuality": "unknown",
        "gpsEligibility": "unknown"
      },
      "activityId": "missing",
      "startTime": 1767225600000,
      "activityRevision": "100:1",
      "metricsRevision": null,
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
        "state": "missing",
        "calculatorVersion": null,
        "inputCoverage": null
      },
      "distanceObservations": {
        "state": "unavailable",
        "points": []
      }
    },
    {
      "activityTotals": {
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
      },
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
      "activityTotals": {
        "scope": "observed_activity_totals",
        "distanceM": null,
        "elevationGainM": null,
        "sourceBasis": {
          "distanceM": "unavailable",
          "elevationGainM": "unavailable"
        },
        "distanceSource": null,
        "sourceLayer": null,
        "elevationQuality": "unknown",
        "gpsEligibility": "unknown"
      },
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
      "activityTotals": {
        "scope": "observed_activity_totals",
        "distanceM": 120000,
        "elevationGainM": 800,
        "sourceBasis": {
          "distanceM": "canonical_metrics",
          "elevationGainM": "canonical_metrics"
        },
        "distanceSource": "stream_counter",
        "sourceLayer": "inline_streams",
        "elevationQuality": "reliable",
        "gpsEligibility": "unknown"
      },
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

describe("optional activity totals isolation",()=>{
 const opted={...request,includeActivityTotals:true as const};
 it("accepts actual opt-in response, zero values and separate source bases without changing object identity",()=>{expect(validateCyclingDistanceHistoryResponse(totalsWire,opted,NOW)).toEqual(neutralHistory(totalsWire));expect(validCyclingDistanceHistoryRequest(opted,NOW)).toBe(true);expect(validCyclingDistanceHistoryRequest({...request,includeActivityTotals:false} as never,NOW)).toBe(false);expect(validateCyclingDistanceHistoryResponse(wire,request,NOW)).toEqual(neutralHistory(wire));});
 it("treats an absent true channel as unknown, while a legacy request rejects an unsolicited channel",()=>{expect(validateCyclingDistanceHistoryResponse(wire,opted,NOW)).toEqual(neutralHistory(wire));expect(()=>validateCyclingDistanceHistoryResponse(totalsWire,request,NOW)).toThrow();});
 it.each([
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.distanceM=Infinity;},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.elevationGainM=-1;},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.scope="gps_pr" as never;},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.gpsEligibility="eligible" as never;},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.sourceBasis.distanceM="activity_summary";},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.distanceSource=null;},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.elevationQuality="suspect";},
  (r:CyclingDistanceHistoryRow)=>{r.activityTotals!.elevationGainM=null;},
 ])("isolates bad totals without mutating or losing the strict 13-distance channel %#",mutate=>{
  const original=structuredClone(totalsWire),r=original.activities.find(row=>row.activityId==="native")!;mutate(r);const before=JSON.stringify(original);Object.freeze(r);Object.freeze(original.activities);Object.freeze(original);
  const safe=validateCyclingDistanceHistoryResponse(original,opted,NOW);expect(safe).not.toBe(original);expect(safe.activities.find(row=>row.activityId==="native")!.activityTotals).toBeUndefined();expect(safe.activities.find(row=>row.activityId==="native")!.distanceObservations).toEqual(neutralHistory(original).activities.find(row=>row.activityId===r.activityId)!.distanceObservations);expect(JSON.stringify(original)).toBe(before);expect(safe.activities.find(row=>row.activityId==="missing")!.activityTotals!.elevationGainM).toBe(0);
 });
 it("still rejects invalid mandatory effort evidence rather than concealing it in the optional channel",()=>{const r=structuredClone(totalsWire);r.activities.find(row=>row.activityId==="native")!.distanceObservations.points[0]!.elapsedSec=0;expect(()=>validateCyclingDistanceHistoryResponse(r,opted,NOW)).toThrow();});
 it("sends true through the existing callable once; false fails before IO",async()=>{const app={},s={auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;mocks.call.mockResolvedValue({data:totalsWire});await loadCyclingDistanceHistory(s,"owner",opted);expect(mocks.call).toHaveBeenCalledExactlyOnceWith(opted);await expect(loadCyclingDistanceHistory(s,"owner",{...request,includeActivityTotals:false} as never)).rejects.toThrow();expect(mocks.call).toHaveBeenCalledOnce();});
});

// Actual compiled backend emitted row: /tmp/orider-bike-history-activity-totals-v34-wire-fixture.json SHA256 f64c0a127243e0587004fdefb6d13bba1d2b9e57cb81ce81a1b2d7e0d7241c07. Fake Firestore only, operations0.
const emittedOutdated34 = {
  "activityTotals": {
    "scope": "observed_activity_totals",
    "distanceM": 66000,
    "elevationGainM": 0,
    "sourceBasis": {
      "distanceM": "activity_summary",
      "elevationGainM": "activity_summary"
    },
    "distanceSource": null,
    "sourceLayer": null,
    "elevationQuality": "unknown",
    "gpsEligibility": "unknown"
  },
  "activityId": "outdated34",
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
    "state": "outdated",
    "calculatorVersion": 34,
    "inputCoverage": "complete"
  },
  "distanceObservations": {
    "state": "unavailable",
    "points": []
  }
} as CyclingDistanceHistoryRow;

describe("activity totals channel calculator 35 boundary", () => {
 const opted = {...request, includeActivityTotals:true as const};
 function oldWire() { const r=structuredClone(totalsWire);r.activities.push(structuredClone(emittedOutdated34));r.activities.sort((a,b)=>a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0);r.page.scannedActivityCount=7;r.page.candidateActivityCount=7;r.page.observationCounts.unavailable=4;return r; }
 it("accepts the backend-emitted v34 outdated complete summary, including observed zero", () => {
  const r=oldWire();expect(validateCyclingDistanceHistoryResponse(r,opted,NOW)).toEqual(neutralHistory(r));expect(r.activities.find(row=>row.activityId==="outdated34")!.activityTotals).toMatchObject({distanceM:66000,elevationGainM:0,sourceBasis:{distanceM:"activity_summary",elevationGainM:"activity_summary"}});
 });
 it("isolates canonical v34 totals while preserving the unchanged mandatory distance channel", () => {
  const r=structuredClone(totalsWire),native=r.activities.find(row=>row.activityId==="native")!;native.analysis.calculatorVersion=34;
  const safe=validateCyclingDistanceHistoryResponse(r,opted,NOW);expect(safe.activities.find(row=>row.activityId==="native")!.activityTotals).toBeUndefined();expect(safe.activities.find(row=>row.activityId==="native")!.distanceObservations).toEqual(neutralHistory(r).activities.find(row=>row.activityId===native.activityId)!.distanceObservations);
  const legacy=structuredClone(r);for(const row of legacy.activities)delete row.activityTotals;expect(validateCyclingDistanceHistoryResponse(legacy,request,NOW)).toEqual(neutralHistory(legacy));
 });
 it("keeps v35 canonical totals valid but rejects v35 summary fallback", () => {
  expect(validateCyclingDistanceHistoryResponse(totalsWire,opted,NOW)).toEqual(neutralHistory(totalsWire));
  const r=oldWire();r.activities.find(row=>row.activityId==="outdated34")!.analysis.calculatorVersion=35;expect(validateCyclingDistanceHistoryResponse(r,opted,NOW).activities.find(row=>row.activityId==="outdated34")!.activityTotals).toBeUndefined();
 });
 it("preserves nullable old-summary distance independently of observed zero gain", () => {
  const r=oldWire(),old=r.activities.find(row=>row.activityId==="outdated34")!;old.activityTotals!.distanceM=null;old.activityTotals!.sourceBasis.distanceM="unavailable";
  expect(validateCyclingDistanceHistoryResponse(r,opted,NOW)).toEqual(neutralHistory(r));expect(old.activityTotals!.distanceM).toBeNull();expect(old.activityTotals!.elevationGainM).toBe(0);
 });
});

describe("cycling provenance v2 with strict legacy compatibility", () => {
  const opted={...request,includeActivityTotals:true as const};
  it("keeps exact old wire immutable and neutralizes only supported observations", () => {
    const before=JSON.stringify(wire), result=validateCyclingDistanceHistoryResponse(wire,request,NOW);
    expect(result).toEqual(neutralHistory(wire)); expect(JSON.stringify(wire)).toBe(before);
    expect(result.activities.find(row=>row.distanceObservations.state==="legacy_unsupported")!.distanceObservations.provenance).toBeUndefined();
  });
  it("accepts stored attribution and totals without changing canonical calculator35 or snapshot", () => {
    const modern=neutralHistory(totalsWire);
    for(const row of modern.activities) if(row.distanceObservations.provenance) Object.assign(row.distanceObservations.provenance,{status:"stored_explicit",declaredActivitySource:"health_connect"});
    expect(validateCyclingDistanceHistoryResponse(modern,opted,NOW)).toBe(modern);
    expect(modern.range).toEqual(totalsWire.range); expect(modern.readTime).toEqual(totalsWire.readTime);
    expect(modern.activities.map(row=>row.activityTotals)).toEqual(totalsWire.activities.map(row=>row.activityTotals));
  });
  it.each([{provenanceVersion:3},{originalClockVerified:true},{declaredActivitySource:["strava"]},{timingBasis:"original_activity_elapsed"},{status:"legacy_normalized",declaredActivitySource:"orider"},{unexpected:true}])("rejects malformed mandatory source provenance without changing totals %j", delta => {
    const modern=neutralHistory(totalsWire), row=modern.activities.find(row=>row.distanceObservations.state==="observed")!;
    Object.assign(row.distanceObservations.provenance!,delta); const before=JSON.stringify(modern);
    expect(()=>validateCyclingDistanceHistoryResponse(modern,opted,NOW)).toThrow("invalid_cycling_distance_history_response"); expect(JSON.stringify(modern)).toBe(before);
  });
  it("rejects a new field injected into old wire, rather than downgrading it",()=>{
    expect(()=>validateCyclingDistanceHistoryResponse({...wire,provenanceVersion:undefined},request,NOW)).toThrow();
    const modern=neutralHistory(wire); delete modern.activities.find(row=>row.distanceObservations.state==="observed")!.distanceObservations.provenance;
    expect(()=>validateCyclingDistanceHistoryResponse(modern,request,NOW)).toThrow();
  });
});

it("matches actual compiled legacy normalization and modern history with exact totals/snapshot",()=>{
  const wires=compiledBikeProvenanceWire.history, now=wires.modernWire.result.readTime.seconds*1000;
  const raw=wires.legacyWire.result, normalized=wires.normalizedLegacyWire.result, modern=wires.modernWire.result;
  const request={mode:"cycling_distance_history_page",discipline:"bike",calendarBasis:"Asia/Seoul",rangeBasis:"calendar_year",year:2026,includeActivityTotals:true} as const;
  expect(validateCyclingDistanceHistoryResponse(raw,request,now)).toEqual(normalized);
  expect(validateCyclingDistanceHistoryResponse(modern,request,now)).toBe(modern);
});
