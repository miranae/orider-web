# Recipe: Z2 Target Reminder 만들기

영문 문서는 [z2-target-reminder-en.md](z2-target-reminder-en.md)를 참고하세요.

## 목적

주간 Z2 목표 시간이 부족할 때 라이더에게 reminder를 보냅니다.

## 필요한 scope

- `activities:read`
- `streams:read`
- `fitness:read`

## 로직 예시

1. 이번 주 활동을 읽습니다.
2. HR/power zone 기준으로 Z2 시간을 계산합니다.
3. 목표 대비 부족분을 계산합니다.
4. 남은 요일과 회복 상태를 고려해 reminder 문구를 만듭니다.

## 개인정보

- 정확한 route는 필요하지 않습니다.
- public 공유 결과에는 weekly aggregate만 표시합니다.
- recurring reminder는 opt-in, quiet hours, unsubscribe가 필요합니다.

## 예시 출력

> 이번 주 Z2 시간이 목표보다 55분 부족합니다. 토요일 전 45~60분 쉬운 endurance ride를 추가하면 목표에 가까워집니다.
