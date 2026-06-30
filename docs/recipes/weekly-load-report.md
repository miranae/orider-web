# Recipe: Weekly Load Report 만들기

영문 문서는 [weekly-load-report-en.md](weekly-load-report-en.md)를 참고하세요.

## 목적

최근 7일과 12주 흐름을 바탕으로 훈련 부하를 요약합니다.

## 필요한 scope

- `activities:read`
- `fitness:read`

## 출력

- 이번 주 TSS 또는 load
- CTL/ATL/TSB 경향
- ride count와 total time
- 다음 주 주의점
- public-safe chart 또는 private email-to-self

## 개인정보

- chart는 aggregate만 표시합니다.
- route와 start location은 제외합니다.
- email은 로그인한 라이더 본인의 verified email로만 보냅니다.

## 예시 출력

> 이번 주 load는 420 TSS로 지난 4주 평균보다 18% 높습니다. TSB가 낮아졌으므로 다음 48시간은 회복을 우선하세요.
