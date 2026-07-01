# Personal Data Recipe 안내

이 디렉터리는 라이더가 자신의 Orider 데이터를 개인 도구에 활용하는 recipe를 모읍니다. 영문 문서는 [personal-data-en.md](personal-data-en.md)를 참고하세요.

## Recipe 기준

좋은 recipe는 다음을 명확히 설명합니다.

- 어떤 문제를 해결하는지
- 필요한 Personal Data API scope
- 어떤 데이터가 Orider 밖으로 나가는지
- 기본 visibility와 redaction 방식
- 실행 빈도와 rate limit 고려
- demo input/output 또는 screenshot

실제 access token, user ID, 이메일, private route, production export, provider secret은 포함하지 마세요.

## 템플릿

```md
# Recipe: 제목

## 목적

라이더에게 어떤 가치를 주는지 설명합니다.

## 필요한 scope

- `activities:read`
- `streams:read`
- `fitness:read`

## 데이터 흐름

1. Personal Data API에서 본인 데이터를 읽습니다.
2. 필요한 aggregate만 계산합니다.
3. public-safe output만 저장하거나 공유합니다.

## 개인정보

- 정확한 route와 start location은 공유하지 않습니다.
- health metric은 기본 private입니다.
- 외부 서비스로 보내는 데이터가 있으면 명시합니다.

## 예시 출력

demo/mock data 기반 결과를 넣습니다.
```

## 현재 recipe

- [리포트형 레시피 템플릿](report-template.md)
- [AI Ride Diary](ai-ride-diary.md)
- [Weekly Load Report](weekly-load-report.md)
- [Hard-Day Streak Alert](hard-day-streak-alert.md)
- [Long-Ride Log Package](long-ride-log-package.md)
- [Monthly Ride Badge](monthly-ride-badge.md)
- [Z2 Target Reminder](z2-target-reminder.md)

## 실행 가능한 예제

- [Weekly Load Report Node 예제](../../examples/recipes/weekly-load-report/README.md): Personal Data API key로 HTML 리포트, JSON 요약, 공개용 텍스트를 생성합니다.

## 검토 기준

Maintainer는 privacy, product fit, abuse risk, scope 최소화, 사용자-facing 설명을 기준으로 검토합니다. 아직 live API가 없는 recipe는 mock-backed 상태로 유지합니다.
