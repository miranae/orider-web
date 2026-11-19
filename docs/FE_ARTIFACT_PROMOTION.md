# FE 개발 검증 → 운영 승격

FE는 `Deploy (Hosting → stage)`에서 한 번 빌드하고 개발 서버에서 entry·runtime·HTTP alias를 검증합니다. 성공한 실행의 `stage-client-<frontend SHA>`에 dist 전체(숨김 파일 포함), Hosting 설정과 파일별 해시 영수증을 90일간 보관합니다. 추가·변경·삭제는 매번 완성된 dist 전체로 반영됩니다.

운영 승격은 **Promote verified Hosting artifact** (`promote-hosting.yml`)를 `main`에서 실행합니다.

- `candidate_run_id`: 검증을 마친 개발 FE 배포 실행 번호
- `candidate_run_attempt`: 해당 실행 시도 번호 (보통 `1`)
- `phase=rehearse`: 원본 파일과 출처를 검증하고 운영용 산출물을 준비합니다. 배포·재빌드·운영 인증 없이 실행하며, 아직 전환하지 않은 운영 BE가 정상이라는 의미는 아닙니다.
- `phase=promote`: 동일한 준비 후 기존 production Environment를 통해 Hosting을 게시합니다. 먼저 운영 BE의 source/topology가 개발에서 검증한 후보와 일치해야 합니다.

자바스크립트·CSS·HTML·정적 자산은 개발에서 검증한 바이트를 그대로 사용합니다. `runtime-config.json`의 서비스 주소와 Hosting rewrite만 운영 묶음 서비스로 바꾸며 기능 플래그는 후보 값을 유지합니다. 산출물의 frontend source와 승격 도구의 tooling source는 영수증에 따로 기록됩니다. 후보 source는 운영 브랜치 main에 포함되어야 합니다.

게시 전 파일 전체와 운영 BE를 확인하고 게시 후 실제 entry 바이트·runtime·HTTP alias를 검증합니다. 이 수동 승격은 기존 태그 배포의 Release 생성/태그 기반 모니터 증명을 만들지 않으며, 자체 실행 기록과 원본/변환 파일 영수증을 남깁니다. 기존 태그 재빌드 배포도 유지됩니다. 두 운영 배포 경로는 같은 concurrency 그룹을 사용합니다.

요청 예:

> 개발에서 검증한 FE 실행 123456789의 1번 시도를 운영으로 승격해 주세요. BE도 같은 후보로 맞추고 소요시간을 측정해 주세요.

개발 후보가 만료됐거나 파일이 누락·변경됐다면 승격을 중단하며 새 개발 검증 배포가 필요합니다. 새 archive 형식 이전의 숨김 파일이 빠진 후보도 그대로 승격하지 않습니다. 운영 승격 자체는 준비 작업과 별도로 실행해야 합니다.
