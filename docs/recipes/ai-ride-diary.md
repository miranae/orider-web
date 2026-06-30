# Recipe: AI Ride Diary 만들기

영문 문서는 [ai-ride-diary-en.md](ai-ride-diary-en.md)를 참고하세요.

## 목적

라이더의 최근 활동을 바탕으로 private diary 초안을 만들고, 원하면 redacted share card로 공유합니다.

## 필요한 scope

- `activities:read`
- `streams:read`
- `fitness:read`

## 데이터 흐름

1. 최근 활동과 필요한 stream/fitness summary를 읽습니다.
2. 정확한 route, 시작 위치, 민감한 health/social 정보를 redaction합니다.
3. Orider server-side AI credit으로 diary draft를 생성합니다.
4. 기본값은 private draft입니다.
5. 라이더가 선택하면 public-safe card만 공유합니다.

## 개인정보

- provider API key를 browser나 recipe에 넣지 않습니다.
- exact route geometry는 공유 카드에서 제외합니다.
- fatigue, injury risk, health metric은 기본 private입니다.
- share 전 redaction preview가 필요합니다.

## 예시 출력

> 이번 주는 긴 endurance ride와 짧은 고강도 구간이 섞였습니다. 부하는 올라갔지만 회복 여지가 줄었으니 다음 세션은 Z2 중심으로 두는 것이 안전합니다.

## 상태

Creator Hub flagship recipe로 관리합니다. Email-to-self는 본인 verified email로만 보냅니다.
