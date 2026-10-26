import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import type { ActivityRouteEvidence, ActivityRouteEvidenceResponse } from "@shared/activity-route-comparison";
export function routeFixture(activityId = "first", reverse = false): ActivityRouteEvidence {
  return { activityId, routeInputRevision: "a".repeat(64), routeFingerprint: "b".repeat(64), sourceLayer: "raw_parts", sourceSchemaVersion: "native-v1", accuracy: "unknown", timingBasis: "elapsed", timeOrigin: "relative_to_first_gps_observation", originEpochMs: 1700000000000, coverage: "unknown", points: Array.from({ length: 101 }, (_, index) => ({ lat: 37, lon: 127 + (reverse ? 100 - index : index) * 0.0001, elapsedSec: index })) };
}
export function routeResponse(activityId = "first"): ActivityRouteEvidenceResponse {
  return { mode: "route_evidence", activityId, routeInputRevision: "a".repeat(64), state: "available", reason: null, sourceLayer: "raw_parts", route: routeFixture(activityId) };
}
/** 단일 활동별 확정 평균의 합성 스냅샷. GPS 입력과 지표 revision을 공유하지 않는다. */
export function routeAverageResponse(activityId = "first", startTime = 1700000000000, discipline: "bike" | "run" = "bike", speed: number | null = 12): ActivityRouteEvidenceResponse {
  return { ...routeResponse(activityId), canonicalAverage: { state: "available", reason: null, metricsRevision: "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc", version: ACTIVITY_METRICS_VERSION, discipline, startTime, computedAt: startTime + 3600000, avgSpeedKph: speed, inputCoverage: "complete", sourceLayer: "raw_parts" } };
}

/** 실제 reader의 합성 출력을 그대로 고정한다. 운영 데이터·실행 시 외부 파일 의존은 없다. */
export const backendCanonicalWireFixture = {
  "synthetic": true,
  "operationalReads": 0,
  "producer": "actual compiled readActivityRouteEvidence function",
  "emittedFixtureSha256": "cdd3833475e2e9bdae84cdd199349be9a79a8971d4a48d2bd9fb96e93e38913c",
  "compiledSourceSha256": "415ec38c9d0ff833c6b44efab8393c697b837734245bafae5c90f1c9f46cb178",
  "sourceSha256": "164a9864800690b93dd1a0537bf3a0ca99f4ff7bba4ef75b9ff726e79148727e",
  "cases": [
    {
      "name": "bike_positive",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "available",
          "reason": null,
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
          "version": 41,
          "discipline": "bike",
          "startTime": 1789999970000,
          "computedAt": 1790000010000,
          "avgSpeedKph": 24.125,
          "inputCoverage": "complete",
          "sourceLayer": "raw_parts"
        }
      }
    },
    {
      "name": "bike_zero",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "available",
          "reason": null,
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
          "version": 41,
          "discipline": "bike",
          "startTime": 1789999970000,
          "computedAt": 1790000010000,
          "avgSpeedKph": 0,
          "inputCoverage": "complete",
          "sourceLayer": "raw_parts"
        }
      }
    },
    {
      "name": "bike_null",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "available",
          "reason": null,
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
          "version": 41,
          "discipline": "bike",
          "startTime": 1789999970000,
          "computedAt": 1790000010000,
          "avgSpeedKph": null,
          "inputCoverage": "complete",
          "sourceLayer": "raw_parts"
        }
      }
    },
    {
      "name": "bike_pending",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "pending",
          "reason": "metrics_pending",
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc"
        }
      }
    },
    {
      "name": "bike_unavailable",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "unavailable",
          "reason": "unsupported_metrics",
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc"
        }
      }
    },
    {
      "name": "run_positive",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "available",
          "reason": null,
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
          "version": 41,
          "discipline": "run",
          "startTime": 1789999970000,
          "computedAt": 1790000010000,
          "avgSpeedKph": 12,
          "inputCoverage": "complete",
          "sourceLayer": "raw_parts"
        }
      }
    },
    {
      "name": "run_zero",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "available",
          "reason": null,
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
          "version": 41,
          "discipline": "run",
          "startTime": 1789999970000,
          "computedAt": 1790000010000,
          "avgSpeedKph": 0,
          "inputCoverage": "complete",
          "sourceLayer": "raw_parts"
        }
      }
    },
    {
      "name": "run_null",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "available",
          "reason": null,
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
          "version": 41,
          "discipline": "run",
          "startTime": 1789999970000,
          "computedAt": 1790000010000,
          "avgSpeedKph": null,
          "inputCoverage": "complete",
          "sourceLayer": "raw_parts"
        }
      }
    },
    {
      "name": "run_pending",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "pending",
          "reason": "metrics_pending",
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc"
        }
      }
    },
    {
      "name": "run_unavailable",
      "response": {
        "mode": "route_evidence",
        "activityId": "fixture-activity",
        "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "route": {
          "activityId": "fixture-activity",
          "routeInputRevision": "9f6a0be8175e2b30ff22742b4dcd2ed2f349d7a192a984bc82c45974a56e61aa",
          "routeFingerprint": "3171be4522285b165a1da0f6dec054b7174a50156737e042610e1b5264622e40",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-latlng-csv-v1",
          "accuracy": "unknown",
          "timingBasis": "elapsed",
          "timeOrigin": "relative_to_first_gps_observation",
          "originEpochMs": 1790000000000,
          "coverage": "unknown",
          "points": [
            {
              "lat": 0,
              "lon": 0,
              "elapsedSec": 0
            },
            {
              "lat": 0.0001,
              "lon": 0.0001,
              "elapsedSec": 2.5
            }
          ]
        },
        "canonicalAverage": {
          "state": "unavailable",
          "reason": "unsupported_metrics",
          "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc"
        }
      }
    }
  ]
} as const;

/** Current-version synthetic contract derived from archived wire; NOT a new compiled producer capture.
 * Only canonical available.version is adapted. Archived bytes/provenance and all zero/null/geometry values stay untouched.
 */
export function currentCanonicalContractFixture<T>(archived: T): T {
  const copy = structuredClone(archived);
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.state === "available" && typeof record.version === "number" && "avgSpeedKph" in record && "metricsRevision" in record) {
      record.version = ACTIVITY_METRICS_VERSION;
    }
    for (const child of Object.values(record)) visit(child);
  }
  visit(copy);
  return copy;
}
