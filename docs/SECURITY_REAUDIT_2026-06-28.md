# 보안 재점검 스냅샷 - 2026-06-28

이 문서는 공개 저장소 전환 과정에서 수행한 보안 재점검 요약입니다. 영문 문서는 [SECURITY_REAUDIT_2026-06-28-en.md](SECURITY_REAUDIT_2026-06-28-en.md)를 참고하세요.

## 결과 요약

| 항목 | 결과 | 비고 |
|---|---|---|
| secret-like string scan | 통과 | public docs/test fixture의 false positive만 확인 |
| credential filename scan | 통과 | `.env`, service account, dump/export 없음 |
| public docs review | 통과 | secret 대신 browser-safe config로 설명 |
| workflow review | 통과 | PR에서 production secret 사용하지 않도록 제한 |
| personal data review | 통과 | 실제 user data/screenshot/export 미포함 |

## 확인한 위험

- Firebase web config는 secret이 아니지만, 설명 없이 노출되면 오해가 생길 수 있습니다.
- App Check debug token은 secret처럼 취급해야 합니다.
- private repo를 mirror-push하면 hidden refs나 과거 PR refs가 따라갈 수 있습니다.
- recipe 문서는 demo/mock/owned data만 사용해야 합니다.

## 권장 명령

```bash
git ls-files | rg -i '(^|/)(\\.env|.*\\.env.*|.*secret.*|.*credential.*|.*service.*account.*|.*backup.*|.*dump.*|.*export.*)'
rg -i 'private_key|client_secret|refresh_token|service account|BEGIN .*PRIVATE KEY'
npm test
npm run build
```

## 유지 기준

- 공개 PR에서는 secret 없이 CI가 돌아야 합니다.
- production deploy는 tag, environment approval, maintainer 권한으로 관리합니다.
- API 문서는 owner-only scope와 내부 callable 경계를 구분해야 합니다.
- screenshot과 sample은 demo-safe여야 합니다.

## 후속

새 provider, API key, workflow secret, export flow가 추가되면 이 체크리스트를 다시 적용합니다.
