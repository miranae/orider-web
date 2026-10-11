import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityRouteIndexPageRequest, ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { loadActivityRouteIndexPage, routeIndexPositionAfter, validateActivityRouteIndexPageResponse, validActivityRouteIndexPageRequest } from "./activityRouteIndexPage";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), available: true }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.invoke }));
vi.mock("./activityRouteEvidence", async original => ({ ...await original<typeof import("./activityRouteEvidence")>(), observedRouteAvailable: () => mocks.available }));
const now = 1791792000000;
const request: ActivityRouteIndexPageRequest = { mode: "route_index_page", anchorActivityId: "anchor", discipline: "run" };
// 합성 계약의 반례다. 실제 compiled wire는 백엔드 최종 승인 후 고정한다.
function wire(): ActivityRouteIndexPageResponse {
  return { mode: "route_index_page", anchorActivityId: "anchor", state: "available", reason: null,
    readTime: { seconds: now / 1000, nanoseconds: 0 }, expiresAt: now + 1800000,
    searchScope: { kind: "stored_index_start_latitude_band", queryPolicyVersion: "start-latitude-band-v1" },
    scannedCount: 1, pageScannedCount: 1, queryFetchedCount: 1, geometryPrefilteredCount: 0, sourceValidatedCount: 1,
    nextCursor: null, exhausted: true, scanCapReached: false,
    candidates: [{ activityId: "candidate", startTime: now - 86400000, match: { state: "available", direction: "forward", guidance: "observed_similar", forwardCandidate: true,
      coverage: "not_complete", lengthRatio: 1, forward: { meanSeparationM: 0, p95SeparationM: 0, startSeparationM: 0, endSeparationM: 0 },
      reverse: { meanSeparationM: 100, p95SeparationM: 100, startSeparationM: 100, endSeparationM: 100 }, limitations: ["sample_based", "no_loop_rotation", "coverage_not_complete"] },
      canonicalAverage: { state: "available", reason: null, version: 35, metricsRevision: "a".repeat(64), discipline: "run", startTime: now - 86400000, computedAt: now - 1000, avgSpeedKph: 12, inputCoverage: "complete", sourceLayer: "raw_parts" } }],
    omitted: [], io: { documents: 12, metadata: 1, rawDownloads: 0, writes: 0 }, limitations: ["direct_anchor_only", "scanned_page_only", "source_geo_quality_unknown", "gcs_firestore_non_atomic"] };
}
afterEach(() => { vi.useRealTimers(); mocks.available = true; mocks.invoke.mockReset(); });
describe("route index page strict contract", () => {
  it("preserves thin candidate DTO and known zero/null without summary or coordinates", () => {
    const value = wire(); expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value);
    const average = value.candidates[0]!.canonicalAverage;
    if (average.state === "available") { average.avgSpeedKph = 0; expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value); average.avgSpeedKph = null; expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value); }
  });
  it.each(["hole", "duplicate", "wrong_anchor", "wrong_sport", "old_version", "colon_revision", "nan", "unknown_average", "reverse", "count", "io"])("rejects %s without inventing candidate values", problem => {
    const value = wire(), row = value.candidates[0]!;
    if (problem === "hole") delete value.candidates[0];
    if (problem === "duplicate") { value.candidates.push(row); value.sourceValidatedCount = value.pageScannedCount = value.scannedCount = value.queryFetchedCount = 2; }
    if (problem === "wrong_anchor") value.anchorActivityId = "other";
    if (problem === "wrong_sport" && row.canonicalAverage.state === "available") row.canonicalAverage.discipline = "bike";
    if (problem === "old_version") Object.assign(row.canonicalAverage, { version: 34 });
    if (problem === "colon_revision") Object.assign(row.canonicalAverage, { metricsRevision: "100:1" });
    if (problem === "nan") Object.assign(row.canonicalAverage, { avgSpeedKph: NaN });
    if (problem === "unknown_average") Object.assign(row.canonicalAverage, { distanceKm: 5 });
    if (problem === "reverse") row.match.direction = "reverse";
    if (problem === "count") value.sourceValidatedCount = 0;
    if (problem === "io") Object.assign(value.io, { rawDownloads: 1 });
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow("invalid_route_index_page");
  });
  it("accepts changing cursor digest and rejects backwards latitude/id, stale snapshots and cap overflow", () => {
    const value = wire(), cursor = { readTime: value.readTime, anchorPrivateSourceRevision: "b".repeat(64), policyVersion: "observed-route-index-v1" as const,
      queryPolicyVersion: "start-latitude-band-v1" as const, after: { startLatitude: 37, activityId: "A" }, scannedCount: 1, requestBinding: "c".repeat(64) };
    value.scannedCount = 2; value.exhausted = false; value.nextCursor = { ...cursor, scannedCount: 2, after: { startLatitude: 37, activityId: "B" }, requestBinding: "d".repeat(64) };
    const nextRequest = { ...request, cursor };
    expect(validateActivityRouteIndexPageResponse(value, nextRequest, now)).toBe(value);
    value.nextCursor.after.activityId = "A"; expect(() => validateActivityRouteIndexPageResponse(value, nextRequest, now)).toThrow();
    expect(() => validateActivityRouteIndexPageResponse(value, nextRequest, now + 1800000)).toThrow("route_index_expired");
    expect(validActivityRouteIndexPageRequest({ ...request, cursor: { ...cursor, scannedCount: 5000 } }, now)).toBe(false);
    expect(routeIndexPositionAfter({ startLatitude: 37, activityId: "a" }, { startLatitude: 37, activityId: "Z" })).toBe(true);
    expect(routeIndexPositionAfter({ startLatitude: 36, activityId: "z" }, cursor.after)).toBe(false);
  });
  it("does not equate an empty page with exhausted scope and permits unconsumed budget omission", () => {
    const value = wire(); value.state = "budget_partial"; value.reason = "validation_budget_exceeded"; value.candidates = []; value.sourceValidatedCount = 0;
    value.omitted = [{ activityId: "blocked", state: "validation_budget_exceeded" }]; value.exhausted = false;
    expect(validateActivityRouteIndexPageResponse(value, request, now)).toBe(value);
    value.state = "no_forward_candidates_in_scanned_page"; value.reason = null;
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow();
  });
  it.each([1000, 999999999])("accepts Admin floor-millisecond expiry for nanos %i while keeping full-precision TTL", nanos => {
    const value = wire(); value.readTime.nanoseconds = nanos;
    value.expiresAt = now + Math.floor(nanos / 1e6) + 1800000;
    const fullClock = now + nanos / 1e6;
    expect(validateActivityRouteIndexPageResponse(value, request, fullClock)).toBe(value);
    value.expiresAt++; expect(() => validateActivityRouteIndexPageResponse(value, request, fullClock)).toThrow("invalid_route_index_page");
    value.expiresAt--; expect(() => validateActivityRouteIndexPageResponse(value, request, fullClock - 1)).toThrow("invalid_route_index_page");
    expect(validateActivityRouteIndexPageResponse(value, request, fullClock + 1800000 - 1)).toBe(value);
    expect(() => validateActivityRouteIndexPageResponse(value, request, fullClock + 1800000)).toThrow("route_index_expired");
  });
  it.each([
    ["inputCoverage", ["partial_terminal"]], ["inputCoverage", { toString: () => "partial_terminal" }],
    ["sourceLayer", ["raw_parts"]], ["sourceLayer", { toString: () => "raw_parts" }],
    ["discipline", ["run"]], ["metricsRevision", "A".repeat(64)], ["metricsRevision", ["a".repeat(64)]],
  ])("rejects coercible or malformed available-average %s", (field, invalidValue) => {
    const value = wire(); Object.assign(value.candidates[0]!.canonicalAverage, { [field as string]: invalidValue });
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow("invalid_route_index_page");
  });
  it.each([{ reason: ["missing_metrics"] }, { reason: { toString: () => "missing_metrics" } }])("rejects coercible unavailable reason %j", ({ reason }) => {
    const value = wire(); Object.assign(value.candidates[0]!, { canonicalAverage: { state: "unavailable", reason, metricsRevision: null } });
    expect(() => validateActivityRouteIndexPageResponse(value, request, now)).toThrow("invalid_route_index_page");
  });
  it("calls only the explicit authenticated mode after AppCheck and checks account again", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } }, ensure = vi.fn().mockResolvedValue(undefined);
    const services = { auth, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: ensure } as unknown as FirebaseServices;
    mocks.invoke.mockResolvedValue({ data: wire() });
    await loadActivityRouteIndexPage(services, "owner", request); expect(ensure).toHaveBeenCalledOnce(); expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(request);
    ensure.mockImplementation(async () => { auth.currentUser.uid = "other"; });
    await expect(loadActivityRouteIndexPage(services, "owner", request)).rejects.toThrow("account_changed"); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});

// 실제 compiled reader가 주입된 합성 SDK/Firestore/GCS로 반환한 전체 wire다. 운영 소유자나 원본 수집 완전성 증명이 아니다.
// Artifact SHA256: 09059a4f93f6d2b5be629b3f1273a1d7d6a0d01b01b14312087b60dfd2e9a1f2
const compiledWire = {
  "provenance": {
    "synthetic": true,
    "injectedSDK": true,
    "injectedFirestore": true,
    "injectedGCSMetadata": true,
    "ownerRuntimeVerified": false,
    "actualRawCoverageVerified": false,
    "operationalIO": 0,
    "compiledReader": "/Users/moon/work/projects/miranae/orider/_worktrees/orider-g1-web-analysis-private-route-index-reader-20261012/functions/lib/functions/src/analysis/activity-route-index-reader.js",
    "compiledReaderSha256": "717e859e293659acfedc65110b428dd62a80a96b518a90f8e32464d80b08b70b",
    "compiledGeometrySha256": "1e3bd85b9e936d8feadf558d24446130eb0b9ab6a89a943873aab8889691b2a5",
    "sourceReaderSha256": "c1fe53f21a6c8328c7add0aaf2efef39899a0f601780ff300ea9fb1a117186ac",
    "sharedDtoSha256": "4c4d5952f3c41b5bf3172b2312f77b15c73c320df438ea292e1f1786e96a1234",
    "canonicalAverageEvidence": "synthetic stored partial_terminal inline metrics accepted by actual compiled decoder; unavailable metrics preserved independently; no live raw coverage claim"
  },
  "pages": [
    {
      "case": "inline",
      "witnessCount": 6,
      "phase": "initial",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike"
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "budget_partial",
        "reason": "validation_budget_exceeded",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 10,
        "pageScannedCount": 10,
        "queryFetchedCount": 21,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 9,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "3962189f4a82b83d56ff0548242f1e0109d196ee342c4f6ab9262df21b121d91",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride08"
          },
          "scannedCount": 10,
          "requestBinding": "84789feb8f81a24e6a2c7b543fc6f67dd3af48f288c88889fe70ae917201de07"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [
          {
            "activityId": "ride00",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "available",
              "reason": null,
              "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
              "version": 35,
              "discipline": "bike",
              "startTime": 1791763100123,
              "computedAt": 1791763198123,
              "avgSpeedKph": 24.125,
              "inputCoverage": "partial_terminal",
              "sourceLayer": "inline_streams"
            }
          },
          {
            "activityId": "ride01",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride02",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride03",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride04",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride05",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride06",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride07",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride08",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          }
        ],
        "omitted": [
          {
            "activityId": "ride09",
            "state": "validation_budget_exceeded"
          }
        ],
        "io": {
          "documents": 198,
          "metadata": 0,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "inline",
      "witnessCount": 6,
      "phase": "next",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike",
        "cursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "3962189f4a82b83d56ff0548242f1e0109d196ee342c4f6ab9262df21b121d91",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride08"
          },
          "scannedCount": 10,
          "requestBinding": "84789feb8f81a24e6a2c7b543fc6f67dd3af48f288c88889fe70ae917201de07"
        }
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "budget_partial",
        "reason": "validation_budget_exceeded",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 19,
        "pageScannedCount": 9,
        "queryFetchedCount": 16,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 9,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "3962189f4a82b83d56ff0548242f1e0109d196ee342c4f6ab9262df21b121d91",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride17"
          },
          "scannedCount": 19,
          "requestBinding": "7186585811153805e7e2fa5127c2f95db703dc4108133d42af66ae3899b9ce24"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [
          {
            "activityId": "ride09",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride10",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride11",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride12",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride13",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride14",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride15",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride16",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride17",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          }
        ],
        "omitted": [
          {
            "activityId": "ride18",
            "state": "validation_budget_exceeded"
          }
        ],
        "io": {
          "documents": 193,
          "metadata": 0,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "archive",
      "witnessCount": 8,
      "phase": "initial",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike"
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "budget_partial",
        "reason": "validation_budget_exceeded",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 8,
        "pageScannedCount": 8,
        "queryFetchedCount": 21,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 7,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "d5ca0f97b0c922877c7c1cba7fd1918eba46c2d84684a53558dd7347bdda9759",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride06"
          },
          "scannedCount": 8,
          "requestBinding": "722c6d541f254800651d9d973e914e407f63f85a9e6753f2fc43c5728b37b82c"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [
          {
            "activityId": "ride00",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride01",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride02",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride03",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride04",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride05",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride06",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          }
        ],
        "omitted": [
          {
            "activityId": "ride07",
            "state": "validation_budget_exceeded"
          }
        ],
        "io": {
          "documents": 196,
          "metadata": 16,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "archive",
      "witnessCount": 8,
      "phase": "next",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike",
        "cursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "d5ca0f97b0c922877c7c1cba7fd1918eba46c2d84684a53558dd7347bdda9759",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride06"
          },
          "scannedCount": 8,
          "requestBinding": "722c6d541f254800651d9d973e914e407f63f85a9e6753f2fc43c5728b37b82c"
        }
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "budget_partial",
        "reason": "validation_budget_exceeded",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 15,
        "pageScannedCount": 7,
        "queryFetchedCount": 18,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 7,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "d5ca0f97b0c922877c7c1cba7fd1918eba46c2d84684a53558dd7347bdda9759",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride13"
          },
          "scannedCount": 15,
          "requestBinding": "c2c3dae8914caf1fda59a8e307e529650fa62923a0a40720c2f8a41595574539"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [
          {
            "activityId": "ride07",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride08",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride09",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride10",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride11",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride12",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride13",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          }
        ],
        "omitted": [
          {
            "activityId": "ride14",
            "state": "validation_budget_exceeded"
          }
        ],
        "io": {
          "documents": 193,
          "metadata": 16,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "archive",
      "witnessCount": 9,
      "phase": "initial",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike"
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "budget_partial",
        "reason": "validation_budget_exceeded",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 7,
        "pageScannedCount": 7,
        "queryFetchedCount": 21,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 6,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "acc195f215e549321d265b5f228ff04f6e6135a6b1f81b2265059bc5a789cdf9",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride05"
          },
          "scannedCount": 7,
          "requestBinding": "35ffd5ddb32479b02d215c8f48d312ea8cae4a8e40f249df9f434c1b9ab55c13"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [
          {
            "activityId": "ride00",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride01",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride02",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride03",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride04",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride05",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          }
        ],
        "omitted": [
          {
            "activityId": "ride06",
            "state": "validation_budget_exceeded"
          }
        ],
        "io": {
          "documents": 189,
          "metadata": 14,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "archive",
      "witnessCount": 9,
      "phase": "next",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike",
        "cursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "acc195f215e549321d265b5f228ff04f6e6135a6b1f81b2265059bc5a789cdf9",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride05"
          },
          "scannedCount": 7,
          "requestBinding": "35ffd5ddb32479b02d215c8f48d312ea8cae4a8e40f249df9f434c1b9ab55c13"
        }
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "budget_partial",
        "reason": "validation_budget_exceeded",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 13,
        "pageScannedCount": 6,
        "queryFetchedCount": 19,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 6,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "acc195f215e549321d265b5f228ff04f6e6135a6b1f81b2265059bc5a789cdf9",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride11"
          },
          "scannedCount": 13,
          "requestBinding": "6ad6aa182adc579ca133c7ed7c17544bac9732c62a25ec400da10f0efd8a87ff"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [
          {
            "activityId": "ride06",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride07",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride08",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride09",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride10",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          },
          {
            "activityId": "ride11",
            "startTime": 1791763100123,
            "match": {
              "state": "available",
              "direction": "forward",
              "guidance": "observed_similar",
              "forwardCandidate": true,
              "coverage": "complete",
              "lengthRatio": 1,
              "forward": {
                "meanSeparationM": 0,
                "p95SeparationM": 0,
                "startSeparationM": 0,
                "endSeparationM": 0
              },
              "reverse": {
                "meanSeparationM": 558.1549259018597,
                "p95SeparationM": 1059.6222421419338,
                "startSeparationM": 1111.9492664453662,
                "endSeparationM": 1111.9492664453662
              },
              "limitations": [
                "sample_based",
                "no_loop_rotation"
              ]
            },
            "canonicalAverage": {
              "state": "unavailable",
              "reason": "missing_metrics",
              "metricsRevision": null
            }
          }
        ],
        "omitted": [
          {
            "activityId": "ride12",
            "state": "validation_budget_exceeded"
          }
        ],
        "io": {
          "documents": 187,
          "metadata": 14,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "prefilter",
      "witnessCount": 6,
      "phase": "initial",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike"
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "no_forward_candidates_in_scanned_page",
        "reason": "stored_geometry_prefilter_not_source_verified",
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 20,
        "pageScannedCount": 20,
        "queryFetchedCount": 21,
        "geometryPrefilteredCount": 19,
        "sourceValidatedCount": 0,
        "nextCursor": {
          "readTime": {
            "seconds": 1791763200,
            "nanoseconds": 123000000
          },
          "anchorPrivateSourceRevision": "3962189f4a82b83d56ff0548242f1e0109d196ee342c4f6ab9262df21b121d91",
          "policyVersion": "observed-route-index-v1",
          "queryPolicyVersion": "start-latitude-band-v1",
          "after": {
            "startLatitude": 37,
            "activityId": "ride18"
          },
          "scannedCount": 20,
          "requestBinding": "2c7d7865834dd553d2d908cc3798eeca06f7c3efc6b888c8a326e6e7821dee9f"
        },
        "exhausted": false,
        "scanCapReached": false,
        "candidates": [],
        "omitted": [
          {
            "activityId": "ride00",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride01",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride02",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride03",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride04",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride05",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride06",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride07",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride08",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride09",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride10",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride11",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride12",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride13",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride14",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride15",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride16",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride17",
            "state": "stored_geometry_not_forward_unverified"
          },
          {
            "activityId": "ride18",
            "state": "stored_geometry_not_forward_unverified"
          }
        ],
        "io": {
          "documents": 45,
          "metadata": 0,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    },
    {
      "case": "out_of_band_index_exists",
      "phase": "scoped_exhausted",
      "request": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "discipline": "bike"
      },
      "response": {
        "mode": "route_index_page",
        "anchorActivityId": "anchor",
        "state": "no_forward_candidates_in_scanned_page",
        "reason": null,
        "readTime": {
          "seconds": 1791763200,
          "nanoseconds": 123000000
        },
        "expiresAt": 1791765000123,
        "searchScope": {
          "kind": "stored_index_start_latitude_band",
          "queryPolicyVersion": "start-latitude-band-v1"
        },
        "scannedCount": 1,
        "pageScannedCount": 1,
        "queryFetchedCount": 1,
        "geometryPrefilteredCount": 0,
        "sourceValidatedCount": 0,
        "nextCursor": null,
        "exhausted": true,
        "scanCapReached": false,
        "candidates": [],
        "omitted": [],
        "io": {
          "documents": 25,
          "metadata": 0,
          "rawDownloads": 0,
          "writes": 0
        },
        "limitations": [
          "direct_anchor_only",
          "scanned_page_only",
          "source_geo_quality_unknown",
          "gcs_firestore_non_atomic"
        ]
      }
    }
  ]
};

describe("actual compiled reader wire compatibility", () => {
  it.each(compiledWire.pages)("accepts $case/$phase and preserves counts, canonical gaps and source metadata", ({ request: compiledRequest, response }) => {
    const request = compiledRequest as ActivityRouteIndexPageRequest;
    const fullClock = response.readTime.seconds * 1000 + response.readTime.nanoseconds / 1e6;
    expect(validateActivityRouteIndexPageResponse(response, request, fullClock)).toBe(response);
    expect(response.io.rawDownloads).toBe(0); expect(response.io.writes).toBe(0);
    expect(response.candidates.length).toBeLessThanOrEqual(response.sourceValidatedCount);
  });
  it("resumes each blocked record without requiring a constant cursor binding", () => {
    for (let index = 0; index < 6; index += 2) {
      const first = compiledWire.pages[index]!, next = compiledWire.pages[index + 1]!;
      const cursor = first.response.nextCursor;
      expect(cursor).not.toBeNull();
      expect(next.request).toHaveProperty("cursor", cursor);
      expect(next.response.scannedCount).toBe(first.response.scannedCount + next.response.pageScannedCount);
      const blocked = first.response.omitted.find(row => row.state === "validation_budget_exceeded");
      expect(next.response.candidates.some(row => row.activityId === blocked?.activityId)).toBe(true);
      expect(next.response.nextCursor?.requestBinding).not.toBe(cursor?.requestBinding);
    }
  });
  it("keeps actual stored partial-terminal inline analysis distinct from unavailable averages", () => {
    const rows = compiledWire.pages.flatMap(page => page.response.candidates);
    expect(rows.some(row => row.canonicalAverage.state === "available" && row.canonicalAverage.inputCoverage === "partial_terminal" && row.canonicalAverage.sourceLayer === "inline_streams")).toBe(true);
    expect(rows.some(row => row.canonicalAverage.state === "unavailable")).toBe(true);
    expect(compiledWire.provenance.ownerRuntimeVerified).toBe(false);
    expect(compiledWire.provenance.actualRawCoverageVerified).toBe(false);
  });
  it.each(["backwards", "snapshot", "counts", "canonical_coercion", "sparse", "scope", "binding"])("rejects actual wire tampering: %s", problem => {
    const fixture = problem === "canonical_coercion" ? compiledWire.pages[0]! : compiledWire.pages[1]!;
    const value = structuredClone(fixture.response), request = structuredClone(fixture.request) as ActivityRouteIndexPageRequest;
    if (problem === "backwards" && value.nextCursor && request.cursor) value.nextCursor.after = { ...request.cursor.after };
    if (problem === "snapshot") value.readTime.nanoseconds += 1000;
    if (problem === "counts") value.scannedCount++;
    if (problem === "canonical_coercion") {
      expect(validateActivityRouteIndexPageResponse(value, request, value.readTime.seconds * 1000 + 1000)).toBe(value);
      const row = value.candidates[0]!;
      expect(row.activityId).toBe("ride00"); expect(row.canonicalAverage.state).toBe("available");
      Object.assign(row.canonicalAverage, { inputCoverage: ["partial_terminal"] });
    }
    if (problem === "sparse") delete value.candidates[0];
    if (problem === "scope") Object.assign(value.searchScope, { kind: "all_history" });
    if (problem === "binding" && value.nextCursor) value.nextCursor.requestBinding = "invalid";
    expect(() => validateActivityRouteIndexPageResponse(value, request, value.readTime.seconds * 1000 + 1000)).toThrow("invalid_route_index_page");
  });
});
