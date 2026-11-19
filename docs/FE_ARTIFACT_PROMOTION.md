# FE 개발 검증 → 운영 승격

FE는 `Deploy (Hosting → stage)`에서 한 번 빌드하고 개발 서버에서 entry·runtime·HTTP alias를 검증합니다. 개발 검증 직후 dist 전체(숨김 파일 포함), Hosting 설정, 파일별 해시와 실제 검증 영수증을 기존 비공개 GCS 릴리스 버킷의 `deploy-candidates/hosting/<run>/<attempt>/candidate.tgz`에 create-only로 보관합니다. 현재 버킷에는 자동 만료 정책이 없습니다. GitHub artifact·실행 기록의 실제 보관 한도는 1일이므로 장기 승격의 원본으로 사용하지 않습니다. 추가·변경·삭제는 매번 완성된 dist 전체로 반영됩니다.

운영 승격 후보는 `main`의 개발 배포 워크플로에서 실행 커밋과 같은 웹 소스를 빌드해 만듭니다. 이 실행은 개발 검증을 마친 압축 파일에 GitHub 출처 증명을 발급합니다. 운영 승격은 **Promote verified Hosting artifact** (`promote-hosting.yml`)를 `main`에서 실행합니다.

- `candidate_run_id`: 검증을 마친 개발 FE 배포 실행 번호
- `candidate_run_attempt`: 해당 실행 시도 번호 (보통 `1`)
- `phase=rehearse`: 원본 파일과 출처를 검증하고 운영용 산출물을 준비합니다. 개발 계정의 비공개 후보 읽기 권한으로 실행하며 배포·재빌드·운영 인증은 하지 않습니다. 아직 전환하지 않은 운영 BE가 정상이라는 의미는 아닙니다.
- `phase=promote`: 동일한 준비 후 기존 production Environment를 통해 Hosting을 게시합니다. 먼저 운영 BE의 source/topology가 개발에서 검증한 후보와 일치해야 합니다.

자바스크립트·CSS·HTML·정적 자산은 개발에서 검증한 바이트를 그대로 사용합니다. `runtime-config.json`의 서비스 주소와 Hosting rewrite만 운영 묶음 서비스로 바꾸며 기능 플래그는 후보 값을 유지합니다. 산출물의 frontend source와 승격 도구의 tooling source는 영수증에 따로 기록됩니다.

게시 전 파일 전체와 운영 BE를 확인하고 게시 후 실제 entry 바이트·runtime·HTTP alias를 검증합니다. 이 수동 승격은 기존 태그 배포의 Release 생성/태그 기반 모니터 증명을 만들지 않으며, 자체 실행 기록과 원본/변환 파일 영수증을 남깁니다. 기존 태그 재빌드 배포도 유지됩니다. 두 운영 배포 경로는 같은 concurrency 그룹을 사용합니다.

Firebase Hosting은 설정과 파일 목록 전체를 새 버전으로 확정하고 해당 버전을 게시합니다. 파일 추가·변경·삭제는 게시 전 검증을 마친 `dist` 목록으로 반영됩니다. 게시 후에는 진입 파일, 런타임 설정, 주요 경로의 실제 응답을 확인합니다. [Firebase Hosting 게시 절차](https://firebase.google.com/docs/hosting/api-deploy)

요청 예:

> 개발에서 검증한 FE 실행 123456789의 1번 시도를 운영으로 승격해 주세요. BE도 같은 후보로 맞추고 소요시간을 측정해 주세요.

승격은 GCS object의 generation을 고정해 내려받은 뒤, 압축을 풀기 전에 SHA-256과 GitHub 서명을 대조합니다. 서명에는 `main`의 개발 배포 워크플로와 후보의 소스 커밋이 일치해야 합니다. GitHub 실행 기록이 남아 있으면 선택한 정확한 시도의 성공 기록도 대조합니다. 게시 후 검증이 실패하면 현재 활성 릴리스가 이 실행의 결과일 때만 직전 버전을 복원합니다.

## English

The main-branch stage workflow builds the source at its own commit and attests the archive after development verification. Promotion verifies the immutable archive digest and GitHub provenance before extraction, then changes only runtime routing and Hosting rewrites. It rolls back a failed publication only while the release from that run is still active.
