import { expect, it } from "vitest";
import { overlayEvidence, overlayHistoryRow, overlayPage, overlayRow } from "../../../services/stageCyclingDistanceHistoryOverlay.fixture";
import { cyclingDistanceHistoryOverlay } from "./cyclingDistanceHistoryOverlay";
it("cross-page canonical source displaces faster Stage twin then exact-basis exclusion propagates without resurrection", () => {
 const native = overlayEvidence(overlayRow("native", "stage_distance_snapshot", 700)); native.row.representativeInput.stravaTwinActivityId = 12;
 const canonical = overlayEvidence(overlayRow("strava_12", "canonical_metrics", 900)); canonical.row.source = "strava"; canonical.row.representativeInput.source = "strava"; canonical.row.representativeInput.stravaActivityId = 12;
 const other = overlayEvidence(overlayRow("other", "stage_distance_snapshot", 1000)); const first = { ...overlayPage(), activities: [overlayHistoryRow(native), overlayHistoryRow(other)] }, second = { ...overlayPage(), activities: [overlayHistoryRow(canonical)] };
 expect(cyclingDistanceHistoryOverlay([first], [native, other], "10km", 10).unresolved).toBe(1);
 expect(cyclingDistanceHistoryOverlay([first, second], [native, other], "10km", 10).unresolved).toBe(1);
 expect(cyclingDistanceHistoryOverlay([first, second], [native, other, canonical], "10km", 10).winner?.activityId).toBe("strava_12");
 canonical.canonicalExcluded = ["10km"]; const excluded = cyclingDistanceHistoryOverlay([first, second], [native, other, canonical], "10km", 10); expect(excluded.winner?.activityId).toBe("other"); expect(excluded.excluded).toBe(1); expect(excluded.allSources).toHaveLength(1);
 canonical.canonicalExcluded = []; expect(cyclingDistanceHistoryOverlay([first, second], [native, other, canonical], "10km", 10).nextBest?.activityId).toBe("other");
});
it("unverified twin remains unresolved and revision changes fail closed", () => { const row = overlayEvidence(); const page = { ...overlayPage(), activities: [overlayHistoryRow(row)] }; expect(cyclingDistanceHistoryOverlay([page], [], "10km", 5).unresolved).toBe(1); row.activityRevision = "101:0"; expect(cyclingDistanceHistoryOverlay([page], [row], "10km", 5).invalidated).toBe(true); });
it.each(["pending", "stale", "invalid"] as const)("%s lifecycle-derived load and moving time do not replace original history priority", state => {
 const first = overlayEvidence(overlayRow("a", "canonical_metrics", 1000)), second = overlayEvidence(overlayRow("b", "canonical_metrics", 900));
 for (const e of [first, second]) e.row.representativeInput.localSessionId = "same-session";
 const a = overlayHistoryRow(first), b = overlayHistoryRow(second); a.analysis.state = state; b.analysis.state = state; a.representativeInput = { ...a.representativeInput, hasLoad: false, movingSec: null }; b.representativeInput = { ...b.representativeInput, hasLoad: false, movingSec: null };
 second.row.representativeInput.hasLoad = true; second.row.representativeInput.movingSec = 300;
 const page = { ...overlayPage(), activities: [a, b] }, result = cyclingDistanceHistoryOverlay([page], [first, second], "10km", 10);
 expect(result.invalidated).toBe(false);expect(result.winner?.activityId).toBe("a");expect(result.winner?.effectiveElapsedSec).toBe(1000);
});
it.each(["activityRevision", "metricsRevision", "startTime", "source", "localSessionId", "stravaTwinActivityId"])("real immutable %s mismatch invalidates optional cohort without render exceptions", field => {
 const evidence = overlayEvidence(), row = overlayHistoryRow(evidence); row.representativeInput = { ...row.representativeInput }; const page = { ...overlayPage(), activities: [row] };
 if (field === "activityRevision") evidence.activityRevision = "101:0"; else if(field === "metricsRevision") evidence.metricsRevision = "101:0"; else if(field === "startTime") evidence.row.startTime++; else if(field === "source") evidence.row.source = "strava"; else if(field === "localSessionId") evidence.row.representativeInput.localSessionId = "changed"; else evidence.row.representativeInput.stravaTwinActivityId = 12;
 const result = cyclingDistanceHistoryOverlay([page], [evidence], "10km", 10);expect(result.invalidated).toBe(true);expect(result.allSources).toHaveLength(0);expect(result.checked).toBe(0);
});

// Actual compiled coveredEvidenceRow pending/stale/invalid fixture receipt SHA256 75b1c351bdb3e6e9a9fd969522da58ea9aaaf6482c681152ba804b906d4007f9. Synthetic docs; SDK/Auth/cloud calls0.
const compiledLifecycleRow: ReturnType<typeof overlayRow> = {
  "activityId": "native",
  "startTime": 2000,
  "type": "Ride",
  "source": "orider",
  "representativeInput": {
    "source": "orider",
    "type": "Ride",
    "discipline": "bike",
    "localSessionId": null,
    "stravaActivityId": null,
    "stravaTwinActivityId": null,
    "endTime": null,
    "movingSec": null,
    "hasLoad": true
  },
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
  "canonicalState": "unavailable",
  "snapshotState": "missing",
  "duplicateUncertain": false,
  "efforts": [
    {
      "target": "5miles",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "10km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "10miles",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "20km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "30km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "40km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "50km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "80km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "50miles",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "90km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "100km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "100miles",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    },
    {
      "target": "180km",
      "originalElapsedSec": null,
      "effectiveElapsedSec": null,
      "basis": "unavailable",
      "excluded": false,
      "canonicalActivityId": "native",
      "effortSourceActivityId": null,
      "conflict": false,
      "originalClockVerified": false,
      "coverage": "unknown",
      "quality": "unknown"
    }
  ]
};
it.each(["pending", "stale", "invalid"] as const)("actual compiled %s channel evidence accepts original lifecycle-normalized history", state => {
 const evidence=overlayEvidence(structuredClone(compiledLifecycleRow)), original=overlayHistoryRow(evidence);original.analysis.state=state;original.representativeInput={...original.representativeInput,hasLoad:false};
 const result=cyclingDistanceHistoryOverlay([{...overlayPage(),activities:[original]}],[evidence],"10km",10);expect(result.invalidated).toBe(false);expect(result.unavailable).toBe(1);expect(result.allSources).toHaveLength(0);
});
