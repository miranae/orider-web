// 실제 compiled reader가 주입된 합성 SDK/Firestore/GCS로 반환한 전체 wire다. 운영 소유자나 원본 수집 완전성 증명이 아니다.
// Artifact SHA256: 09059a4f93f6d2b5be629b3f1273a1d7d6a0d01b01b14312087b60dfd2e9a1f2
import { compiledFirstPages } from "./activityRouteIndexPage.compiledFirst.fixture";
import { compiledLastPages } from "./activityRouteIndexPage.compiledLast.fixture";

export const compiledRouteIndexWire = {
  provenance: {
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
  pages: [...compiledFirstPages, ...compiledLastPages],
};
