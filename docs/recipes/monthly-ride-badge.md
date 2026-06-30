# Recipe: Monthly Ride Badge 만들기

영문 문서는 [monthly-ride-badge-en.md](monthly-ride-badge-en.md)를 참고하세요.

## 목적

한 달의 라이딩 진행 상황을 public-safe badge로 요약합니다.

## 필요한 scope

- `activities:read`

## 표시 항목

- 총 거리
- 총 elevation
- ride count
- 가장 긴 ride의 aggregate summary
- 선택적 월간 목표 달성률

## 개인정보

- exact route, start location, riding routine은 표시하지 않습니다.
- public badge는 aggregate만 포함합니다.
- 라이더가 직접 public/share 여부를 선택해야 합니다.

## 예시 출력

> 2026년 6월: 612 km, 7,420 m 상승, 18 rides. 목표의 104% 달성.
