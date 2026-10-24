# 개발 Hosting의 운영 데이터 일치 / Development Hosting production-data parity

`orider-dev.web.app`은 개발 브랜치 코드를 제공하며, 기본 데이터 조회·쓰기와 기능 설정은 현재 `orider.co.kr`의 운영 설정을 사용합니다. 사용자 권한, Firebase Auth와 App Check 검증은 운영과 같습니다.

`deploy-stage.yml`은 현재 운영의 공개 `runtime-config.json`을 한 번 내려받아 Firebase identity와 서비스 origin을 검증합니다. 같은 snapshot을 빌드 환경, 산출물 runtime 설정, Hosting predeploy에 사용합니다. 운영의 상대 `/api/v1` 경로는 `https://orider.co.kr`로 해석하며, 개발 Hosting에 운영 Functions rewrite를 추가하지 않습니다. CSP는 운영의 API·영상 CDN 등 기존 자원 정책을 유지합니다. 활동 파일·ZIP 가져오기도 이 API base를 사용합니다.

운영 REST와 AI의 개발 origin CORS 지원은 [백엔드 PR #3327](https://github.com/miranae/orider-g1-web/pull/3327)이 선행합니다. 개발 배포는 읽기·쓰기·AI·사용자 profile callable의 OPTIONS 응답에서 개발 origin, HTTP method, Authorization·Content-Type·App Check header가 허용되는지 확인합니다. 이 검사는 데이터를 쓰지 않으며, backend가 준비되지 않으면 Hosting 배포를 중단합니다.

기존 운영 bundle은 구독 기능 두 설정을 runtime JSON에 내보내지 않았습니다. 2026-10-24에 확인한 운영 entry·구독 chunk의 SHA-256이 둘 다 일치할 때만 확인된 `true/true`를 이전합니다. 다른 이전 bundle은 추정하지 않고 배포를 중단합니다. 새 runtime writer는 두 필드를 내보내므로 이후에는 운영 JSON 값을 그대로 사용합니다. 원격 JavaScript를 실행하거나 해석하지 않습니다.

명시적인 `appEnvironment=stage` 분석 실험 경로와 기존 검증은 코드에 남아 있습니다. 개발 Hosting 기본 배포는 이 경로를 사용하지 않습니다. 운영 설정이 바뀌면 다음 개발 배포가 새 snapshot을 사용합니다.

The development domain serves development code while its default reads, writes and feature settings use one validated snapshot of the live production public runtime. Production Auth, App Check and authorization remain authoritative. Relative personal API requests resolve against `https://orider.co.kr`, including FIT/GPX/TCX and ZIP imports. Development Hosting retains its local SPA routing and production resource/CSP coverage.

Deploy backend [#3327](https://github.com/miranae/orider-g1-web/pull/3327) first. The frontend deployment checks read/write/AI/callable preflight responses without making data changes. Missing CORS support blocks deployment. Runtime output and predeploy reuse the pinned snapshot instead of fetching independently. The temporary legacy subscription migration accepts only the two audited production asset hashes; future production runtimes carry both flags explicitly. Explicit isolated-stage experiments remain available but are not the development Hosting default.
