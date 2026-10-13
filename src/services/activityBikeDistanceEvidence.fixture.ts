import type { ActivityBikeDistanceEvidenceResponse } from "@shared/activity-bike-distance-evidence";
export const manualBikeDistanceEpoch = Date.parse("2026-10-01T00:00:00+09:00");
export function manualBikeDistanceFixture(): ActivityBikeDistanceEvidenceResponse {
  return { mode: "bike_distance_evidence", activityId: "ride", distanceInputRevision: "a".repeat(64), state: "available", reason: null, sourceLayer: "raw_parts", evidence: { activityId: "ride", distanceInputRevision: "a".repeat(64), sourceLayer: "raw_parts", sourceSchemaVersion: "native-distance-v1", provenanceVersion: 2, sourceBasis: "stored_distance_parts", sourceTimingBasis: "stored_explicit_activity_elapsed", originalClockVerified: false, declaredActivitySource: "orider", originEpochMs: manualBikeDistanceEpoch, durationSec: 1300, coverage: "unknown", quality: "unknown", scope: "single_observed_activity", targetsVersion: 1, inputPointCount: 2, observedStartOffsetSec: 30, observedEndOffsetSec: 1230, facts: [{ distance: "10km", distanceM: 10000, elapsedSec: 1000, exactElapsedSec: 1000, startIndex: 0, endBeforeIndex: 0, endIndex: 1, endFraction: 10000 / 12000, startTimeSec: 30, endTimeSec: 1030, startOffsetSec: 30, endOffsetSec: 1030 }] } };
}

/** 기존 Stage wire: 出처가 확인되었다고 정규화하지 않는다. */
export function legacyManualBikeDistanceFixture() {
  const response = manualBikeDistanceFixture();
  if (response.state !== "available") throw new Error("fixture");
  const { provenanceVersion: _version, sourceBasis: _basis, originalClockVerified: _clock, declaredActivitySource: _source, ...evidence } = response.evidence;
  void _version; void _basis; void _clock; void _source;
  return { ...response, evidence: { ...evidence, sourceTimingBasis: "original_activity_elapsed" } };
}

// Actual compiled synthetic wire, SHA256 517491dc61a3a4c49d5f7e72ffe00df2c29da1084d2ea34b88626014fd83ee6e. No owner data.
// BEGIN_COMPILED_BIKE_PROVENANCE_WIRE
export const compiledBikeProvenanceWire = {
  "producer": {
    "legacy": {
      "targetsVersion": 1,
      "timingBasis": "original_activity_elapsed",
      "scope": "observed_measured_axis",
      "sourceBasis": "native_distance_parts",
      "quality": "unknown",
      "coverage": "unknown",
      "records": {
        "5miles": 805,
        "10km": 1000
      }
    },
    "modernBySource": {
      "orider": {
        "targetsVersion": 1,
        "provenanceVersion": 2,
        "timingBasis": "stored_explicit_activity_elapsed",
        "originalClockVerified": false,
        "declaredActivitySource": "orider",
        "scope": "observed_measured_axis",
        "sourceBasis": "stored_distance_parts",
        "quality": "unknown",
        "coverage": "unknown",
        "records": {
          "5miles": 805,
          "10km": 1000
        }
      },
      "strava": {
        "targetsVersion": 1,
        "provenanceVersion": 2,
        "timingBasis": "stored_explicit_activity_elapsed",
        "originalClockVerified": false,
        "declaredActivitySource": "strava",
        "scope": "observed_measured_axis",
        "sourceBasis": "stored_distance_parts",
        "quality": "unknown",
        "coverage": "unknown",
        "records": {
          "5miles": 805,
          "10km": 1000
        }
      },
      "apple_health": {
        "targetsVersion": 1,
        "provenanceVersion": 2,
        "timingBasis": "stored_explicit_activity_elapsed",
        "originalClockVerified": false,
        "declaredActivitySource": "apple_health",
        "scope": "observed_measured_axis",
        "sourceBasis": "stored_distance_parts",
        "quality": "unknown",
        "coverage": "unknown",
        "records": {
          "5miles": 805,
          "10km": 1000
        }
      },
      "health_connect": {
        "targetsVersion": 1,
        "provenanceVersion": 2,
        "timingBasis": "stored_explicit_activity_elapsed",
        "originalClockVerified": false,
        "declaredActivitySource": "health_connect",
        "scope": "observed_measured_axis",
        "sourceBasis": "stored_distance_parts",
        "quality": "unknown",
        "coverage": "unknown",
        "records": {
          "5miles": 805,
          "10km": 1000
        }
      }
    }
  },
  "period": {
    "legacyWire": {
      "result": {
        "version": 1,
        "discipline": "bike",
        "asOf": 1790002000000,
        "inputDigest": "25868f8d2c4b6cee59a370c74d578d70e89ef2f5b870fcc1f16c77acd47229ab",
        "periods": [
          {
            "fromInclusive": 1790000000000,
            "toExclusive": 1790001500000,
            "status": "partial",
            "coverage": {
              "scannedActivityCount": 1,
              "candidateActivityCount": 1,
              "representativeActivityCount": 1,
              "deduplicatedActivityCount": 0,
              "includedActivityCount": 1,
              "pendingActivityCount": 0,
              "missingActivityCount": 0,
              "incompleteActivityCount": 0,
              "skippedActivityCount": 0,
              "candidateCountKnown": true,
              "truncated": false,
              "scanLimit": 200,
              "deduplicationBasis": "explicit_identity_within_period"
            },
            "totals": {
              "distanceM": {
                "observedValue": 10000,
                "totalValue": 10000,
                "knownActivityCount": 1,
                "missingActivityCount": 0,
                "summaryFallbackCount": 0,
                "sourceBasis": "canonical_metrics",
                "sourceActivityIds": [
                  "ride"
                ]
              },
              "movingTimeSec": {
                "observedValue": 1000,
                "totalValue": 1000,
                "knownActivityCount": 1,
                "missingActivityCount": 0,
                "summaryFallbackCount": 0,
                "sourceBasis": "canonical_metrics",
                "sourceActivityIds": [
                  "ride"
                ]
              },
              "elevationGainM": {
                "observedValue": null,
                "totalValue": null,
                "knownActivityCount": 0,
                "missingActivityCount": 1,
                "summaryFallbackCount": 0,
                "sourceBasis": "unavailable",
                "sourceActivityIds": []
              }
            },
            "activities": [
              {
                "activityId": "ride",
                "startTime": 1790000002000,
                "distanceM": 10000,
                "movingTimeSec": 1000,
                "elevationGainM": null,
                "sourceBasis": {
                  "distanceM": "canonical_metrics",
                  "movingTimeSec": "canonical_metrics",
                  "elevationGainM": "unavailable"
                }
              }
            ],
            "running": null,
            "cyclingDistanceObservations": {
              "version": 1,
              "targetsVersion": 1,
              "timingBasis": "original_activity_elapsed",
              "scope": "observed_representatives",
              "quality": "unknown",
              "coverage": "unknown",
              "distances": [
                {
                  "distance": "5miles",
                  "distanceM": 8046.72,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 1,
                  "noObservedEffortActivityCount": 0,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": 805,
                  "medianTimeSeconds": 805,
                  "sources": [
                    {
                      "sourceActivityId": "ride",
                      "startTime": 1790000002000,
                      "metricsRevision": "100:1",
                      "contributingActivityCount": 1,
                      "elapsedSec": 805
                    }
                  ]
                },
                {
                  "distance": "10km",
                  "distanceM": 10000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 1,
                  "noObservedEffortActivityCount": 0,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": 1000,
                  "medianTimeSeconds": 1000,
                  "sources": [
                    {
                      "sourceActivityId": "ride",
                      "startTime": 1790000002000,
                      "metricsRevision": "100:1",
                      "contributingActivityCount": 1,
                      "elapsedSec": 1000
                    }
                  ]
                },
                {
                  "distance": "10miles",
                  "distanceM": 16093.44,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "20km",
                  "distanceM": 20000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "30km",
                  "distanceM": 30000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "40km",
                  "distanceM": 40000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "50km",
                  "distanceM": 50000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "80km",
                  "distanceM": 80000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "50miles",
                  "distanceM": 80467.2,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "90km",
                  "distanceM": 90000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "100km",
                  "distanceM": 100000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "100miles",
                  "distanceM": 160934.4,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "180km",
                  "distanceM": 180000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                }
              ]
            },
            "zones": {
              "heartRate": {
                "candidateActivityCount": 1,
                "eligibleActivityCount": 0,
                "missingSensorActivityCount": 1,
                "contextUnknownActivityCount": 0,
                "observedSeconds": 0,
                "groups": []
              },
              "power": {
                "candidateActivityCount": 1,
                "eligibleActivityCount": 0,
                "missingSensorActivityCount": 1,
                "contextUnknownActivityCount": 0,
                "observedSeconds": 0,
                "groups": [],
                "reason": "recorded_ftp"
              },
              "pace": {
                "status": "unavailable",
                "reason": "canonical_pace_zones_unavailable"
              }
            }
          }
        ]
      },
      "io": {
        "metricsReads": 1,
        "finalReads": 4,
        "metricMasks": [
          [
            "userId",
            "version",
            "startTime",
            "discipline",
            "inputPending",
            "inputCoverage",
            "distanceKm",
            "distanceSource",
            "durationSec",
            "movingTimeSec",
            "movingTimeQuality",
            "elevationGainM",
            "elevationQuality",
            "hrZoneSec",
            "hrZoneBoundaries",
            "powerZoneSec",
            "contextSnapshot",
            "isVirtualPower",
            "analysisSummary.sensors",
            "tss",
            "runMetrics.distanceRecords",
            "runMetrics.paceCurve",
            "speedCurve",
            "metrics.version",
            "metrics.startTime",
            "metrics.discipline",
            "metrics.inputPending",
            "metrics.inputCoverage",
            "metrics.distanceKm",
            "metrics.distanceSource",
            "metrics.durationSec",
            "metrics.movingTimeSec",
            "metrics.movingTimeQuality",
            "metrics.elevationGainM",
            "metrics.elevationQuality",
            "metrics.hrZoneSec",
            "metrics.hrZoneBoundaries",
            "metrics.powerZoneSec",
            "metrics.contextSnapshot",
            "metrics.isVirtualPower",
            "metrics.analysisSummary.sensors",
            "metrics.tss",
            "metrics.runMetrics.distanceRecords",
            "metrics.runMetrics.paceCurve",
            "metrics.speedCurve",
            "status",
            "schemaVersion",
            "stale",
            "activeAttempt",
            "metrics.stale",
            "cyclingDistanceObservations",
            "metrics.cyclingDistanceObservations",
            "sourceLayer",
            "metrics.sourceLayer",
            "metrics.userId"
          ]
        ],
        "activityMasks": [
          [
            "userId",
            "type",
            "startTime",
            "deletedAt",
            "source",
            "localSessionId",
            "stravaActivityId",
            "stravaTwinActivityId",
            "summary.distance",
            "summary.movingTimeSec",
            "summary.movingTimeMillis",
            "summary.elapsedTimeMillis",
            "summary.elevationGain",
            "endTime"
          ]
        ]
      }
    },
    "normalizedLegacyWire": {
      "result": {
        "version": 1,
        "discipline": "bike",
        "asOf": 1790002000000,
        "inputDigest": "25868f8d2c4b6cee59a370c74d578d70e89ef2f5b870fcc1f16c77acd47229ab",
        "periods": [
          {
            "fromInclusive": 1790000000000,
            "toExclusive": 1790001500000,
            "status": "partial",
            "coverage": {
              "scannedActivityCount": 1,
              "candidateActivityCount": 1,
              "representativeActivityCount": 1,
              "deduplicatedActivityCount": 0,
              "includedActivityCount": 1,
              "pendingActivityCount": 0,
              "missingActivityCount": 0,
              "incompleteActivityCount": 0,
              "skippedActivityCount": 0,
              "candidateCountKnown": true,
              "truncated": false,
              "scanLimit": 200,
              "deduplicationBasis": "explicit_identity_within_period"
            },
            "totals": {
              "distanceM": {
                "observedValue": 10000,
                "totalValue": 10000,
                "knownActivityCount": 1,
                "missingActivityCount": 0,
                "summaryFallbackCount": 0,
                "sourceBasis": "canonical_metrics",
                "sourceActivityIds": [
                  "ride"
                ]
              },
              "movingTimeSec": {
                "observedValue": 1000,
                "totalValue": 1000,
                "knownActivityCount": 1,
                "missingActivityCount": 0,
                "summaryFallbackCount": 0,
                "sourceBasis": "canonical_metrics",
                "sourceActivityIds": [
                  "ride"
                ]
              },
              "elevationGainM": {
                "observedValue": null,
                "totalValue": null,
                "knownActivityCount": 0,
                "missingActivityCount": 1,
                "summaryFallbackCount": 0,
                "sourceBasis": "unavailable",
                "sourceActivityIds": []
              }
            },
            "activities": [
              {
                "activityId": "ride",
                "startTime": 1790000002000,
                "distanceM": 10000,
                "movingTimeSec": 1000,
                "elevationGainM": null,
                "sourceBasis": {
                  "distanceM": "canonical_metrics",
                  "movingTimeSec": "canonical_metrics",
                  "elevationGainM": "unavailable"
                }
              }
            ],
            "running": null,
            "cyclingDistanceObservations": {
              "version": 1,
              "targetsVersion": 1,
              "provenanceVersion": 2,
              "sourceBasis": "stored_distance_parts",
              "originalClockVerified": false,
              "timingBasis": "stored_explicit_activity_elapsed",
              "scope": "observed_representatives",
              "quality": "unknown",
              "coverage": "unknown",
              "distances": [
                {
                  "distance": "5miles",
                  "distanceM": 8046.72,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 1,
                  "noObservedEffortActivityCount": 0,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": 805,
                  "medianTimeSeconds": 805,
                  "sources": [
                    {
                      "sourceActivityId": "ride",
                      "startTime": 1790000002000,
                      "metricsRevision": "100:1",
                      "contributingActivityCount": 1,
                      "elapsedSec": 805,
                      "provenance": {
                        "provenanceVersion": 2,
                        "sourceBasis": "stored_distance_parts",
                        "timingBasis": "stored_explicit_activity_elapsed",
                        "originalClockVerified": false,
                        "declaredActivitySource": null,
                        "status": "legacy_normalized"
                      }
                    }
                  ]
                },
                {
                  "distance": "10km",
                  "distanceM": 10000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 1,
                  "noObservedEffortActivityCount": 0,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": 1000,
                  "medianTimeSeconds": 1000,
                  "sources": [
                    {
                      "sourceActivityId": "ride",
                      "startTime": 1790000002000,
                      "metricsRevision": "100:1",
                      "contributingActivityCount": 1,
                      "elapsedSec": 1000,
                      "provenance": {
                        "provenanceVersion": 2,
                        "sourceBasis": "stored_distance_parts",
                        "timingBasis": "stored_explicit_activity_elapsed",
                        "originalClockVerified": false,
                        "declaredActivitySource": null,
                        "status": "legacy_normalized"
                      }
                    }
                  ]
                },
                {
                  "distance": "10miles",
                  "distanceM": 16093.44,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "20km",
                  "distanceM": 20000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "30km",
                  "distanceM": 30000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "40km",
                  "distanceM": 40000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "50km",
                  "distanceM": 50000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "80km",
                  "distanceM": 80000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "50miles",
                  "distanceM": 80467.2,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "90km",
                  "distanceM": 90000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "100km",
                  "distanceM": 100000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "100miles",
                  "distanceM": 160934.4,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "180km",
                  "distanceM": 180000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                }
              ]
            },
            "zones": {
              "heartRate": {
                "candidateActivityCount": 1,
                "eligibleActivityCount": 0,
                "missingSensorActivityCount": 1,
                "contextUnknownActivityCount": 0,
                "observedSeconds": 0,
                "groups": []
              },
              "power": {
                "candidateActivityCount": 1,
                "eligibleActivityCount": 0,
                "missingSensorActivityCount": 1,
                "contextUnknownActivityCount": 0,
                "observedSeconds": 0,
                "groups": [],
                "reason": "recorded_ftp"
              },
              "pace": {
                "status": "unavailable",
                "reason": "canonical_pace_zones_unavailable"
              }
            }
          }
        ]
      },
      "io": {
        "metricsReads": 1,
        "finalReads": 4,
        "metricMasks": [
          [
            "userId",
            "version",
            "startTime",
            "discipline",
            "inputPending",
            "inputCoverage",
            "distanceKm",
            "distanceSource",
            "durationSec",
            "movingTimeSec",
            "movingTimeQuality",
            "elevationGainM",
            "elevationQuality",
            "hrZoneSec",
            "hrZoneBoundaries",
            "powerZoneSec",
            "contextSnapshot",
            "isVirtualPower",
            "analysisSummary.sensors",
            "tss",
            "runMetrics.distanceRecords",
            "runMetrics.paceCurve",
            "speedCurve",
            "metrics.version",
            "metrics.startTime",
            "metrics.discipline",
            "metrics.inputPending",
            "metrics.inputCoverage",
            "metrics.distanceKm",
            "metrics.distanceSource",
            "metrics.durationSec",
            "metrics.movingTimeSec",
            "metrics.movingTimeQuality",
            "metrics.elevationGainM",
            "metrics.elevationQuality",
            "metrics.hrZoneSec",
            "metrics.hrZoneBoundaries",
            "metrics.powerZoneSec",
            "metrics.contextSnapshot",
            "metrics.isVirtualPower",
            "metrics.analysisSummary.sensors",
            "metrics.tss",
            "metrics.runMetrics.distanceRecords",
            "metrics.runMetrics.paceCurve",
            "metrics.speedCurve",
            "status",
            "schemaVersion",
            "stale",
            "activeAttempt",
            "metrics.stale",
            "cyclingDistanceObservations",
            "metrics.cyclingDistanceObservations",
            "sourceLayer",
            "metrics.sourceLayer",
            "metrics.userId"
          ]
        ],
        "activityMasks": [
          [
            "userId",
            "type",
            "startTime",
            "deletedAt",
            "source",
            "localSessionId",
            "stravaActivityId",
            "stravaTwinActivityId",
            "summary.distance",
            "summary.movingTimeSec",
            "summary.movingTimeMillis",
            "summary.elapsedTimeMillis",
            "summary.elevationGain",
            "endTime"
          ]
        ]
      }
    },
    "modernWire": {
      "result": {
        "version": 1,
        "discipline": "bike",
        "asOf": 1790002000000,
        "inputDigest": "25868f8d2c4b6cee59a370c74d578d70e89ef2f5b870fcc1f16c77acd47229ab",
        "periods": [
          {
            "fromInclusive": 1790000000000,
            "toExclusive": 1790001500000,
            "status": "partial",
            "coverage": {
              "scannedActivityCount": 1,
              "candidateActivityCount": 1,
              "representativeActivityCount": 1,
              "deduplicatedActivityCount": 0,
              "includedActivityCount": 1,
              "pendingActivityCount": 0,
              "missingActivityCount": 0,
              "incompleteActivityCount": 0,
              "skippedActivityCount": 0,
              "candidateCountKnown": true,
              "truncated": false,
              "scanLimit": 200,
              "deduplicationBasis": "explicit_identity_within_period"
            },
            "totals": {
              "distanceM": {
                "observedValue": 10000,
                "totalValue": 10000,
                "knownActivityCount": 1,
                "missingActivityCount": 0,
                "summaryFallbackCount": 0,
                "sourceBasis": "canonical_metrics",
                "sourceActivityIds": [
                  "ride"
                ]
              },
              "movingTimeSec": {
                "observedValue": 1000,
                "totalValue": 1000,
                "knownActivityCount": 1,
                "missingActivityCount": 0,
                "summaryFallbackCount": 0,
                "sourceBasis": "canonical_metrics",
                "sourceActivityIds": [
                  "ride"
                ]
              },
              "elevationGainM": {
                "observedValue": null,
                "totalValue": null,
                "knownActivityCount": 0,
                "missingActivityCount": 1,
                "summaryFallbackCount": 0,
                "sourceBasis": "unavailable",
                "sourceActivityIds": []
              }
            },
            "activities": [
              {
                "activityId": "ride",
                "startTime": 1790000002000,
                "distanceM": 10000,
                "movingTimeSec": 1000,
                "elevationGainM": null,
                "sourceBasis": {
                  "distanceM": "canonical_metrics",
                  "movingTimeSec": "canonical_metrics",
                  "elevationGainM": "unavailable"
                }
              }
            ],
            "running": null,
            "cyclingDistanceObservations": {
              "version": 1,
              "targetsVersion": 1,
              "provenanceVersion": 2,
              "sourceBasis": "stored_distance_parts",
              "originalClockVerified": false,
              "timingBasis": "stored_explicit_activity_elapsed",
              "scope": "observed_representatives",
              "quality": "unknown",
              "coverage": "unknown",
              "distances": [
                {
                  "distance": "5miles",
                  "distanceM": 8046.72,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 1,
                  "noObservedEffortActivityCount": 0,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": 805,
                  "medianTimeSeconds": 805,
                  "sources": [
                    {
                      "sourceActivityId": "ride",
                      "startTime": 1790000002000,
                      "metricsRevision": "100:1",
                      "contributingActivityCount": 1,
                      "elapsedSec": 805,
                      "provenance": {
                        "provenanceVersion": 2,
                        "sourceBasis": "stored_distance_parts",
                        "timingBasis": "stored_explicit_activity_elapsed",
                        "originalClockVerified": false,
                        "declaredActivitySource": "strava",
                        "status": "stored_explicit"
                      }
                    }
                  ]
                },
                {
                  "distance": "10km",
                  "distanceM": 10000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 1,
                  "noObservedEffortActivityCount": 0,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": 1000,
                  "medianTimeSeconds": 1000,
                  "sources": [
                    {
                      "sourceActivityId": "ride",
                      "startTime": 1790000002000,
                      "metricsRevision": "100:1",
                      "contributingActivityCount": 1,
                      "elapsedSec": 1000,
                      "provenance": {
                        "provenanceVersion": 2,
                        "sourceBasis": "stored_distance_parts",
                        "timingBasis": "stored_explicit_activity_elapsed",
                        "originalClockVerified": false,
                        "declaredActivitySource": "strava",
                        "status": "stored_explicit"
                      }
                    }
                  ]
                },
                {
                  "distance": "10miles",
                  "distanceM": 16093.44,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "20km",
                  "distanceM": 20000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "30km",
                  "distanceM": 30000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "40km",
                  "distanceM": 40000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "50km",
                  "distanceM": 50000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "80km",
                  "distanceM": 80000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "50miles",
                  "distanceM": 80467.2,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "90km",
                  "distanceM": 90000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "100km",
                  "distanceM": 100000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "100miles",
                  "distanceM": 160934.4,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                },
                {
                  "distance": "180km",
                  "distanceM": 180000,
                  "candidateActivityCount": 1,
                  "supportedActivityCount": 1,
                  "observedEffortActivityCount": 0,
                  "noObservedEffortActivityCount": 1,
                  "unsupportedActivityCount": 0,
                  "unavailableActivityCount": 0,
                  "truncated": false,
                  "bestTimeSeconds": null,
                  "medianTimeSeconds": null,
                  "sources": []
                }
              ]
            },
            "zones": {
              "heartRate": {
                "candidateActivityCount": 1,
                "eligibleActivityCount": 0,
                "missingSensorActivityCount": 1,
                "contextUnknownActivityCount": 0,
                "observedSeconds": 0,
                "groups": []
              },
              "power": {
                "candidateActivityCount": 1,
                "eligibleActivityCount": 0,
                "missingSensorActivityCount": 1,
                "contextUnknownActivityCount": 0,
                "observedSeconds": 0,
                "groups": [],
                "reason": "recorded_ftp"
              },
              "pace": {
                "status": "unavailable",
                "reason": "canonical_pace_zones_unavailable"
              }
            }
          }
        ]
      },
      "io": {
        "metricsReads": 1,
        "finalReads": 4,
        "metricMasks": [
          [
            "userId",
            "version",
            "startTime",
            "discipline",
            "inputPending",
            "inputCoverage",
            "distanceKm",
            "distanceSource",
            "durationSec",
            "movingTimeSec",
            "movingTimeQuality",
            "elevationGainM",
            "elevationQuality",
            "hrZoneSec",
            "hrZoneBoundaries",
            "powerZoneSec",
            "contextSnapshot",
            "isVirtualPower",
            "analysisSummary.sensors",
            "tss",
            "runMetrics.distanceRecords",
            "runMetrics.paceCurve",
            "speedCurve",
            "metrics.version",
            "metrics.startTime",
            "metrics.discipline",
            "metrics.inputPending",
            "metrics.inputCoverage",
            "metrics.distanceKm",
            "metrics.distanceSource",
            "metrics.durationSec",
            "metrics.movingTimeSec",
            "metrics.movingTimeQuality",
            "metrics.elevationGainM",
            "metrics.elevationQuality",
            "metrics.hrZoneSec",
            "metrics.hrZoneBoundaries",
            "metrics.powerZoneSec",
            "metrics.contextSnapshot",
            "metrics.isVirtualPower",
            "metrics.analysisSummary.sensors",
            "metrics.tss",
            "metrics.runMetrics.distanceRecords",
            "metrics.runMetrics.paceCurve",
            "metrics.speedCurve",
            "status",
            "schemaVersion",
            "stale",
            "activeAttempt",
            "metrics.stale",
            "cyclingDistanceObservations",
            "metrics.cyclingDistanceObservations",
            "sourceLayer",
            "metrics.sourceLayer",
            "metrics.userId"
          ]
        ],
        "activityMasks": [
          [
            "userId",
            "type",
            "startTime",
            "deletedAt",
            "source",
            "localSessionId",
            "stravaActivityId",
            "stravaTwinActivityId",
            "summary.distance",
            "summary.movingTimeSec",
            "summary.movingTimeMillis",
            "summary.elapsedTimeMillis",
            "summary.elevationGain",
            "endTime"
          ]
        ]
      }
    }
  },
  "history": {
    "legacyWire": {
      "result": {
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
          "scannedActivityCount": 1,
          "candidateActivityCount": 1,
          "skippedActivityCount": 0,
          "exhausted": true,
          "observationCounts": {
            "observed": 1,
            "noObserved": 0,
            "unsupported": 0,
            "unavailable": 0
          },
          "nextCursor": null
        },
        "activities": [
          {
            "activityTotals": {
              "scope": "observed_activity_totals",
              "distanceM": 10000,
              "elevationGainM": null,
              "sourceBasis": {
                "distanceM": "canonical_metrics",
                "elevationGainM": "unavailable"
              },
              "distanceSource": "stream_counter",
              "sourceLayer": "raw_parts",
              "elevationQuality": "unknown",
              "gpsEligibility": "unknown"
            },
            "activityId": "ride",
            "startTime": 1767193201000,
            "activityRevision": "1:0",
            "metricsRevision": "1:0",
            "representativeInput": {
              "source": "strava",
              "type": "Ride",
              "discipline": "bike",
              "localSessionId": null,
              "stravaActivityId": null,
              "stravaTwinActivityId": null,
              "endTime": 1767194201000,
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
                  "elapsedSec": 805
                },
                {
                  "distance": "10km",
                  "elapsedSec": 1000
                }
              ]
            }
          }
        ]
      },
      "io": {
        "reads": 8,
        "metrics": 1,
        "query": 1,
        "masks": [
          [
            "userId",
            "type",
            "startTime",
            "endTime",
            "deletedAt",
            "source",
            "localSessionId",
            "stravaActivityId",
            "stravaTwinActivityId",
            "summary.movingTimeSec",
            "summary.movingTimeMillis",
            "summary.elapsedTimeMillis",
            "summary.distance",
            "summary.elevationGain"
          ],
          {
            "fieldMask": [
              "userId",
              "metrics.userId",
              "metrics.stale",
              "version",
              "startTime",
              "discipline",
              "inputPending",
              "inputCoverage",
              "distanceKm",
              "distanceSource",
              "durationSec",
              "movingTimeSec",
              "movingTimeQuality",
              "tss",
              "sourceLayer",
              "cyclingDistanceObservations",
              "metrics.version",
              "metrics.startTime",
              "metrics.discipline",
              "metrics.inputPending",
              "metrics.inputCoverage",
              "metrics.distanceKm",
              "metrics.distanceSource",
              "metrics.durationSec",
              "metrics.movingTimeSec",
              "metrics.movingTimeQuality",
              "metrics.tss",
              "metrics.sourceLayer",
              "metrics.cyclingDistanceObservations",
              "status",
              "schemaVersion",
              "stale",
              "activeAttempt",
              "elevationGainM",
              "elevationQuality",
              "metrics.elevationGainM",
              "metrics.elevationQuality"
            ]
          }
        ]
      }
    },
    "normalizedLegacyWire": {
      "result": {
        "version": 1,
        "mode": "cycling_distance_history_page",
        "discipline": "bike",
        "calendarBasis": "Asia/Seoul",
        "rangeBasis": "calendar_year",
        "year": 2026,
        "targetsVersion": 1,
        "provenanceVersion": 2,
        "sourceBasis": "stored_distance_parts",
        "originalClockVerified": false,
        "timingBasis": "stored_explicit_activity_elapsed",
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
          "scannedActivityCount": 1,
          "candidateActivityCount": 1,
          "skippedActivityCount": 0,
          "exhausted": true,
          "observationCounts": {
            "observed": 1,
            "noObserved": 0,
            "unsupported": 0,
            "unavailable": 0
          },
          "nextCursor": null
        },
        "activities": [
          {
            "activityTotals": {
              "scope": "observed_activity_totals",
              "distanceM": 10000,
              "elevationGainM": null,
              "sourceBasis": {
                "distanceM": "canonical_metrics",
                "elevationGainM": "unavailable"
              },
              "distanceSource": "stream_counter",
              "sourceLayer": "raw_parts",
              "elevationQuality": "unknown",
              "gpsEligibility": "unknown"
            },
            "activityId": "ride",
            "startTime": 1767193201000,
            "activityRevision": "1:0",
            "metricsRevision": "1:0",
            "representativeInput": {
              "source": "strava",
              "type": "Ride",
              "discipline": "bike",
              "localSessionId": null,
              "stravaActivityId": null,
              "stravaTwinActivityId": null,
              "endTime": 1767194201000,
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
                  "elapsedSec": 805
                },
                {
                  "distance": "10km",
                  "elapsedSec": 1000
                }
              ],
              "provenance": {
                "provenanceVersion": 2,
                "sourceBasis": "stored_distance_parts",
                "timingBasis": "stored_explicit_activity_elapsed",
                "originalClockVerified": false,
                "declaredActivitySource": null,
                "status": "legacy_normalized"
              }
            }
          }
        ]
      },
      "io": {
        "reads": 8,
        "metrics": 1,
        "query": 1,
        "masks": [
          [
            "userId",
            "type",
            "startTime",
            "endTime",
            "deletedAt",
            "source",
            "localSessionId",
            "stravaActivityId",
            "stravaTwinActivityId",
            "summary.movingTimeSec",
            "summary.movingTimeMillis",
            "summary.elapsedTimeMillis",
            "summary.distance",
            "summary.elevationGain"
          ],
          {
            "fieldMask": [
              "userId",
              "metrics.userId",
              "metrics.stale",
              "version",
              "startTime",
              "discipline",
              "inputPending",
              "inputCoverage",
              "distanceKm",
              "distanceSource",
              "durationSec",
              "movingTimeSec",
              "movingTimeQuality",
              "tss",
              "sourceLayer",
              "cyclingDistanceObservations",
              "metrics.version",
              "metrics.startTime",
              "metrics.discipline",
              "metrics.inputPending",
              "metrics.inputCoverage",
              "metrics.distanceKm",
              "metrics.distanceSource",
              "metrics.durationSec",
              "metrics.movingTimeSec",
              "metrics.movingTimeQuality",
              "metrics.tss",
              "metrics.sourceLayer",
              "metrics.cyclingDistanceObservations",
              "status",
              "schemaVersion",
              "stale",
              "activeAttempt",
              "elevationGainM",
              "elevationQuality",
              "metrics.elevationGainM",
              "metrics.elevationQuality"
            ]
          }
        ]
      }
    },
    "modernWire": {
      "result": {
        "version": 1,
        "mode": "cycling_distance_history_page",
        "discipline": "bike",
        "calendarBasis": "Asia/Seoul",
        "rangeBasis": "calendar_year",
        "year": 2026,
        "targetsVersion": 1,
        "provenanceVersion": 2,
        "sourceBasis": "stored_distance_parts",
        "originalClockVerified": false,
        "timingBasis": "stored_explicit_activity_elapsed",
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
          "scannedActivityCount": 1,
          "candidateActivityCount": 1,
          "skippedActivityCount": 0,
          "exhausted": true,
          "observationCounts": {
            "observed": 1,
            "noObserved": 0,
            "unsupported": 0,
            "unavailable": 0
          },
          "nextCursor": null
        },
        "activities": [
          {
            "activityTotals": {
              "scope": "observed_activity_totals",
              "distanceM": 10000,
              "elevationGainM": null,
              "sourceBasis": {
                "distanceM": "canonical_metrics",
                "elevationGainM": "unavailable"
              },
              "distanceSource": "stream_counter",
              "sourceLayer": "raw_parts",
              "elevationQuality": "unknown",
              "gpsEligibility": "unknown"
            },
            "activityId": "ride",
            "startTime": 1767193201000,
            "activityRevision": "1:0",
            "metricsRevision": "1:0",
            "representativeInput": {
              "source": "strava",
              "type": "Ride",
              "discipline": "bike",
              "localSessionId": null,
              "stravaActivityId": null,
              "stravaTwinActivityId": null,
              "endTime": 1767194201000,
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
                  "elapsedSec": 805
                },
                {
                  "distance": "10km",
                  "elapsedSec": 1000
                }
              ],
              "provenance": {
                "provenanceVersion": 2,
                "sourceBasis": "stored_distance_parts",
                "timingBasis": "stored_explicit_activity_elapsed",
                "originalClockVerified": false,
                "declaredActivitySource": "strava",
                "status": "stored_explicit"
              }
            }
          }
        ]
      },
      "io": {
        "reads": 8,
        "metrics": 1,
        "query": 1,
        "masks": [
          [
            "userId",
            "type",
            "startTime",
            "endTime",
            "deletedAt",
            "source",
            "localSessionId",
            "stravaActivityId",
            "stravaTwinActivityId",
            "summary.movingTimeSec",
            "summary.movingTimeMillis",
            "summary.elapsedTimeMillis",
            "summary.distance",
            "summary.elevationGain"
          ],
          {
            "fieldMask": [
              "userId",
              "metrics.userId",
              "metrics.stale",
              "version",
              "startTime",
              "discipline",
              "inputPending",
              "inputCoverage",
              "distanceKm",
              "distanceSource",
              "durationSec",
              "movingTimeSec",
              "movingTimeQuality",
              "tss",
              "sourceLayer",
              "cyclingDistanceObservations",
              "metrics.version",
              "metrics.startTime",
              "metrics.discipline",
              "metrics.inputPending",
              "metrics.inputCoverage",
              "metrics.distanceKm",
              "metrics.distanceSource",
              "metrics.durationSec",
              "metrics.movingTimeSec",
              "metrics.movingTimeQuality",
              "metrics.tss",
              "metrics.sourceLayer",
              "metrics.cyclingDistanceObservations",
              "status",
              "schemaVersion",
              "stale",
              "activeAttempt",
              "elevationGainM",
              "elevationQuality",
              "metrics.elevationGainM",
              "metrics.elevationQuality"
            ]
          }
        ]
      }
    }
  },
  "selected": {
    "legacyWire": {
      "result": {
        "mode": "bike_distance_evidence",
        "activityId": "ride",
        "distanceInputRevision": "bd383d1f7b93cfae4c487cedf5918c68556693fa7bdaef96c204740350696af8",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "evidence": {
          "activityId": "ride",
          "distanceInputRevision": "bd383d1f7b93cfae4c487cedf5918c68556693fa7bdaef96c204740350696af8",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-distance-csv-v1",
          "sourceTimingBasis": "original_activity_elapsed",
          "originEpochMs": 1790000000000,
          "durationSec": 1000,
          "coverage": "unknown",
          "quality": "unknown",
          "scope": "single_observed_activity",
          "targetsVersion": 1,
          "inputPointCount": 1001,
          "observedStartOffsetSec": 0,
          "observedEndOffsetSec": 1000,
          "facts": [
            {
              "distance": "5miles",
              "distanceM": 8046.72,
              "elapsedSec": 805,
              "exactElapsedSec": 804.672,
              "startIndex": 0,
              "endBeforeIndex": 804,
              "endIndex": 805,
              "endFraction": 0.6720000000000255,
              "startTimeSec": 0,
              "endTimeSec": 804.672,
              "startOffsetSec": 0,
              "endOffsetSec": 804.672
            },
            {
              "distance": "10km",
              "distanceM": 10000,
              "elapsedSec": 1000,
              "exactElapsedSec": 1000,
              "startIndex": 0,
              "endBeforeIndex": 999,
              "endIndex": 1000,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 1000,
              "startOffsetSec": 0,
              "endOffsetSec": 1000
            }
          ]
        }
      },
      "io": {
        "reads": 12,
        "metadata": 2,
        "download": 1,
        "writes": 0
      }
    },
    "modernWire": {
      "result": {
        "mode": "bike_distance_evidence",
        "activityId": "ride",
        "distanceInputRevision": "bd383d1f7b93cfae4c487cedf5918c68556693fa7bdaef96c204740350696af8",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "evidence": {
          "activityId": "ride",
          "distanceInputRevision": "bd383d1f7b93cfae4c487cedf5918c68556693fa7bdaef96c204740350696af8",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "stored-distance-csv-v1",
          "provenanceVersion": 2,
          "sourceBasis": "stored_distance_parts",
          "sourceTimingBasis": "stored_explicit_activity_elapsed",
          "originalClockVerified": false,
          "declaredActivitySource": "orider",
          "originEpochMs": 1790000000000,
          "durationSec": 1000,
          "coverage": "unknown",
          "quality": "unknown",
          "scope": "single_observed_activity",
          "targetsVersion": 1,
          "inputPointCount": 1001,
          "observedStartOffsetSec": 0,
          "observedEndOffsetSec": 1000,
          "facts": [
            {
              "distance": "5miles",
              "distanceM": 8046.72,
              "elapsedSec": 805,
              "exactElapsedSec": 804.672,
              "startIndex": 0,
              "endBeforeIndex": 804,
              "endIndex": 805,
              "endFraction": 0.6720000000000255,
              "startTimeSec": 0,
              "endTimeSec": 804.672,
              "startOffsetSec": 0,
              "endOffsetSec": 804.672
            },
            {
              "distance": "10km",
              "distanceM": 10000,
              "elapsedSec": 1000,
              "exactElapsedSec": 1000,
              "startIndex": 0,
              "endBeforeIndex": 999,
              "endIndex": 1000,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 1000,
              "startOffsetSec": 0,
              "endOffsetSec": 1000
            }
          ]
        }
      },
      "io": {
        "reads": 12,
        "metadata": 2,
        "download": 1,
        "writes": 0
      }
    },
    "providerWire": {
      "result": {
        "mode": "bike_distance_evidence",
        "activityId": "ride",
        "distanceInputRevision": "2084df738164553655f1997be3d5a96183cb754f89e5276902fe7a4ae894dfd4",
        "state": "available",
        "reason": null,
        "sourceLayer": "api_streams",
        "evidence": {
          "activityId": "ride",
          "distanceInputRevision": "2084df738164553655f1997be3d5a96183cb754f89e5276902fe7a4ae894dfd4",
          "sourceLayer": "api_streams",
          "sourceSchemaVersion": "strava-stream-wrappers-v1",
          "provenanceVersion": 2,
          "sourceBasis": "provider_distance_stream",
          "sourceTimingBasis": "provider_explicit_activity_elapsed",
          "originalClockVerified": false,
          "declaredActivitySource": "strava",
          "originEpochMs": 1790000000000,
          "durationSec": 1000,
          "coverage": "unknown",
          "quality": "unknown",
          "scope": "single_observed_activity",
          "targetsVersion": 1,
          "inputPointCount": 1001,
          "observedStartOffsetSec": 0,
          "observedEndOffsetSec": 1000,
          "facts": [
            {
              "distance": "5miles",
              "distanceM": 8046.72,
              "elapsedSec": 805,
              "exactElapsedSec": 804.672,
              "startIndex": 0,
              "endBeforeIndex": 804,
              "endIndex": 805,
              "endFraction": 0.6720000000000255,
              "startTimeSec": 0,
              "endTimeSec": 804.672,
              "startOffsetSec": 0,
              "endOffsetSec": 804.672
            },
            {
              "distance": "10km",
              "distanceM": 10000,
              "elapsedSec": 1000,
              "exactElapsedSec": 1000,
              "startIndex": 0,
              "endBeforeIndex": 999,
              "endIndex": 1000,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 1000,
              "startOffsetSec": 0,
              "endOffsetSec": 1000
            }
          ]
        }
      },
      "io": {
        "reads": 14,
        "metadata": 0,
        "download": 0,
        "writes": 0
      }
    }
  },
  "runGolden": {
    "stored": {
      "sha256": "08dc0ba6f0db158cf3cc572667a5ab6b03202c5519df559d25826240fb1a61a4",
      "serializedWireUnchanged": true,
      "ioUnchanged": true,
      "io": {
        "reads": 12,
        "metadata": 2,
        "download": 1,
        "writes": 0
      },
      "result": {
        "mode": "run_distance_evidence",
        "activityId": "ride",
        "distanceInputRevision": "bd383d1f7b93cfae4c487cedf5918c68556693fa7bdaef96c204740350696af8",
        "state": "available",
        "reason": null,
        "sourceLayer": "raw_parts",
        "evidence": {
          "activityId": "ride",
          "distanceInputRevision": "bd383d1f7b93cfae4c487cedf5918c68556693fa7bdaef96c204740350696af8",
          "sourceLayer": "raw_parts",
          "sourceSchemaVersion": "native-distance-csv-v1",
          "sourceTimingBasis": "original_activity_elapsed",
          "originEpochMs": 1790000000000,
          "durationSec": 1000,
          "coverage": "unknown",
          "quality": "unknown",
          "scope": "single_observed_activity",
          "targetsVersion": 2,
          "inputPointCount": 1001,
          "observedStartOffsetSec": 0,
          "observedEndOffsetSec": 1000,
          "facts": [
            {
              "distance": "400m",
              "distanceM": 400,
              "elapsedSec": 40,
              "exactElapsedSec": 40,
              "startIndex": 0,
              "endBeforeIndex": 39,
              "endIndex": 40,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 40,
              "startOffsetSec": 0,
              "endOffsetSec": 40
            },
            {
              "distance": "half_mile",
              "distanceM": 804.672,
              "elapsedSec": 80,
              "exactElapsedSec": 80.46719999999999,
              "startIndex": 48,
              "endBeforeIndex": 128,
              "endIndex": 129,
              "endFraction": 0.46720000000000256,
              "startTimeSec": 48,
              "endTimeSec": 128.4672,
              "startOffsetSec": 48,
              "endOffsetSec": 128.4672
            },
            {
              "distance": "1km",
              "distanceM": 1000,
              "elapsedSec": 100,
              "exactElapsedSec": 100,
              "startIndex": 0,
              "endBeforeIndex": 99,
              "endIndex": 100,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 100,
              "startOffsetSec": 0,
              "endOffsetSec": 100
            },
            {
              "distance": "1mile",
              "distanceM": 1609.344,
              "elapsedSec": 161,
              "exactElapsedSec": 160.93439999999998,
              "startIndex": 96,
              "endBeforeIndex": 256,
              "endIndex": 257,
              "endFraction": 0.9344000000000051,
              "startTimeSec": 96,
              "endTimeSec": 256.9344,
              "startOffsetSec": 96,
              "endOffsetSec": 256.9344
            },
            {
              "distance": "2miles",
              "distanceM": 3218.688,
              "elapsedSec": 322,
              "exactElapsedSec": 321.86879999999996,
              "startIndex": 191,
              "endBeforeIndex": 512,
              "endIndex": 513,
              "endFraction": 0.8688000000000102,
              "startTimeSec": 191,
              "endTimeSec": 512.8688,
              "startOffsetSec": 191,
              "endOffsetSec": 512.8688
            },
            {
              "distance": "5km",
              "distanceM": 5000,
              "elapsedSec": 500,
              "exactElapsedSec": 500,
              "startIndex": 0,
              "endBeforeIndex": 499,
              "endIndex": 500,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 500,
              "startOffsetSec": 0,
              "endOffsetSec": 500
            },
            {
              "distance": "10km",
              "distanceM": 10000,
              "elapsedSec": 1000,
              "exactElapsedSec": 1000,
              "startIndex": 0,
              "endBeforeIndex": 999,
              "endIndex": 1000,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 1000,
              "startOffsetSec": 0,
              "endOffsetSec": 1000
            }
          ]
        }
      }
    },
    "api": {
      "sha256": "23995bc150aca13aba0866657644a345b43e594726441d44412afc3f31f732bb",
      "serializedWireUnchanged": true,
      "ioUnchanged": true,
      "io": {
        "reads": 14,
        "metadata": 0,
        "download": 0,
        "writes": 0
      },
      "result": {
        "mode": "run_distance_evidence",
        "activityId": "ride",
        "distanceInputRevision": "2084df738164553655f1997be3d5a96183cb754f89e5276902fe7a4ae894dfd4",
        "state": "available",
        "reason": null,
        "sourceLayer": "api_streams",
        "evidence": {
          "activityId": "ride",
          "distanceInputRevision": "2084df738164553655f1997be3d5a96183cb754f89e5276902fe7a4ae894dfd4",
          "sourceLayer": "api_streams",
          "sourceSchemaVersion": "strava-stream-wrappers-v1",
          "sourceTimingBasis": "original_activity_elapsed",
          "originEpochMs": 1790000000000,
          "durationSec": 1000,
          "coverage": "unknown",
          "quality": "unknown",
          "scope": "single_observed_activity",
          "targetsVersion": 2,
          "inputPointCount": 1001,
          "observedStartOffsetSec": 0,
          "observedEndOffsetSec": 1000,
          "facts": [
            {
              "distance": "400m",
              "distanceM": 400,
              "elapsedSec": 40,
              "exactElapsedSec": 40,
              "startIndex": 0,
              "endBeforeIndex": 39,
              "endIndex": 40,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 40,
              "startOffsetSec": 0,
              "endOffsetSec": 40
            },
            {
              "distance": "half_mile",
              "distanceM": 804.672,
              "elapsedSec": 80,
              "exactElapsedSec": 80.46719999999999,
              "startIndex": 48,
              "endBeforeIndex": 128,
              "endIndex": 129,
              "endFraction": 0.46720000000000256,
              "startTimeSec": 48,
              "endTimeSec": 128.4672,
              "startOffsetSec": 48,
              "endOffsetSec": 128.4672
            },
            {
              "distance": "1km",
              "distanceM": 1000,
              "elapsedSec": 100,
              "exactElapsedSec": 100,
              "startIndex": 0,
              "endBeforeIndex": 99,
              "endIndex": 100,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 100,
              "startOffsetSec": 0,
              "endOffsetSec": 100
            },
            {
              "distance": "1mile",
              "distanceM": 1609.344,
              "elapsedSec": 161,
              "exactElapsedSec": 160.93439999999998,
              "startIndex": 96,
              "endBeforeIndex": 256,
              "endIndex": 257,
              "endFraction": 0.9344000000000051,
              "startTimeSec": 96,
              "endTimeSec": 256.9344,
              "startOffsetSec": 96,
              "endOffsetSec": 256.9344
            },
            {
              "distance": "2miles",
              "distanceM": 3218.688,
              "elapsedSec": 322,
              "exactElapsedSec": 321.86879999999996,
              "startIndex": 191,
              "endBeforeIndex": 512,
              "endIndex": 513,
              "endFraction": 0.8688000000000102,
              "startTimeSec": 191,
              "endTimeSec": 512.8688,
              "startOffsetSec": 191,
              "endOffsetSec": 512.8688
            },
            {
              "distance": "5km",
              "distanceM": 5000,
              "elapsedSec": 500,
              "exactElapsedSec": 500,
              "startIndex": 0,
              "endBeforeIndex": 499,
              "endIndex": 500,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 500,
              "startOffsetSec": 0,
              "endOffsetSec": 500
            },
            {
              "distance": "10km",
              "distanceM": 10000,
              "elapsedSec": 1000,
              "exactElapsedSec": 1000,
              "startIndex": 0,
              "endBeforeIndex": 999,
              "endIndex": 1000,
              "endFraction": 1,
              "startTimeSec": 0,
              "endTimeSec": 1000,
              "startOffsetSec": 0,
              "endOffsetSec": 1000
            }
          ]
        }
      }
    }
  }
};
// END_COMPILED_BIKE_PROVENANCE_WIRE
