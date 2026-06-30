# Recipe: Long-Ride Log Package 만들기

영문 문서는 [long-ride-log-package-en.md](long-ride-log-package-en.md)를 참고하세요.

## 목적

긴 라이딩을 training log나 coach report에 붙일 수 있는 package로 정리합니다.

## 필요한 scope

- `activities:read`
- `streams:read`
- `exports:read`

## 포함 항목

- ride summary
- distance, moving time, elevation, average power/HR
- 선택적 GPX/TCX/FIT export
- coach-ready markdown checklist
- public 공유용 redacted 요약

## 개인정보

- export 파일은 기본 private download입니다.
- public card에는 exact route geometry를 포함하지 않습니다.
- external sync를 하면 전송 대상과 보관 위치를 명시합니다.

## 예시 출력

```md
## Long Ride Log

- Distance: 84 km
- Moving time: 3h 12m
- Focus: endurance + pacing
- Coach note: 후반 power fade가 있어 다음 장거리 전 보급 계획을 조정합니다.
```
