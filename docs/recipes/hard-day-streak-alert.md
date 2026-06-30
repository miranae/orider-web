# Recipe: Hard-Day Streak Alert 만들기

영문 문서는 [hard-day-streak-alert-en.md](hard-day-streak-alert-en.md)를 참고하세요.

## 목적

고강도 또는 높은 부하의 날이 연속될 때 회복 경고를 보여 줍니다.

## 필요한 scope

- `activities:read`
- `fitness:read`

## 로직 예시

1. 최근 7~14일 활동을 읽습니다.
2. TSS, intensity, HR zone, hard-day 기준을 계산합니다.
3. hard day가 3일 이상 이어지면 recovery warning을 만듭니다.
4. 결과는 private alert로 표시합니다.

## 개인정보

- 정확한 route나 시작 위치는 필요하지 않습니다.
- 외부 알림으로 보낼 경우 aggregate 수치만 포함합니다.
- 반복 알림은 별도 opt-in, frequency, unsubscribe가 필요합니다.

## 예시 출력

> 최근 3일 연속 고강도 부하가 누적됐습니다. 오늘은 Z2 45분 이하 또는 휴식을 권장합니다.
