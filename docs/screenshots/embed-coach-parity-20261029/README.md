# 앱 WebView 코치 화면 공유 검증

2026-10-29 로컬 Chrome 검증. 전용 Firebase Auth/Firestore 에뮬레이터의 합성 계정과 데이터만 사용했습니다. 외부 네트워크 요청은 차단했습니다.

- 320·393·768px에서 컨디션 → 오늘 → 분석 → 계획 → 목표 이동, 같은 계정 유지, 뒤로가기, 가로 넘침 없음: 3개 시나리오 통과.
- 성공 화면이 로드된 뒤 캡처했습니다. 계획은 웹과 같은 계획 대비 실제 부하 비교와 주간 계획을 사용합니다.
- 네이티브 브리지 승인은 별도 단위 테스트에서 화면 이동·호스트 탭 재선택 중 재인증하지 않는지 검증했습니다.
- 실제 iOS/Android WebView, 실기기 운동 시작, 운영 데이터와 배포는 이 검증에 포함하지 않습니다.

재현:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home firebase emulators:exec --config e2e/coach-app-local.emulators.json --project demo-orider-coach-local --only auth,firestore 'npx playwright test --config e2e/embedded-coach.config.ts'
npx tsc -p e2e/tsconfig.embedded-coach.json --noEmit
```

| 화면 | 캡처 |
|---|---|
| 컨디션 393px | [condition-393.png](condition-393.png) |
| 오늘 393px | [today-393.png](today-393.png) |
| 분석 320px | [analysis-320.png](analysis-320.png) |
| 계획 393px | [plan-393.png](plan-393.png) |
| 목표 393px | [goals-393.png](goals-393.png) |
| 계획 768px | [plan-768.png](plan-768.png) |
