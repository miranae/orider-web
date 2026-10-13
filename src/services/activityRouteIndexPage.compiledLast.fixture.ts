export const compiledLastPages = [
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
];
