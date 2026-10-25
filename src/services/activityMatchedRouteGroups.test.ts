import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { ActivityMatchedRouteGroupRequest, ActivityMatchedRouteGroupResponse } from "@shared/activity-matched-route-groups";
import { loadActivityMatchedRouteGroups, validateActivityMatchedRouteGroupResponse, validateMatchedRouteGroupAppend } from "./activityMatchedRouteGroups";
const mocks = vi.hoisted(() => ({ call: vi.fn(), available: true }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.call) }));
vi.mock("./activityRouteEvidence", async importOriginal => ({ ...(await importOriginal<typeof import("./activityRouteEvidence")>()), observedRouteAvailable: () => mocks.available }));
// Actual compiled reader output from synthetic SDK only; no owner/runtime evidence.
// source artifact SHA256: b51e5310242da9faa48f9e04846f91984945bdda3608529d830ee9b9f8cf59ff
const compiled = [
  {
    "count": 3,
    "archive": false,
    "first": {
      "mode": "matched_route_group_page",
      "anchorActivityId": "anchor",
      "discipline": "bike",
      "state": "available",
      "readTime": {
        "seconds": 1791763200,
        "nanoseconds": 0
      },
      "expiresAt": 1791765000000,
      "groupToken": "mrgg1.ORdtnzizq6tjJ0Vi0WQUXKMLpMhVLwJkbV866uAjpPFr7f296Qq8dyrdqwZq6Vv4S0SrDcfqONJr_kuFjyH1xEn_croi-6U5wraV8MTbPL0mGJshrTFzLSMntef-QVJttVG_KqtUtI8OU-U4upvXF82dEwbBustNTh9CDM4Omwhf6uqDKXKblBp1zdilOFc0NDxvS9G6FuRyoI965EtmOa6CM1-q-dr7ie_pmoxGadAKAT5AVsOKAnLHVkBaWy8o3iP02jOw8T2wbxV3Rky3orla2-Svrga7Oop1z5v583z-m6ZdHl8b7mImPhMZa-X4S0v_sopyfXBZ9TpDKU_8xBN5u4T5vXnVd_yxlIxE0_QEheYDjvaMRIInKZQR7sSgAHaO4KQJtZ90svhCf-bdNEPbEUEPoFltTBSn2v9yutD0MXX8egE",
      "nextCursor": null,
      "scope": {
        "kind": "bounded_owner_stored_index_cohort",
        "indexQueryPolicy": "document_id_first20_v1",
        "groupPolicy": "observed-complete-link-v1",
        "descriptorLimit": 20,
        "validatedLimit": 6
      },
      "coverage": {
        "indexCohort": "exhausted",
        "sourceValidation": "complete_in_cohort",
        "wholeHistory": "unknown",
        "geometry": "observed_complete_gap_free",
        "gpsAccuracy": "unknown",
        "deduplication": "unknown"
      },
      "omittedCounts": {
        "unsupportedDescriptor": 0,
        "partialGeometry": 0,
        "gapGeometry": 0,
        "changedSource": 0,
        "validationCap": 0,
        "nonAnchorCluster": 0
      },
      "members": [
        {
          "activityId": "anchor",
          "startTime": 1791504000000,
          "year": 2026,
          "isAnchor": true,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1791504000000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 20,
            "inputCoverage": "complete",
            "sourceLayer": "inline_streams"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        },
        {
          "activityId": "ride00",
          "startTime": 1791590400000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1791590400000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 21,
            "inputCoverage": "complete",
            "sourceLayer": "inline_streams"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        },
        {
          "activityId": "ride01",
          "startTime": 1791676800000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1791676800000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 22,
            "inputCoverage": "complete",
            "sourceLayer": "inline_streams"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        }
      ],
      "summary": {
        "memberCount": 3,
        "knownMetricCount": 3,
        "rankEligibleCount": 3,
        "fastestActivityIds": [
          "ride01"
        ],
        "trend": {
          "basis": "canonical_avg_speed_kph",
          "count": 3,
          "state": "available",
          "window": {
            "fromInclusive": 1791504000000,
            "toInclusive": 1791676800000
          },
          "slopePerDay": 1
        },
        "years": [
          {
            "year": 2026,
            "memberCount": 3,
            "knownMetricCount": 3,
            "rankEligibleCount": 3,
            "fastestActivityIds": [
              "ride01"
            ],
            "trend": {
              "basis": "canonical_avg_speed_kph",
              "count": 3,
              "state": "available",
              "window": {
                "fromInclusive": 1791504000000,
                "toInclusive": 1791676800000
              },
              "slopePerDay": 1
            }
          }
        ]
      },
      "io": {
        "logicalDocuments": 67,
        "metadataRequests": 6,
        "descriptorComparisons": 3,
        "rawDownloads": 0,
        "writes": 0
      }
    },
    "next": null
  },
  {
    "count": 22,
    "archive": true,
    "first": {
      "mode": "matched_route_group_page",
      "anchorActivityId": "anchor",
      "discipline": "bike",
      "state": "budget_partial",
      "readTime": {
        "seconds": 1791763200,
        "nanoseconds": 0
      },
      "expiresAt": 1791765000000,
      "groupToken": "mrgg1.pDkPUJCFiCIOKazBT_H3sBnwXGamg4RpyuhQGkHCGwwDDCl7jVCF9eQPUwSh5nD3fVuTHieKhQop3tIeeEmwfxwhFWYnU-lW8aONnGyU6XI3IS6KclpxfQbhYaRl_SJWD5Pi6GQZ5mxyjUIJGka2K-Y4rNhV6yKprOwruTYpyZWmgmSN5v4quismMhjXhhEJQEDxt9kZWK6EkEZeYnhH9L9DXFq-5DeglmCpg19aLnmPY16AvdMWDnH0Q5zroMDUyhzXIFU_rBXHUaoK1P3_8YUKuZOhl0uzYDaci24h5TV7Cu58yZyA1vDownWbkRJeZQLrOzeoeFx5wvwqJQg9vNexpjJXj4OKbc9KqTtqR1aKov6kYJjQvgeQyj89TeV6FypKReE400rtmq_wTs7-eyTj-DbiMAz59aAAly1hbCQBD1pJSzU",
      "nextCursor": "mrgg1.Me89KEFXcKhkWumjRy7v_hzaQ2ZczAB1bG-sMIUpnyO1Wx8n_5nnCDHjf4Vuqb6CiN7mH6Ax7w1mbl5FhjBfoES4rPunB8OZODdkRxs7sleZiMTdjKhciMM07Oy0L08VUtOXuAk9vyDkDgLY_vwONlsg1tWtyPpjzouEmJ_8eEuNr-oFjM0fCzLbOuiArmbRjIeGZVrUF2CDeMqmSbZ3tojiY-4euPPDWngmCYm2tTZ5fulhHD4gL-JEjpWdRXXIYHi_wIT9RdLnH_KotB4ZhVVtdXd4SY4lJ7DxEwg02jOWcMiXRfPh4v7M6Xv8gmJVy5U2MMY-wbm2hIq7B64P6bq-sH2sMjZftf7COd5T7oSEPmJ0VqV0SIFtb6MCippmoxolVVriy7hBVbOVoRwELktScAoyfekBPd-GfkbrRs_42q_Qcv9lGlCM0876QWLVZjXnFKzqq5THjPFv9oW5lA38zV9btYolvhS_Nkl7J1s8-fBznHPQyj-ajFf6ElENNqMzoB6gopeBcCPM1DWUs6x1klEaeZONGkkqxs9H9axFOyI83kCZka5DTQRM5Erh32n9dczrO9UzVtEo9KOfpZFBONghg_ijkEJyUznzc8ofAJY6TMLJPjVQVB0xA8a5ExbFVslPywghUgP02iCSbBzypRnTWxV_rxJ_ZYqdtNHgv1riA00dZqFYURF46I72y9JrJs7PxoRQgAGrrxQg2_Klxfxb3G9CmOVpEh8jSf3vIKEHqW3YwzCO3hWrgVh0DW5qrDaFalJkUA0esJ6Jpj11Qs6rswg1Qexe8hz66hAGHkJzDg-ni6FGRiYBujETu0MN7sRBYYmRWC1d4aXp8RQVB_cwfu4jT1g7UifdVAkmS2mgb0ZZPIbkuZaZXQ5bppX0_09n_qOGnPTN1_6rld8o4IXOXs6-e3BzNXKkxpe1SvCdr86Tkpn9OR1IgwwepVnwXRm8O4SILCFcgXH_CP40TTA9zbL2GxHIVraqN9DuG1JlBU4m7WRQ7GLn9fLB-nNySwzitBucgpqoNAhD1izVz53AOxZOVE5WH81ftMENsI_7UrJn",
      "scope": {
        "kind": "bounded_owner_stored_index_cohort",
        "indexQueryPolicy": "document_id_first20_v1",
        "groupPolicy": "observed-complete-link-v1",
        "descriptorLimit": 20,
        "validatedLimit": 6
      },
      "coverage": {
        "indexCohort": "descriptor_capped",
        "sourceValidation": "validation_capped",
        "wholeHistory": "unknown",
        "geometry": "observed_complete_gap_free",
        "gpsAccuracy": "unknown",
        "deduplication": "unknown"
      },
      "omittedCounts": {
        "unsupportedDescriptor": 0,
        "partialGeometry": 0,
        "gapGeometry": 0,
        "changedSource": 0,
        "validationCap": 14,
        "nonAnchorCluster": 0
      },
      "members": [
        {
          "activityId": "anchor",
          "startTime": 1789862400000,
          "year": 2026,
          "isAnchor": true,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1789862400000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 20,
            "inputCoverage": "complete",
            "sourceLayer": "raw_parts"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        },
        {
          "activityId": "ride00",
          "startTime": 1789948800000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1789948800000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 21,
            "inputCoverage": "complete",
            "sourceLayer": "raw_parts"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        },
        {
          "activityId": "ride01",
          "startTime": 1790035200000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1790035200000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 22,
            "inputCoverage": "complete",
            "sourceLayer": "raw_parts"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        },
        {
          "activityId": "ride02",
          "startTime": 1790121600000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1790121600000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 23,
            "inputCoverage": "complete",
            "sourceLayer": "raw_parts"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        },
        {
          "activityId": "ride03",
          "startTime": 1790208000000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1790208000000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 24,
            "inputCoverage": "complete",
            "sourceLayer": "raw_parts"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        }
      ],
      "summary": {
        "memberCount": 6,
        "knownMetricCount": 6,
        "rankEligibleCount": 6,
        "fastestActivityIds": [
          "ride04"
        ],
        "trend": {
          "basis": "canonical_avg_speed_kph",
          "count": 6,
          "state": "available",
          "window": {
            "fromInclusive": 1789862400000,
            "toInclusive": 1790294400000
          },
          "slopePerDay": 1
        },
        "years": [
          {
            "year": 2026,
            "memberCount": 6,
            "knownMetricCount": 6,
            "rankEligibleCount": 6,
            "fastestActivityIds": [
              "ride04"
            ],
            "trend": {
              "basis": "canonical_avg_speed_kph",
              "count": 6,
              "state": "available",
              "window": {
                "fromInclusive": 1789862400000,
                "toInclusive": 1790294400000
              },
              "slopePerDay": 1
            }
          }
        ]
      },
      "io": {
        "logicalDocuments": 189,
        "metadataRequests": 24,
        "descriptorComparisons": 15,
        "rawDownloads": 0,
        "writes": 0
      }
    },
    "next": {
      "mode": "matched_route_group_page",
      "anchorActivityId": "anchor",
      "discipline": "bike",
      "state": "budget_partial",
      "readTime": {
        "seconds": 1791763200,
        "nanoseconds": 0
      },
      "expiresAt": 1791765000000,
      "groupToken": "mrgg1.pDkPUJCFiCIOKazBT_H3sBnwXGamg4RpyuhQGkHCGwwDDCl7jVCF9eQPUwSh5nD3fVuTHieKhQop3tIeeEmwfxwhFWYnU-lW8aONnGyU6XI3IS6KclpxfQbhYaRl_SJWD5Pi6GQZ5mxyjUIJGka2K-Y4rNhV6yKprOwruTYpyZWmgmSN5v4quismMhjXhhEJQEDxt9kZWK6EkEZeYnhH9L9DXFq-5DeglmCpg19aLnmPY16AvdMWDnH0Q5zroMDUyhzXIFU_rBXHUaoK1P3_8YUKuZOhl0uzYDaci24h5TV7Cu58yZyA1vDownWbkRJeZQLrOzeoeFx5wvwqJQg9vNexpjJXj4OKbc9KqTtqR1aKov6kYJjQvgeQyj89TeV6FypKReE400rtmq_wTs7-eyTj-DbiMAz59aAAly1hbCQBD1pJSzU",
      "nextCursor": null,
      "scope": {
        "kind": "bounded_owner_stored_index_cohort",
        "indexQueryPolicy": "document_id_first20_v1",
        "groupPolicy": "observed-complete-link-v1",
        "descriptorLimit": 20,
        "validatedLimit": 6
      },
      "coverage": {
        "indexCohort": "descriptor_capped",
        "sourceValidation": "validation_capped",
        "wholeHistory": "unknown",
        "geometry": "observed_complete_gap_free",
        "gpsAccuracy": "unknown",
        "deduplication": "unknown"
      },
      "omittedCounts": {
        "unsupportedDescriptor": 0,
        "partialGeometry": 0,
        "gapGeometry": 0,
        "changedSource": 0,
        "validationCap": 14,
        "nonAnchorCluster": 0
      },
      "members": [
        {
          "activityId": "ride04",
          "startTime": 1790294400000,
          "year": 2026,
          "isAnchor": false,
          "canonicalAverage": {
            "state": "available",
            "reason": null,
            "metricsRevision": "c37d55bce8d5f8938077a753d11eda0848b8af33a1f520780e816deddf3e2bcc",
            "version": 41,
            "discipline": "bike",
            "startTime": 1790294400000,
            "computedAt": 1791763199000,
            "avgSpeedKph": 25,
            "inputCoverage": "complete",
            "sourceLayer": "raw_parts"
          },
          "rankingEligible": true,
          "rankingExclusionReason": null
        }
      ],
      "summary": {
        "memberCount": 6,
        "knownMetricCount": 6,
        "rankEligibleCount": 6,
        "fastestActivityIds": [
          "ride04"
        ],
        "trend": {
          "basis": "canonical_avg_speed_kph",
          "count": 6,
          "state": "available",
          "window": {
            "fromInclusive": 1789862400000,
            "toInclusive": 1790294400000
          },
          "slopePerDay": 1
        },
        "years": [
          {
            "year": 2026,
            "memberCount": 6,
            "knownMetricCount": 6,
            "rankEligibleCount": 6,
            "fastestActivityIds": [
              "ride04"
            ],
            "trend": {
              "basis": "canonical_avg_speed_kph",
              "count": 6,
              "state": "available",
              "window": {
                "fromInclusive": 1789862400000,
                "toInclusive": 1790294400000
              },
              "slopePerDay": 1
            }
          }
        ]
      },
      "io": {
        "logicalDocuments": 189,
        "metadataRequests": 24,
        "descriptorComparisons": 15,
        "rawDownloads": 0,
        "writes": 0
      }
    }
  }
] as unknown as Array<{ count: number; archive: boolean; first: ActivityMatchedRouteGroupResponse; next: ActivityMatchedRouteGroupResponse | null }>;
const request: ActivityMatchedRouteGroupRequest = { mode: "matched_route_group_page", anchorActivityId: "anchor", discipline: "bike" };
const clock = compiled[0]!.first.readTime.seconds * 1000 + 1000;
const clone = <T,>(value: T): T => structuredClone(value);
beforeEach(() => { mocks.available = true; mocks.call.mockReset(); });
describe("compiled matched route wire", () => {
  it.each(compiled)("accepts compiled $count cohort / archive $archive without rewriting values", fixture => {
    const response = validateActivityMatchedRouteGroupResponse(fixture.first, request, clock);
    expect(response).toBe(fixture.first); validateMatchedRouteGroupAppend([], response);
    if (fixture.next) {
      const nextRequest = { ...request, cursor: response.nextCursor! };
      expect(validateActivityMatchedRouteGroupResponse(fixture.next, nextRequest, clock)).toBe(fixture.next);
      validateMatchedRouteGroupAppend([response], fixture.next);
      expect(response.summary?.memberCount).toBe(6); expect(response.members).toHaveLength(5); expect(fixture.next.members).toHaveLength(1);
      expect(response.state).toBe("budget_partial");
    }
  });
  it.each(["identity", "sparse", "revision", "coverageCoercion", "layerCoercion", "future", "expiry", "rank", "count", "extra"])("rejects %s contradictions", kind => {
    const wire = clone(compiled[0]!.first), member = wire.members[0]!, average = member.canonicalAverage;
    if (kind === "identity") wire.anchorActivityId = "other";
    if (kind === "sparse") delete wire.members[0];
    if (kind === "revision") average.metricsRevision = "1700000000:0";
    if (kind === "coverageCoercion" && average.state === "available") Object.assign(average, { inputCoverage: ["complete"] });
    if (kind === "layerCoercion" && average.state === "available") Object.assign(average, { sourceLayer: { toString: () => "raw_parts" } });
    if (kind === "future") wire.readTime.seconds += 10000;
    if (kind === "expiry") wire.expiresAt++;
    if (kind === "rank") member.rankingEligible = false;
    if (kind === "count") wire.summary!.knownMetricCount = 7;
    if (kind === "extra") Object.assign(wire, { coordinates: [] });
    expect(() => validateActivityMatchedRouteGroupResponse(wire, request, clock)).toThrow("invalid_matched_route_group_response");
  });
  it("requires dense summary arrays and exact unavailable reason strings", () => {
    const wire = clone(compiled[0]!.first); delete wire.summary!.years[0];
    expect(() => validateActivityMatchedRouteGroupResponse(wire, request, clock)).toThrow();
    const missing = clone(compiled[0]!.first); Object.assign(missing.members[0]!, { canonicalAverage: { state: "unavailable", reason: ["missing_metrics"], metricsRevision: null } });
    expect(() => validateActivityMatchedRouteGroupResponse(missing, request, clock)).toThrow();
  });
  it("rejects changed group identity, duplicate/backward members and mismatched final summaries", () => {
    const first = compiled[1]!.first, next = compiled[1]!.next!;
    for (const mutate of [(r: ActivityMatchedRouteGroupResponse) => { r.groupToken += "x"; }, (r: ActivityMatchedRouteGroupResponse) => { r.members[0] = clone(first.members[0]!); }, (r: ActivityMatchedRouteGroupResponse) => { r.summary!.knownMetricCount--; }]) {
      const bad = clone(next); mutate(bad); expect(() => validateMatchedRouteGroupAppend([first], bad)).toThrow("matched_route_group_continuity");
    }
    expect(() => validateMatchedRouteGroupAppend([first, next], next)).toThrow();
  });
  it("rejects partial-page counts that are already contradicted by the received members", () => {
    const bad = clone(compiled[1]!.first); bad.summary!.knownMetricCount = 0;
    expect(() => validateMatchedRouteGroupAppend([], bad)).toThrow("matched_route_group_continuity");
    const wrongYear = clone(compiled[1]!.first); wrongYear.members[0]!.year = 2000;
    expect(() => validateMatchedRouteGroupAppend([], wrongYear)).toThrow("matched_route_group_continuity");
  });
  it("preserves full precision TTL and serialized floor-millis expiry", () => {
    for (const nanos of [1000, 999999000]) {
      const wire = clone(compiled[0]!.first); wire.readTime.nanoseconds = nanos; wire.expiresAt = wire.readTime.seconds * 1000 + Math.floor(nanos / 1e6) + 1800000;
      expect(validateActivityMatchedRouteGroupResponse(wire, request, clock + 1000)).toBe(wire);
      wire.expiresAt++; expect(() => validateActivityMatchedRouteGroupResponse(wire, request, clock + 1000)).toThrow();
    }
    const wire = clone(compiled[0]!.first); expect(() => validateActivityMatchedRouteGroupResponse(wire, request, wire.expiresAt)).toThrow("matched_route_group_expired");
  });
  it("preserves literal zero/null and pending while requiring ranking exclusions", () => {
    for (const speed of [0, null]) {
      const wire = clone(compiled[0]!.first), row = wire.members[0]!;
      if (row.canonicalAverage.state === "available") row.canonicalAverage.avgSpeedKph = speed;
      row.rankingEligible = false; row.rankingExclusionReason = "null_or_zero_speed";
      expect(validateActivityMatchedRouteGroupResponse(wire, request, clock).members[0]!.canonicalAverage).toEqual(row.canonicalAverage);
    }
  });
});
describe("authenticated single manual callable", () => {
  function services() { const app = {}; return { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices; }
  it("uses only explicit mode and returned opaque cursor, without stream or raw reads", async () => {
    vi.spyOn(Date, "now").mockReturnValue(clock); const sdk = services(); mocks.call.mockResolvedValue({ data: compiled[0]!.first });
    await loadActivityMatchedRouteGroups(sdk, "owner", request); expect(mocks.call).toHaveBeenCalledExactlyOnceWith(request); expect(sdk.ensureAppCheckReady).toHaveBeenCalledOnce(); vi.restoreAllMocks();
  });
  it("refuses foreign/anonymous account and account changes after AppCheck", async () => {
    const sdk = services(); await expect(loadActivityMatchedRouteGroups(sdk, "other", request)).rejects.toThrow("account_changed");
    (sdk.ensureAppCheckReady as ReturnType<typeof vi.fn>).mockImplementation(async () => { Object.assign(sdk.auth.currentUser!, { uid: "other" }); });
    await expect(loadActivityMatchedRouteGroups(sdk, "owner", request)).rejects.toThrow("account_changed"); expect(mocks.call).not.toHaveBeenCalled();
  });
});

it('binds observed-native policy to coverage and rejects rankings or default-policy substitution', () => {
  const wire = clone(compiled[0]!.first);
  wire.scope.groupPolicy = 'observed-native-complete-link-v1';
  wire.coverage.geometry = 'observed_gap_free_coverage_unproven';
  for (const row of wire.members) { row.rankingEligible = false; row.rankingExclusionReason = 'observed_geometry_only'; }
  for (const stats of [wire.summary!, ...wire.summary!.years]) {
    stats.rankEligibleCount = 0; stats.fastestActivityIds = [];
    stats.trend = { state: 'insufficient', basis: 'canonical_avg_speed_kph', count: 0, reason: 'insufficient_distinct_dates' };
  }
  const observed = { ...request, geometryPolicy: 'observed_native' as const };
  expect(validateActivityMatchedRouteGroupResponse(wire, observed, clock)).toBe(wire);
  expect(() => validateActivityMatchedRouteGroupResponse(wire, request, clock)).toThrow();
  wire.members[0]!.rankingEligible = true;
  expect(() => validateActivityMatchedRouteGroupResponse(wire, observed, clock)).toThrow();
});

 it.each(["appcheck", "response"])("rejects same-UID SDK replacement at %s", async phase => {
  const app = {}, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
  const ensure = vi.fn().mockResolvedValue(undefined);
  const sdk = { auth, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: ensure } as unknown as FirebaseServices;
  if (phase === "appcheck") ensure.mockImplementation(async () => { auth.currentUser = { ...auth.currentUser }; });
  else mocks.call.mockImplementation(async () => { auth.currentUser = { ...auth.currentUser }; return { data: {} }; });
  await expect(loadActivityMatchedRouteGroups(sdk, "owner", request)).rejects.toThrow("account_changed");
  expect(mocks.call).toHaveBeenCalledTimes(phase === "appcheck" ? 0 : 1);
 });
