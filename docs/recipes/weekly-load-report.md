# Recipe: 주간 부하 리포트

영문 문서는 [weekly-load-report-en.md](weekly-load-report-en.md)를 참고하세요.

## Creator Hub 요약

최근 7일 훈련을 유료 운동 분석 리포트처럼 정리합니다. KPI 카드, 부하 차트, 전주 대비 변화, 대표 활동, 다음 행동을 한 화면 또는 이메일로 보여줍니다.

## 외부 개발자가 만드는 것

이 레시피는 오라이더가 대신 운영하는 서버 기능이 아니라, 라이더가 만든 Personal Data API key로 외부 도구에서 실행하는 개인 자동화입니다.

추천 산출물:

- `weekly-load-report.html`: 본인만 보는 private 리포트
- `weekly-load-summary.json`: Notion, Slack, n8n, 개인 대시보드에 넘길 집계 데이터
- `weekly-load-public-summary.txt`: 경로와 활동명을 뺀 공유용 요약

## 필요한 Scope

| Scope | 필수 여부 | 사용 목적 |
|---|---:|---|
| `activities:read` | 필수 | 최근 활동 목록, 거리, 시간, 상승고도, TSS/load 집계 |
| `fitness:read` | 권장 | CTL/ATL/TSB, readiness 같은 훈련 상태 해석 |
| `streams:read` | 선택 | 본인만 보는 private 리포트에 `GET /api/v1/activities/{activityId}/thumbnail.svg` 경로 썸네일 추가 |

기본 리포트는 `activities:read`, `fitness:read`만으로 만들고, 지도/경로 시각화는 사용자가 명시적으로 켠 경우에만 추가하세요.

## 리포트 구성

1. 상단 판정
   - 이번 주 상태: `가벼운 주간`, `빌드업`, `높은 부하`
   - 다음 행동: 회복, Z2 유지, 짧은 자극 추가 등

2. KPI 카드
   - 최근 7일 load
   - 직전 7일 대비 load 변화
   - 총 거리
   - 총 운동 시간
   - 활동 수와 활동일 수

3. 도표
   - 최근 7일 일별 load 막대 차트
   - 직전 7일 대비 거리/시간/load 변화표
   - 선택: CTL/ATL/TSB 스냅샷

4. 대표 활동
   - 가장 긴 활동
   - 가장 부하가 높은 활동
   - 선택: 본인 private HTML에만 지도/고도 썸네일

5. 공유용 요약
   - 정확한 출발/도착 위치, 경로 좌표, 활동명, 상세 심박/파워 원자료 제외
   - 예: `이번 주 3회 · 125km · 5시간 · load 97. 다음 강한 세션 전 회복감 확인`

## 바로 실행하는 예제

예제 스크립트는 [examples/recipes/weekly-load-report/weekly-load-report.mjs](../../examples/recipes/weekly-load-report/weekly-load-report.mjs)에 있습니다.

```bash
ORIDER_API_KEY=orid_xxx \
ORIDER_API_BASE=https://orider.co.kr/api/v1 \
node examples/recipes/weekly-load-report/weekly-load-report.mjs
```

출력:

- `weekly-load-report.html`
- `weekly-load-summary.json`
- `weekly-load-public-summary.txt`

private 지도 썸네일을 넣고 싶다면 `streams:read` scope가 있는 key를 만들고 아래 옵션을 켭니다. 예제는 `GET /api/v1/activities/{activityId}/thumbnail.svg`를 호출해 원본 좌표가 아닌 정규화 SVG를 HTML에 넣습니다.

```bash
ORIDER_INCLUDE_PRIVATE_MAPS=true \
ORIDER_API_KEY=orid_xxx \
node examples/recipes/weekly-load-report/weekly-load-report.mjs
```

이 옵션은 본인 PC에 저장하는 HTML용입니다. 커뮤니티 게시물, Slack 팀 채널, 공개 Notion에는 사용하지 마세요.

## n8n 구성

1. Cron 노드: 매주 월요일 08:00
2. HTTP Request 노드: `GET /api/v1/activities?limit=100`
3. HTTP Request 노드: `GET /api/v1/fitness/summary`
4. Function 노드: 최근 7일/직전 7일 집계와 load 차트 데이터 생성
5. HTML 또는 Markdown 노드: 리포트 템플릿에 값 채우기
6. Email/Notion/Slack 노드:
   - Email to self: private 리포트 가능
   - Notion: 집계값과 회고만 저장
   - Slack DM: 요약과 다음 행동만 전송

## GitHub Actions 구성

개인 저장소에서 실행할 때만 권장합니다. 공개 저장소에는 `ORIDER_API_KEY`를 넣지 마세요.

```yaml
name: Weekly Load Report

on:
  schedule:
    - cron: "0 23 * * 0" # Monday 08:00 KST
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node examples/recipes/weekly-load-report/weekly-load-report.mjs
        env:
          ORIDER_API_KEY: ${{ secrets.ORIDER_API_KEY }}
          ORIDER_API_BASE: https://orider.co.kr/api/v1
```

## 개인정보 기본값

- 외부 서비스에는 집계값을 먼저 보냅니다.
- 활동명은 개인 생활 패턴을 드러낼 수 있으므로 기본 제외합니다.
- route geometry, stream lat/lng, 출발/도착 지점은 공개 결과에 넣지 않습니다.
- 지도/경로 썸네일은 본인 private report에만 넣고, 공유 전 제거합니다.
- 이메일 자동 정기 발송은 별도 수신 동의, 중지 방법, 발송 주기 설정이 필요합니다.

## 확인 필요 항목

현재 공개 Personal Data API 문서의 활동 DTO에는 `mapImageUrl` 같은 완성 지도 이미지 URL이 안정 계약으로 포함되어 있지 않습니다. 외부 개발자는 다음 중 하나를 선택해야 합니다.

- 기본값: 지도 없이 집계 차트만 생성
- private 옵션: `streams:read`로 `GET /api/v1/activities/{activityId}/thumbnail.svg`를 호출해 정규화 SVG 썸네일을 받음
- 향후 API 확장: `publicSafeMapThumbnailUrl` 같은 redacted thumbnail 필드가 문서화되면 사용

문서에 없는 필드는 레시피에서 임의로 가정하지 마세요.

## Review Checklist

- [ ] 필요한 scope가 최소인지 확인
- [ ] 공개 결과에 route geometry와 출발/도착 위치가 없는지 확인
- [ ] API key가 코드, 로그, 스크린샷, PR에 없는지 확인
- [ ] 자동 실행 주기와 실패 재시도 정책을 명시
- [ ] private 리포트와 public summary를 분리
- [ ] 지도/썸네일 사용 시 `streams:read` 필요성과 공개 금지를 명시
