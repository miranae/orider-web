# Stage compute와 공유 운영 데이터

Stage 웹·Functions 배포 프로젝트는 `orider-dev`, 실제 Auth·Firestore·Storage·App Check 데이터 원본은 `miranae-orider-g1`이다. 사용자가 승인한 공유 데이터 구성으로 운영 활동과 같은 계정을 stage에서 분석한다. 테스트 데이터나 복제 fixture로 분석 결과를 대신하지 않는다. Stage 주소는 https://orider-dev.web.app 이다.

## 명시적 배포 경계

`deploy-stage.yml`은 `dev`에서 일회성 GitHub 러너와 stage 전용 WIF/deploy service account를 사용한다. `STAGE_FIREBASE_PROJECT_ID=orider-dev`는 Hosting 및 callable 배포 대상, `STAGE_VITE_FIREBASE_PROJECT_ID=miranae-orider-g1`은 공유 데이터/인증 대상이다. `VITE_MODE=stage`와 `STAGE_VITE_FIREBASE_FUNCTIONS_BASE=https://asia-northeast3-orider-dev.cloudfunctions.net`를 반드시 설정한다. 운영 웹 태그 배포 workflow는 변경하지 않는다.

단일 production FirebaseApp의 Auth/App Check 문맥을 유지하면서 normal·embedded `getFunctions`에 정확한 stage custom domain을 전달한다. 모든 callable 이름은 stage namespace에서 호출한다. 미배포 기능을 운영 Functions로 우회하지 않는다. Stage Hosting은 서버 rewrite 없는 SPA이며 runtime writer와 Firebase 초기화는 공유 SDK identity와 stage callable endpoint를 검사한다. 운영 Functions 주소 또는 endpoint 누락이면 stage 초기화를 거절한다.

Shared Auth SDK app의 reCAPTCHA Enterprise site key와 새 stage Hosting domain 등록이 필요하다. 보안 검증을 끄거나 App Check 디버그 토큰으로 실검증을 대신하지 않는다. 원래 production 웹의 보호 설정과 도메인을 보존한다. Stage native login handoff는 지원하지 않는다. AI·Strava 연결·personal REST API는 별도 stage 구현이 준비되기 전 빈 값과 꺼진 기능 플래그를 사용한다.

## 분석 검증 범위

분석 배포 대상은 `getActivityRangeAnalysis`, `getMySegmentHistory`, `getPowerCurvePeriods`, `getActivityOverview`, `getActivityStreams`이다. 배포 전에 ACTIVE metadata와 비인증 거절을 검사한다. 실제 소유자/Auth/App Check가 있는 분석 결과 검증을 별도로 수행한다.

Stage에서는 native·Strava 활동 모두 `getActivityStreams`를 통해 같은 실제 운영 stream 원본을 읽는다. Epoch/상대 시간축, 센서 null/0, 원본 wrapper와 기타 metadata는 transport에서 변환하지 않는다. pending/changed_input/unavailable은 데이터로 표시하지 않는다. 계정이 바뀐 요청과 다른 app의 Functions 문맥은 거절하며 생산 REST 및 Strava reader는 기존 경로를 유지한다.

조회 함수의 rate-limit/overview 파생 cache 쓰기가 발생할 수 있다. 정본 활동·stream·metrics의 재계산/백필/자동 수집은 이 분석 검증 배포에 포함하지 않는다. 공유 데이터의 사용자 기능 쓰기는 사용자가 별도로 허용했지만, 현재 배포는 위 분석 API와 검증 범위다. 미배포 social/동기화 기능을 지원 완료라고 보고하지 않는다.

기존 stage site에서 새 주소로 redirect하는 작업은 이전 stage Hosting에만 적용한다. 운영 Hosting과 운영 Functions 배포는 별도 경계다. 최소 인스턴스 0, 최대 인스턴스 제한과 비용 알림은 stage 서버 설정에서 관리한다.
