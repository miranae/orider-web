export const compiledFirstPages = [
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
  }
];
