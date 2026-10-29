# R5/R6 기존 분석의 hosted 연결

이 변경은 배포/운영 활성화가 아니다. 기존 계산·DTO·Firebase callable을 재사용하고 웹에 남아 있던 Stage/demo 전용 진입 제한만 명시 capability로 교체한다. runtime JSON·환경변수 기본값은 변경하지 않는다.

## 진입과 전송 경계

- R5 기존 비교/색인/그룹/연도 탐색/전체 이력은 `observedRouteAvailable` → `analysisCapabilityAvailable("routes")`를 공유한다. 운영에서는 기존 `activityAnalysisExpansionEnabled === true`가 필요하다.
- R6 기존 `FitnessPeriodEvidence`의 자전거 기간 조회 → truncated 안내 → `BikePeriodSnapshotPanel`, 기존 `PowerCurvePeriodsPanel`의 truncated 기간 → 같은 panel을 유지한다. 운영은 기존 `trainingAnalysisPeriodsEnabled === true`가 필요하다. 별도 페이지/계산기를 추가하지 않는다.
- hosted production은 Firebase project `miranae-orider-g1`, region `asia-northeast3`, 표준 `https://asia-northeast3-miranae-orider-g1.cloudfunctions.net`만 허용한다. Stage는 기존 명시 `https://asia-northeast3-orider-dev.cloudfunctions.net`을 유지한다. config와 실제 Auth/Functions SDK app/project/region/endpoint가 일치해야 한다. SDK `emulatorOrigin`이 `customDomain`보다 우선한다는 실제 전송 규칙을 검사한다.
- AppCheck 대기 전후 및 응답 반환 시 현재 capability/transport와 SDK 사용자·app identity를 재확인한다. 같은 UID의 새 SDK 세션도 이전 응답을 수락하지 않는다.
- 로컬은 기존 DEV+loopback+emulators+demo-project+정확 loopback endpoint 계약만 허용한다. production 프로젝트를 로컬 emulator와 혼합하거나 arbitrary URL을 허용하지 않는다.
- 일반 자전거 `getTrainingAnalysisPeriods`와 `progressBikeAnalysisPeriodSnapshot`만 운영 연결한다. 기존 Stage run overlay 옵션/러닝 확장 진입은 Stage에 한정하며 이 변경으로 운영에 열지 않는다.

## 기존 API와 준비 순서

|기능|기존 API|활성화 준비|
|---|---|---|
|경로·색인·그룹·연도 탐색|`getActivityStreams`의 `route_evidence`, `route_index_page`, `matched_route_group_page`, `matched_route_inventory_page`|BE 공통 권한/owner-bound source는 그대로. 그룹·inventory의 hosted 실행은 BE default-off `ORIDER_MATCHED_ROUTE_GROUPS_ENABLED=true`와 정식 `MATCHED_ROUTE_GROUP_SESSION_SECRET`, 실제 project/bucket 검증이 선행해야 함|
|전체 저장 이력|`progressActivityRouteHistorySnapshot`|기존 정식 export/owner ACL/만료·재검증 계약 유지|
|기본 자전거 기간|`getTrainingAnalysisPeriods`|기존 정식 export 재사용. Stage 전용 옵션 혼합 금지|
|큰 자전거 기간|`progressBikeAnalysisPeriodSnapshot`|기존 정식 export/owner ACL/명시 진행·중단·만료 계약 유지|

운영 순서는 **BE 명시 enable/config 및 배포·권한검증 → WEB 후보 → 필요한 기존 flag 명시 승인/검증**이다. 기존 운영 activity expansion flag가 이미 true일 수 있으므로 웹만 먼저 배포해서 backend 준비가 끝났다고 가정하면 안 된다. 원격 설정/배포/secret 생성은 이번 작업에서 실행하지 않았다. 서버 오류는 결과 성공/완전 조회로 변환하지 않는다.

## 로컬 검증 범위

- production-shaped runtime + SDK mock에서 위 7개 기존 callable 진입, AppCheck, 같은 UID 세션 교체, 대기 중/응답 후 전송 경계 교체, backend-not-ready 실패 전파를 검증한다. 실제 production HTTP 호출은 하지 않는다.
- runtime flags off, 잘못된 project/region/custom endpoint/emulator override, Stage endpoint를 production으로 오인하는 경우를 거절한다. 기존 demo transport 회귀를 함께 실행한다.
- 기존 기간/파워/성장/존 패널 회귀와 production-shaped BikePeriodSnapshotPanel 노출/flag-off 미노출을 확인한다.
- 숫자/집계/원천/권한 정책을 새로 계산하지 않는다. 과거 로컬 actual large-history 결과는 그 버전의 증거이며 이 patch의 hosted 배포 성공 증거가 아니다.

- BE `failed-precondition/details.reason=route_backend_unavailable`은 그룹·연도 탐색에서 기존 이용 불가 상태로 표시하고 수집 결과를 폐기한다. 원본 변경에 따른 invalidated와 구별하며 자동 재시도하지 않는다.
- Node 22 focused: 17 suites / 396 tests PASS, 추가 그룹·inventory hook 2 suites / 20 tests PASS (서로 다른 파일, 총 19 suites / 416 tests). TypeScript 및 소유 TypeScript 파일 scoped ESLint PASS. 전체 회귀는 통합 담당자가 별도로 수행한다. 과거 9860-test checkpoint를 이 변경의 전체 통과로 소급하지 않는다.

### 비교 탭 실제 진입 후속

독립 리뷰에서 서비스와 별개로 ActivityPage가 사용하는 `ActivityGrowthPanel comparisonOnly`의 Stage/local 조건이 남아 있음을 확인했다. 경로 index/history 및 선택 활동의 경로 비교 진입은 기존 routes capability로 통합하고, Stage 전용 거리·파워 도구 조건은 유지했다. production-shaped comparisonOnly 렌더에서 index 1회·history·선택 pair 노출 및 Stage power 미노출을 검증했다. 해당 panel 47 tests PASS, tsc/scoped lint PASS. 이 회귀는 앞 416개와 중복되는 panel suite의 재실행이므로 합산하지 않는다.
