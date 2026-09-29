# 러닝 홈·분석 화면 검증 / Running web parity

합성 공개 러닝 활동으로 실제 홈과 활동 상세 경로를 확인했다. 운영 계정·경로·좌표를 사용하지 않으며 Firebase Auth/Firestore 에뮬레이터만 사용한다. 공개 분석 문서만 있고 원시 스트림이 없는 상태에서도 페이스, GAP, 심박 존, 케이던스, 실측 러닝 파워와 스플릿이 표시된다.

These screenshots use a synthetic public run with no production accounts, coordinates, or raw streams. The home and activity detail routes render server-authoritative running metrics through Firebase emulators. Native cadence is already steps/minute and is not doubled; only explicitly identified Strava strides/minute is converted.

- 경로 / Routes: `/ko/`, `/ko/activity/running-parity-public`
- 데스크톱 / Desktop: 1440 × 900, Chrome
- 모바일 / Mobile: 390 × 844, Chrome
- 검증 / Checks: four Playwright flows passed (home and public detail on both viewports). The 21-split fixture checks keyboard selection, immediately available pace/GAP/HR/cadence detail, the metric explanation dialog, and folded technical metrics/raw data.
- 홈은 거리·페이스·시간을 우선 표시한다. 분석은 쉬운 요약 → 선택형 스플릿 → 펼치는 상세 순서다 / Feed primary stats are distance, pace and time; analysis follows recap, interactive splits, then disclosures.
- 개인 여정과 지난 이력 비교는 별도 owner/component 회귀로 검증했다 / Owner-only journey and historical comparison are covered by component regressions, not real-account browser evidence.
- 운영 반영 / Delivery: screenshots show local implementation; production deployment and existing-activity recomputation are separate steps.

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home firebase emulators:exec --project demo-orider-running-parity --only auth,firestore 'npx playwright test --config e2e/running-parity.config.ts'
```

## 홈 / Home

![Desktop running home](running-home-desktop.png)

![Mobile running home](running-home-mobile.png)

## 서버 지표만 있는 공개 분석 / Public analysis without raw streams

![Desktop running analysis](running-analysis-desktop.png)

![Mobile running analysis](running-analysis-mobile.png)

![Desktop running splits](running-splits-desktop.png)

![Mobile running splits](running-splits-mobile.png)
