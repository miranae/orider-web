// Actual compiled synthetic history wire, extracted without changing its values. No owner data.
export const compiledBikeProvenanceHistoryWire = {
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
  };
