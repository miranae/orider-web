# Recipe: Long-Ride Log Package

영문 문서는 [long-ride-log-package-en.md](long-ride-log-package-en.md)를 참고하세요.

## 목적

긴 라이딩 하나를 코치, Notion, 개인 훈련 로그에 바로 붙일 수 있는 기록 패키지로 정리합니다. 단순히 GPX 링크를 보내는 것이 아니라, 다음 롱라이드의 기준점이 될 지표와 회고 질문을 함께 만듭니다.

## 필요한 scope

- `activities:read`
- `streams:read`
- `exports:read`

## 포함 항목

- 최근 30일 최장 라이딩 후보 선정
- 거리, 이동 시간, 평균 속도, 상승고도, 평균 심박/파워 기준값
- Notion이나 코치 메시지에 붙일 Markdown 기록 초안
- 보급, 페이스, 후반 30분 상태, 회복 메모 템플릿
- 선택적 GPX/TCX/FIT export 안내
- public 공유용 redacted 요약 기준

## 개인정보

- export 파일은 기본 private download입니다.
- 이메일에는 GPX/TCX/FIT 파일을 첨부하지 않습니다.
- public card에는 출발/도착 위치, exact route geometry, 상세 stream을 포함하지 않습니다.
- external sync를 하면 전송 대상과 보관 위치를 명시합니다.

## 예시 출력

```md
# 2026-06-28 롱라이드 기록

- 활동: Afternoon Mountain Bike Ride
- 거리: 84.0km
- 이동 시간: 3시간 11분
- 평균 속도: 26.4km/h
- 상승고도: 193m
- 평균 심박: 143bpm
- 평균 파워: 124W

## 오늘의 기록
- 목적: endurance / 거리 적응 / 코스 답사 중 선택
- 잘 된 점:
- 어려웠던 점:
- 후반 30분 상태:

## 보급 로그
- 출발 전:
- 주행 중 탄수화물:
- 수분/전해질:
- 다음번 수정:

## 코치에게 물어볼 것
- 이 강도로 장거리 비중을 늘려도 되는지
- 다음 롱라이드 전 보급량을 얼마나 늘릴지
- 회복주/다음 고강도 배치
```
