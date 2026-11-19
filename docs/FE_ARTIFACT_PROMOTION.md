# FE 개발 검증 → 운영 승격

개발 배포에서 한 번 빌드하고 검증한 dist 전체를 기존 비공개 GCS 릴리스 버킷에 보관합니다. 운영 승격은 **Promote verified Hosting artifact** (`promote-hosting.yml`)를 `main`에서 실행합니다.

입력은 개발 배포의 `candidate_run_id`와 `candidate_run_attempt`(보통 `1`) 두 개입니다. 한 production job에서 다음 순서로 진행합니다.

1. 고정된 GCS generation·SHA-256으로 검증본을 복원하고 GitHub 출처 증명과 파일 manifest를 각각 한 번 확인합니다.
2. JS·CSS·HTML·정적 파일은 그대로 복사하고, runtime 주소와 Hosting rewrite만 운영용으로 바꿉니다. 기능 플래그는 개발 검증본 값을 유지합니다.
3. 운영 gateway의 `/readyz`를 한 번 확인한 뒤 Hosting에 게시합니다.
4. 공개 HTML과 runtime이 준비한 바이트와 같은지, 사이트맵 경로가 XML을 반환하는지 함께 확인합니다. 게시·검증 실패 시 이 작업이 게시한 릴리스만 직전 버전으로 되돌립니다.

앱 의존성 설치·재빌드·중간 Actions artifact 전달·별도 필수 rehearsal·predeploy 재검증은 없습니다. Firebase CLI는 runner에 있으면 재사용하고 없을 때만 설치합니다. BE commit/topology 값은 검증본의 출처 기록으로 남기며 FE 게시 조건으로 사용하지 않습니다. 추가·변경·삭제는 완성된 dist 전체로 반영합니다. 후보의 source·archive 무결성 및 검토된 main 이력/동일 Git tree 확인은 유지합니다.

실행에는 기존 production Environment의 `GCP_WORKLOAD_IDENTITY_PROVIDER`와 `GCP_SERVICE_ACCOUNT`를 사용합니다. 운영 배포 계정의 Hosting 권한과 기존 릴리스 버킷 `deploy-candidates/hosting/` 경로의 읽기 권한은 준비되어 있습니다. production Environment의 별도 수동 승인 단계 없이 같은 운영 자격 증명을 사용합니다. 개발 배포와 개발 계정 설정은 변경하지 않습니다.

GitHub 실행 기록의 보관 기간과 무관하게 GCS에 보관한 개발 검증 영수증으로 후보를 복원합니다. 새 플랫폼이나 별도 배포 서비스는 추가하지 않습니다. 기존 태그 재빌드 배포는 별도 경로이며 두 운영 게시 경로는 같은 concurrency 그룹을 사용합니다.

## 소요시간

성공·실패 모두 준비·게시·공개 확인의 실제 경과시간을 workflow summary에 남깁니다. 전체 소요시간은 준비 스크립트 시작부터가 아니라 GitHub run의 `created_at`부터 계산합니다. 마지막 summary는 그 시점까지의 경과시간이며, cleanup까지 포함한 최종 전체 시간은 실행이 완료된 뒤 GitHub run의 `updated_at - created_at`으로 확인합니다. 개발 빌드 시간은 운영 승격 시간과 별도로 봅니다.

요청 예:

> 개발에서 검증한 FE 실행 123456789의 1번 시도를 운영으로 승격해 주세요. 전체 소요시간도 측정해 주세요.

## English

Build and validate once in development. One production job restores the immutable GCS candidate, verifies GitHub provenance and checks its files once, replaces only runtime routing and Hosting rewrites, publishes it, and checks the public HTML/runtime and sitemap once. It restores the previous version only if this run published the failed release. It does not install application dependencies, rebuild, transfer intermediate Actions artifacts, require a rehearsal, or require an exact backend commit. The configured production credentials have Hosting deployment access and read access to the existing private candidate prefix; no separate manual approval or IAM setup step is required. Timing includes the workflow dispatch/setup period; use the completed run's `updated_at - created_at` for the final total including cleanup.
