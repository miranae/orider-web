# 공개 저장소 전환

이 문서는 private 작업 저장소에서 public repository 운영으로 전환할 때의 절차입니다. 영문 문서는 [PUBLIC_REPOSITORY_CUTOVER-en.md](PUBLIC_REPOSITORY_CUTOVER-en.md)를 참고하세요.

## 목표

- 운영 secret과 private data를 공개 history에 포함하지 않음
- 공개 기여자가 이해할 수 있는 README/docs/CONTRIBUTING 제공
- fork PR에서도 안전하게 CI 실행
- production deploy 권한과 public PR 실행 권한 분리

## 원칙

1. private repo를 mirror-push하지 않습니다.
2. 공개 저장소는 clean export 또는 검증된 branch만 사용합니다.
3. GitHub hidden refs, 오래된 PR refs, 삭제된 secret history가 public repo로 넘어가지 않게 합니다.
4. production secret은 public PR에서 접근할 수 없어야 합니다.
5. 공개 기본 문서는 한국어, `*-en.md`는 영어 문서로 유지합니다.

## 전환 절차

1. secret scan과 파일명 scan을 실행합니다.
2. `.env`, credential, dump, backup, export, service account 파일이 없는지 확인합니다.
3. README, CONTRIBUTING, SECURITY, LICENSE, DCO를 정리합니다.
4. docs link와 언어 쌍을 확인합니다.
5. CI가 secret 없이 동작하도록 placeholder env를 사용합니다.
6. deploy workflow는 tag/environment approval 기반으로 제한합니다.
7. public repo를 만든 뒤 branch protection과 repository settings를 설정합니다.

## 권장 검사

```bash
git ls-files | rg -i '(^|/)(\\.env|.*\\.env.*|.*secret.*|.*credential.*|.*service.*account.*|.*backup.*|.*dump.*|.*export.*)'
rg -i 'private_key|client_secret|refresh_token|service account|BEGIN .*PRIVATE KEY'
npm test
npm run build
```

## 전환 후 작업

- issue/PR template 확인
- DCO와 PR gate 확인
- README badge/link 확인
- security policy 확인
- public release checklist 수행
- maintainer에게 deploy approval과 tag 생성 권한 안내

## 금지

- private repo 전체 mirror push
- production export를 sample data로 사용
- 실제 사용자 screenshot을 redaction 없이 사용
- provider secret을 GitHub Actions public context에 저장
- Firebase callable을 public API처럼 안내
