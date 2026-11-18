# 개발 Hosting과 운영 버전 기준 검증

개발 웹은 운영 Auth·Firestore·Storage를 공유한다. 개발에서 수정·삭제한 데이터는 운영 데이터이며,
운영 Firestore 트리거가 처리할 수 있다. callable·REST·공개 클럽 API·AI 실행은 `orider-dev`로 분리한다.
운영 데이터에 연결된 개발 Eventarc/Scheduler 복제는 이 절차의 범위가 아니다.

## 버전과 연결 계약

- 초기 앱 기준: 운영 배포 SHA `2e5bf8e5c08493c69121710da26173fcea77e8ea`.
- 앱 업무 계산·기능 분기는 이 SHA와 같다. 허용된 앱 차이는 명시한 개발 URL 검증과 Firebase/REST 실행 클라이언트 선택이다.
- `appEnvironment=production`을 유지하고 `deploymentProfile=production-parity-stage`로 실행만 분리한다.
  기존 `appEnvironment=stage`는 QA 전용 기능·스트림 경로를 켜므로 운영 동등 검증에 쓰지 않는다.
- `stage-parity-default`가 callable `/{name}`, REST `/api/v1/**`, 공개 `/publicClubs`를 받는다.
- `stage-parity-course`, `stage-parity-strava`, `stage-parity-strava-ingress`는 같은 운영 이미지의 다른 코드베이스다.
- AI는 `stage-parity-ai`를 사용한다. 기존 개별 Coach QA 서비스와 구분한다.
- Auth 소셜 핸들러는 운영 Firebase Auth의 정본 경로를 명시적으로 사용한다.
- Strava는 등록된 운영 OAuth 프록시가 `state`의 개발 returnOrigin으로 복귀한다. 동의·코드 교환은 별도 검증한다.
- 지도/히트맵 등 공유 Storage의 공개 정적 데이터는 운영 저장소를 유지한다.

## 안전한 반복 배포

최신 운영 Hosting 버전·GitHub production Deployment SHA·운영 공개 설정을 먼저 대조한다.
아래 SHA를 최신 개발 브랜치 SHA로 바꾸면 안 된다. 개발 브랜치의 미출시 업무 기능은 자동으로 포함하지 않는다.
사용하는 워크트리는 확인한 운영 SHA와 배포 도구 수정만 포함해야 한다.

```sh
node scripts/prepare-stage-production-parity.mjs \
  --source-sha 2e5bf8e5c08493c69121710da26173fcea77e8ea \
  --reviewed-head "$REVIEWED_STAGE_COMMIT" \
  --out /tmp/orider-stage-parity-prepared --build
```

이 명령은 배포하지 않는다. 운영 공개 설정의 기능 스위치를 모두 보존하고 개발 실행 URL로만 바꾼다.
`REVIEWED_STAGE_COMMIT`은 독립 리뷰를 마친 앱/전송 패치의 전체 커밋 SHA로 지정한다.
HEAD가 이 값과 다르거나 작업 트리가 더러우면 중단하며, 네트워크 조회 전·빌드 전후 같은 상태인지 다시 검사한다.
빌드는 이 커밋의 `git archive` 전용 디렉터리에서 수행한다. 무시된 로컬 `.env*`와 호출자의 `VITE_*`를 상속하지 않는다.
운영 Hosting 버전·파일 해시와 성공한 GitHub Deployment SHA/배포 시간 구간을 대조한다.
현재 운영 실행의 `production-hosting-evidence` artifact는 보존돼 있지 않다.
따라서 GitHub SHA와 Hosting 버전의 관계는 관측한 성공 배포와 시간 구간의 상관관계이며, 소스→빌드의 암호학적 증명으로 표현하지 않는다.
해당 구간 안에 별도 운영 게시가 겹친 경우를 판별하려면 보존된 배포 artifact가 필요하다.
라이브 HTML·entry·runtime 설정의 저장된 gzip 응답 SHA256을 Hosting 파일 해시와 비교하고, 조회 전후 버전이 바뀌면 중단한다.
전송 설정·검증 도구의 허용된 변경 외 tracked 차이, 수정한 `index.html`·빌드 설정, 미추적 파일이 있으면 중단한다.
비공개 출력 디렉터리에 설정·빌드 환경·운영 SHA·전송 설정 패치 해시와 릴리스 증명을 남긴다.
`PRODUCTION_RUNTIME_CONFIG_PATH`의 기존 운영 실행 경로로 폴백하지 않는다.

BE의 운영 이미지 digest 일치, SDK callable 프로토콜, Auth/App Check, 공유 데이터 접근,
개발 origin CORS를 독립 검증한 뒤에만 Hosting을 게시한다. 개발 Hosting의 이전 버전과 설정도 먼저 보존한다.
배포 계정은 `orider-dev` Hosting 권한으로 한정한다. 준비한 `build-env.json`을 프로세스 환경에 주입한 상태에서
아래 명령을 사용한다. JSON 파일을 shell 코드로 `source`하지 않는다.

```sh
firebase deploy --config firebase.stage.json --project orider-dev --only hosting --non-interactive
```

배포 후 라이브 entry SHA256·runtime 설정이 준비 결과와 같고 운영 Hosting 버전이 그대로인지 확인한다.
라이브 runtime의 `deploymentProfile`, `sourceVersion`, `sourceHostingVersion`으로 사용한 기준을 확인할 수 있다.
로그인·활동 조회·분석·차트·지도와 허용된 테스트 데이터의 쓰기/복구를 별도로 검증한다.
공개 HTTP 200 또는 인증 없는 callable 오류는 전체 기능 검증 통과로 기록하지 않는다.

기존 `deploy-stage.yml`은 별도 정비 전까지 비활성 상태를 유지한다. 이 문서는 활성화 승인이 아니다.
문제 시 사전에 보존한 `orider-dev` Hosting 버전을 다시 release하고, 운영 Hosting은 변경하지 않는다.

개발 Hosting의 `firebaseapp.com` 별칭은 초기화와 일반 Auth를 허용한다. 기존 Strava 프록시는
`orider-dev.web.app`만 복귀 출처로 허용하므로, Strava 연동 검증은 이 정본 개발 주소에서 수행한다.
