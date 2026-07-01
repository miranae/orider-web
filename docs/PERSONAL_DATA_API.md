# Personal Data API 안내

Orider의 공개 개발 방향은 personal data access입니다. 라이더가 자신의 Orider 데이터를 dashboard, notebook, alert, report, automation에 안전하게 사용할 수 있어야 합니다.

영문 문서는 [PERSONAL_DATA_API-en.md](PERSONAL_DATA_API-en.md)를 참고하세요.

## 방향

현재 API는 작은 live foundation입니다. 선택된 개인 데이터에 대해 owner-only read access와 scoped developer API key를 제공합니다. 더 넓은 third-party app platform은 아직 초기 단계입니다.

의도한 모델:

> 로그인한 라이더가 자신의 Orider 데이터에만 제한된 token을 발급하고, 그 데이터를 개인 도구와 community recipe에 사용한다.

GitHub는 개발자 기여 채널입니다. 라이더가 recipe를 발견하고 시도하는 표면은 Orider의 Creator Showcase가 담당합니다. [CREATOR_SHOWCASE.md](CREATOR_SHOWCASE.md)를 보세요.

## 만들 수 있는 것

| 용도 | 예시 |
|---|---|
| 개인 dashboard | weekly load, FTP trend, zone time, monthly distance, elevation, recovery |
| alert/automation | rest-day warning, missed Z2 target, hard-day streak, event prep reminder |
| report | weekly training report, monthly progress summary, coach export |
| external sync | Google Sheets, Notion, personal website, Slack, Discord |
| AI workflow | 최근 4주 요약, fatigue 설명, 다음 주 훈련 메모 초안 |

## API 계약

정식 endpoint 계약은 OpenAPI 문서를 단일 진실원으로 사용합니다.

- Swagger UI: `/api/v1/docs`
- OpenAPI YAML: `/api/v1/docs/openapi.yaml`

이 문서는 방향, scope 의미, 개인정보 원칙, recipe 작성법을 설명합니다. endpoint path, request/response schema, content type, error code는 Swagger/OpenAPI에서 확인하세요.

개인 API key는 `X-API-Key: orid_...` 헤더로 사용합니다. 제품에서는 **Settings -> Developer API**에서 생성, 복사, 폐기합니다.

## 첫 공개 scope

첫 버전은 read-only이고 인증된 라이더 자신의 데이터로 제한합니다.

| Scope | 허용 |
|---|---|
| `profile:read` | 기본 profile과 public-safe account metadata 읽기 |
| `activities:read` | 본인 activity 목록/상세 읽기 |
| `streams:read` | 본인 activity stream 읽기 |
| `fitness:read` | training load, fitness, readiness, summary snapshot 읽기 |
| `exports:read` | 본인 activity export format 생성/조회 |

첫 버전에 포함하지 않는 것:

- write access
- activity 삭제/수정
- 친구의 private activity 읽기
- club/member administration
- raw provider token
- backend job control
- service account access

## 응답 원칙

Activity 응답은 raw Firestore document가 아니라 public-safe DTO를 사용해야 합니다. 내부 field, 비정규화 cache, provider token, raw OAuth refresh token은 응답하지 않습니다.

예시:

```json
{
  "id": "act_123",
  "type": "Ride",
  "startTime": "2026-06-28T07:30:00.000Z",
  "distanceMeters": 42195,
  "movingTimeSeconds": 5820,
  "elevationGainMeters": 610,
  "averageSpeedKph": 26.1,
  "averageHeartRate": 148,
  "averagePower": 202,
  "normalizedPower": 229,
  "tss": 86,
  "visibility": "private"
}
```

Stream 응답은 단위와 array alignment를 명확히 해야 합니다.

```json
{
  "activityId": "act_123",
  "timeSeconds": [0, 1, 2],
  "latlng": [[37.5665, 126.9780]],
  "altitudeMeters": [35],
  "heartRateBpm": [145],
  "powerWatts": [210],
  "cadenceRpm": [88]
}
```

## 보안 요구사항

Personal Data API는 server-side enforcement가 필수입니다. 프론트엔드 체크는 UX일 뿐 권한 검사가 아닙니다.

최소 요구사항:

- 인증된 Orider account에서 token 발급
- 명시적 scope와 token revocation
- 모든 요청에서 owner-only access check
- token/user별 rate limit
- token 생성/사용/폐기 audit log
- provider secret과 raw OAuth refresh token 미노출
- private activity visibility 존중
- 다른 사용자의 resource 존재 여부를 노출하지 않는 safe error

## Recipe 공유

좋은 recipe는 다음을 포함합니다.

- signed-in rider 본인 데이터만 사용
- 필요한 scope
- frontend code에 long-lived secret 없음
- expected rate와 polling interval
- privacy note
- screenshot, chart, example output

추천 recipe:

- weekly load summary를 Discord로 보내기
- 개인 CTL/ATL/TSB chart 만들기
- 최신 ride를 GPX로 export해서 training log에 첨부하기
- long ride마다 Notion page 만들기
- hard day가 3일 연속이면 경고하기

템플릿은 [recipes/personal-data.md](recipes/personal-data.md)를 보세요. 리포트형 recipe는 [recipes/report-template.md](recipes/report-template.md)를 기준으로 작성하고, 실행 가능한 예제는 [examples/recipes/weekly-load-report](../examples/recipes/weekly-load-report)를 참고하세요. endpoint 세부 계약은 Swagger/OpenAPI를 참조하세요.

## 결과 공유

결과 공유는 명시적 visibility와 redaction control을 가져야 합니다.

| 결과 | 안전한 기본값 |
|---|---|
| AI ride diary | private draft, 선택적 redacted card |
| Weekly load chart | 정확한 route/start location 없는 aggregate chart |
| Recovery alert | private notification preview 또는 anonymized screenshot |
| Personal website widget | 라이더가 선택한 public-safe recent ride summary |
| Coach report | 기본 private export |
