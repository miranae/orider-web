# Creator Showcase 방향

GitHub는 기여 통로이고, 라이더가 실제로 발견하고 사용하는 표면은 Orider 제품 안에 있어야 합니다. Creator Showcase는 라이더가 자신의 데이터로 만든 recipe, chart, AI diary, report, alert, widget을 안전하게 발견하고 공유하는 방향입니다.

영문 문서는 [CREATOR_SHOWCASE-en.md](CREATOR_SHOWCASE-en.md)를 참고하세요.

## 제품 목표

개인 활동 데이터를 노출하지 않으면서 personal-data creation을 재사용 가능하게 만듭니다.

의도한 흐름:

1. 라이더가 자신의 Orider 데이터를 연결하거나 export합니다.
2. chart, AI diary, report, alert, widget, automation을 만듭니다.
3. recipe, showcase card, share link로 게시합니다.
4. 다른 라이더는 필요한 데이터, scope, privacy note를 이해하고 안전하게 시도합니다.

## 주요 표면

| Surface | 대상 | 목적 |
|---|---|---|
| Creator Hub | 라이더와 개발자 | recipe, app, card, example 발견 |
| Recipe Page | builder | 작동 방식, scope, setup, privacy, output 설명 |
| Showcase Card | 라이더 | raw private data 없이 결과 공유 |
| Public Share Link | 라이더 | 선택한 output을 link-only/public으로 공유 |
| Community Post Composer | 라이더 | output을 편집 가능한 Orider post로 변환 |
| Email-to-self | 라이더 | 검토된 recipe 결과를 본인 인증 이메일로 전송 |
| Developer Profile | builder | 만든 사람, follow/report 경로 표시 |

## Creation 유형

| 유형 | 예시 | 공유 방식 |
|---|---|---|
| Chart | weekly load, FTP trend, zone-time tracker | screenshot/card, public-safe chart, recipe |
| AI diary | weekly ride diary, recovery note | 기본 private, 선택적 redacted share card |
| Alert | hard-day streak, missed Z2 target | recipe, notification preview |
| Report | monthly summary, coach recap | PDF/markdown export, link-only page |
| Widget | personal site recent ride card | public-safe embeddable card |
| Automation | Notion log, Google Sheets sync, Discord reminder | recipe와 setup checklist |

## 대표 recipe

Creator Hub는 maintainer-reviewed flagship recipe로 시작합니다.

| Recipe | 결과 | 전달 방식 |
|---|---|---|
| AI ride diary | private diary draft와 redacted card | Orider AI credit, share card, email-to-self |
| Weekly load report | 12주 load chart와 weekly digest | dashboard card, share card, email-to-self |
| Hard-day streak alert | hard day 누적 시 recovery warning | in-app 방향, email-to-self, 향후 recurring alert |
| Long-ride log package | GPX/private export와 coach-ready checklist | private download, Notion-ready notes, email-to-self |
| Monthly ride badge | public-safe monthly progress badge | widget/card, email-to-self preview |

Email delivery는 로그인한 라이더 본인의 verified email로만 보냅니다. 임의 recipient는 지원하지 않습니다.

## 현재 상태

- Creator Hub는 metadata 기반 flagship recipe card를 렌더링합니다.
- 검토된 flagship recipe는 email-to-self delivery를 실행할 수 있습니다.
- email callable은 Firebase Auth와 App Check를 요구합니다.
- rider별 하루 5회로 rate limit합니다.
- sent-email log는 recipe, masked recipient, language, timestamp, quota state를 기록합니다.
- 2026-06-28 production E2E에서 인증 UI delivery, callable success, success state, sent-log creation, quota decrement를 확인했습니다.

## AI Ride Diary 기준

AI ride diary는 위치, 루틴, fitness, fatigue, injury risk, social pattern을 드러낼 수 있으므로 기본 private이어야 합니다.

내장 generation path는 다음을 지켜야 합니다.

- provider API key를 browser나 plugin에 노출하지 않음
- Orider가 server-side에서 AI provider 호출
- rider별 하루 5회 generation
- App Check, Auth, server-side rate limit, audit log
- rider가 share mode를 고르기 전까지 private draft

공유 옵션:

| 모드 | 공유 내용 |
|---|---|
| Private draft | 라이더만 보는 전체 diary |
| Redacted card | 요약, aggregate stat, 선택 문장, 정확한 경로/시작 위치 제외 |
| Link-only diary | 라이더가 선택한 텍스트와 chart |
| Community post | 라이더가 명시적으로 게시하는 편집 가능한 copy |
| Recipe | demo data만 포함한 생성 방법 |

## 공개 저장소 역할

이 저장소는 다음의 source of truth입니다.

- recipe markdown
- sample/demo output
- public API contract와 sample response
- reusable utility
- review checklist
- showcase contribution template

제품 안의 Orider는 사용자-facing distribution surface입니다: browse, try, save, share, report, revoke.

## 남은 작업

- recurring email digest/alert opt-in
- developer profile, featured creator placement, usage count
- Personal Data API scope 확장
- public output report/abuse handling 고도화
