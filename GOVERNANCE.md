# 거버넌스

이 문서는 Orider Web 저장소의 의사결정 방식과 maintainer 책임을 설명합니다. 영문 문서는 [GOVERNANCE-en.md](GOVERNANCE-en.md)를 참고하세요.

## 역할

- **Maintainer**: issue triage, PR review, release, 보안 대응, 운영 배포 권한을 관리합니다.
- **Contributor**: issue, 문서, 테스트, UI 개선, recipe를 제안하고 PR로 제출합니다.
- **Reviewer**: 변경의 정확성, 개인정보 영향, 테스트, 사용자 경험을 검토합니다.

## 의사결정 원칙

1. 실제 라이더 데이터 보호를 우선합니다.
2. 작은 PR과 명확한 범위를 선호합니다.
3. 공개 API와 내부 Firebase callable을 구분합니다.
4. 제품 UI는 실제 사용 흐름을 기준으로 검토합니다.
5. 변경이 운영 배포에 영향을 주면 rollback과 release note를 함께 고려합니다.

## PR 승인

일반 PR은 최소 1명의 maintainer review와 필수 체크 통과가 필요합니다. 개인정보, 인증, API, 배포, 보안 관련 변경은 더 엄격하게 봅니다.

Maintainer도 자신의 변경을 스스로만 승인하지 않습니다. 가능한 경우 별도 reviewer가 확인합니다.

## 브랜치와 릴리스

브랜치 정책은 [docs/BRANCHING.md](docs/BRANCHING.md)를 따릅니다. `main`은 보호되며 직접 push하지 않습니다. 배포와 release tag 정책은 repository workflow와 release checklist에 맞춥니다.

## 보안과 비공개 신고

보안 취약점은 공개 issue로 다루지 않습니다. [SECURITY.md](SECURITY.md)를 따르세요.

## 변경 제안

거버넌스 변경은 issue나 PR로 제안할 수 있습니다. Maintainer는 영향 범위와 기존 contribution flow와의 일관성을 검토합니다.
