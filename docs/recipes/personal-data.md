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
- [자전거 출퇴근 일기](commute-diary.md)
- [Weekly Load Report](weekly-load-report.md)
- [Hard-Day Streak Alert](hard-day-streak-alert.md)
- [Long-Ride Log Package](long-ride-log-package.md)
- [Monthly Ride Badge](monthly-ride-badge.md)
- [Z2 Target Reminder](z2-target-reminder.md)

## 대표 레시피

완성도 높은 Creator Hub 예시는 다음과 같습니다. 분석 리포트를 만드는 레시피라면 [리포트형 레시피 템플릿](report-template.md)을 사용하세요.

| 레시피 | 결과 | 이메일 범위 |
|---|---|---|
| [AI Ride Diary](ai-ride-diary.md) | 비공개 일기 초안과 개인정보를 덜어낸 공유 카드 | 로그인한 라이더에게 비공개 요약을 보냅니다. |
| [자전거 출퇴근 일기](commute-diary.md) | 최근 7일 자출 횟수·거리·이동 시간·총 상승고도와 Orider 고정 회고 질문 | 합계와 질문을 본인 이메일로 보내며 답변은 수집하지 않습니다. 체크인·보관함·공유 카드는 직접 구현해야 합니다. |
| [Weekly Load Report](weekly-load-report.md) | 주간 훈련 부하 요약과 차트 카드 | 집계된 주간 리포트를 보냅니다. |
| [Hard-Day Streak Alert](hard-day-streak-alert.md) | 고강도 운동이 이어질 때 회복 알림 | 명시적으로 요청한 본인 이메일 알림을 보냅니다. |
| [Long-Ride Log Package](long-ride-log-package.md) | GPX/비공개 export 안내와 코치용 기록 초안 | 경로 파일이 아니라 요약과 체크리스트만 보냅니다. |
| [Monthly Ride Badge](monthly-ride-badge.md) | 공개에 안전한 진행 배지와 게시글 초안 | 배지 미리보기를 보냅니다. |

Creator Hub의 이메일 전송은 사용자가 그때 직접 요청한 경우에만 실행합니다. 정기 발송은 별도 동의와 구독 해지 경로, 방해 금지 시간·빈도 설정, 오남용 모니터링을 갖춘 뒤에만 켭니다. 한 번의 직접 요청을 정기 발송 동의로 간주하지 않습니다.

## 실행 가능한 예제

- [Weekly Load Report Node 예제](../../examples/recipes/weekly-load-report/README.md): Personal Data API key로 HTML 리포트, JSON 요약, 공개용 텍스트를 생성합니다.

## 검토 기준

Maintainer는 privacy, product fit, abuse risk, scope 최소화, 사용자-facing 설명을 기준으로 검토합니다. 아직 live API가 없는 recipe는 mock-backed 상태로 유지합니다.
