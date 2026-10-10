# 분리된 stage Firebase

운영 `miranae-orider-g1`과 stage `orider-dev`는 Auth, Firestore, Storage, Functions 및 App Check를 별도로 사용한다. stage 웹 주소는 https://orider-dev.web.app 이다. 운영 계정의 로그인 세션은 stage에 공유하지 않는다.

## 배포

`deploy-stage.yml`은 `dev`에서만 실행하며 일회성 GitHub 러너와 `stage` environment의 `STAGE_*` 설정을 사용한다. `STAGE_FIREBASE_PROJECT_ID` 및 `STAGE_VITE_FIREBASE_PROJECT_ID`는 모두 `orider-dev`여야 한다. `VITE_MODE=stage`로 빌드와 runtime-config 생성 및 배포를 진행한다. stage 전용 workload identity provider와 deploy service account가 필요하다. 운영 태그 배포 workflow는 변경하지 않는다.

`firebase.stage.json`은 `orider-dev` site에 정적 SPA만 배포한다. 서버 rewrite, SEO prerender, 운영 API 프록시는 없다. 새 분석 API 세 개는 활성 상태와 비인증 거절을 배포 직전에 검사한다. 이 검사는 실제 소유자 및 App Check가 있는 분석 결과 검증을 대신하지 않는다.

stage 필수 browser config: Firebase SDK config, `asia-northeast3`, stage reCAPTCHA Enterprise App Check site key, Mapbox token. Strava·AI·personal API는 별도 stage 서버가 준비되기 전 빈 값으로 둔다. unavailable provider에 운영 주소를 복사하지 않는다. 기존 운영 로그인 인계는 stage에서 거절한다. 분석 활성화 플래그는 stage API 배포와 검증 후 별도로 켠다.

runtime writer와 SDK 초기화는 stage의 project, app ID, sender ID, Auth domain, Storage bucket과 서비스 주소를 검사한다. 운영 Firebase config를 stage에 넣으면 초기화를 거절한다. 구간 tile의 기본 bucket은 현재 runtime-config에서 결정한다.

## 테스트 데이터와 운영 제한

stage 데이터는 허가된 테스트 계정의 최소 활동만 복제한다. 운영 계정 토큰, OAuth refresh token, 개인 API key와 계정 지원 접근 권한을 복제하지 않는다. 활동 stream을 GCS로 보관하면 별도 stage 개인 API가 필요하므로 초기 분석 검증 데이터는 inline JSON을 사용한다. Firestore rules와 App Check의 서버 강제를 유지한다.

Functions는 필요한 조회 함수만 배포하고 스케줄러, 스트림 수집, 자동 동기화, 과거 데이터 재계산을 추가로 배포하지 않는다. 별도 프로젝트에 이미 있는 함수의 삭제·변경은 이 웹 배포 범위에 포함하지 않는다. 최소 인스턴스 0, 최대 인스턴스 제한과 비용 알림은 서버 운영 설정에서 적용한다.

기존 stage 주소에서 새 주소로의 redirect는 이전 stage site에만 적용하며 운영 site를 변경하지 않는다. 실제 검증에서는 새 주소의 runtime-config와 번들 hash, 로그인 project, 세 API 결과, 운영 서버로 요청하지 않는지를 각각 확인한다.
