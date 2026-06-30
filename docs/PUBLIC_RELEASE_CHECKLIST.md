# 공개 저장소 체크리스트

이 문서는 Orider Web을 공개 저장소로 운영할 때 확인할 항목입니다. 영문 문서는 [PUBLIC_RELEASE_CHECKLIST-en.md](PUBLIC_RELEASE_CHECKLIST-en.md)를 참고하세요.

## 공개 전 확인

- [ ] secret, token, service account, private key가 없음
- [ ] `.env`, dump, backup, production export가 없음
- [ ] 실제 사용자 ID, 이메일, private route, screenshot이 없음
- [ ] README, CONTRIBUTING, SECURITY, LICENSE가 최신
- [ ] `*-en.md`가 있으면 기본 문서는 한국어
- [ ] docs link가 깨지지 않음
- [ ] CI가 fork PR에서 secret 없이 동작
- [ ] deploy workflow가 PR에서 production secret을 쓰지 않음

## 코드 확인

- [ ] `npm run lint:budget`
- [ ] `npm run quality:budget`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] 필요한 경우 `npm run e2e`

## 개인정보

- [ ] fixture는 demo/mock data만 사용
- [ ] screenshot은 demo-safe 또는 redacted
- [ ] Personal Data API 문서는 owner-only scope를 명확히 설명
- [ ] recipe는 required scopes와 privacy note를 포함

## 배포와 릴리스

- [ ] `main` merge와 production deploy trigger가 의도대로 분리되어 있음
- [ ] release tag 정책이 문서화되어 있음
- [ ] environment approval 권한이 관리됨
- [ ] release note 작성 경로가 있음
- [ ] rollback 경로를 maintainer가 알고 있음

## 운영 후 확인

- [ ] GitHub repository description/topic/license 확인
- [ ] issue/PR template 동작 확인
- [ ] DCO/CI/pr-gate 동작 확인
- [ ] 공개 README 링크 확인
- [ ] 보안 신고 경로 확인
