# R7 클럽 초대 세션 교체 후속 — 2026-10-28

기준은 `origin/dev` `eb88c277c112319c07ad7cb80eb29db1c7d2a7d3`이다. #1345의 기존 기능을
재사용하고, 초대 가입 요청의 동일 UID 세션 교체 경계만 수정했다. 이 문서는 실기기 전체
여정, 운영 배포, OAuth 제공자 실인증 또는 클럽 가입 데이터 변경의 성공 증거가 아니다.

## 기존 연결

| 구간 | 현재 소스 / 동작 |
|---|---|
| 공유 초대 | `features/group/groupInviteLink.ts`의 `buildGroupInvitePath/Url`: 언어·정규화된 코드를 `/group/join/:code`에 보존. `App.tsx`는 `group/join/:code`와 `club/join/:code`를 같은 `GroupInvitePage`로 연결한다. |
| 로그인/가입 전후 복귀 | `GroupInvitePage`는 비로그인·익명일 때 같은 URL에서 `signIn`을 연다. `socialAuth.currentReturnTo/startSocialAuth`는 내부 목적지를 서버 state에 싣고 `SocialAuthCallbackPage`가 복귀한다. `Layout.buildOnboardingRedirectTarget`와 `OnboardingPage`는 `returnTo`를 이어간다. |
| 클럽 가입 | `GroupInvitePage` effect는 App Check 준비 후 기존 `joinGroupByCode`를 호출한다. active는 `/club/:groupId`, 승인 대기는 `/clubs`로 이동한다. 실패는 초대 URL을 유지하고 명시 재시도만 제공한다. |
| 활동 찾기 | `GroupDashboardPage`의 최근 라이딩 및 `/club/:groupId/rides` → `RideCard` → `/club/:groupId/rides/:rideId`. `useGroupRides`는 기존 `getGroupRideStats`, `useGroupRideActivities`는 ACL discovery `scope: groupRide`를 사용한다. |
| 같은 활동 상세 | `GroupRidePage` 비교표 기록 링크는 `/activity/:id`이다. `ActivityDetailRoute`의 ACL 판정 후 `PublicActivitySurface`도 기존 `ActivityPage`를 렌더한다. 별도 공개 상세나 계산 엔진을 만들지 않는다. |
| 첫 반응 | `KudosCommentsCard` → 공통 `ActivityPage`/`usePublicActivitySession.mutate` → 기존 `setActivityKudos` 및 bounded readback. 현재 접근권한·계정/활동 세대 검사와 실패 처리 재사용. |

## 확인한 결함과 변경

기존 초대 effect는 `uid`만 의존하고 응답에서도 `auth.currentUser.uid`만 비교했다.
가입 요청 A 진행 중 SDK User가 동일 UID의 새 객체 B로 교체되면, A의 늦은 성공이 B를
클럽으로 이동시키거나 A의 늦은 거절이 B에게 실패 안내를 표시했다. App Check 대기 중
SDK 교체도 기존 요청을 dispatch할 수 있었다.

수정은 시작 시 현재 SDK User를 캡처하고 App Check 전후/응답/실패/finally에서 같은 객체인지
검증한다. AuthProvider의 User 교체는 effect를 취소·재시작하여 현재 초대 코드로 새 세션의
가입 흐름을 이어간다. UID 일치·비익명 조건은 유지한다. 이미 서버에 도달한 이전 요청을
취소했다고 주장하지 않으며, 서버 가입·ACL 계약은 변경하지 않는다.

## 검증과 한계

- 신규 3회귀: 동일 UID 교체 후 이전 성공/실패 무시, App Check 대기 중 이전 요청 dispatch 차단.
  기존 코드에서 3 FAIL/23 PASS, 수정 후 초대 2 suites 26 PASS.
- 로그인 gate, onboarding returnTo, social callback, 클럽 기록/게시물 및 반응 UI를 포함한
  9 suites 136 PASS, 공개 상세 반응 session 1 suite 30 PASS: 총 10 suites/166 tests.
  SDK는 mock이며 실제 React/AuthProvider/라우터의 로컬 행동 회귀다.
- Node 22.23.4, 전체 TypeScript `tsc --noEmit -p tsconfig.json`와 변경 3파일 ESLint PASS.
- 첫 확장 검사의 Layout 5 FAIL은 공유 node_modules의 `hls.js` 누락이었다. 이 worktree만
  lockfile 기반 독립 설치 후 동일 검사 통과. 최초 로그는 외부 증거에 보존했다.
- 실제 브라우저 로그인 제공자, 앱 설치/미설치, 카카오 미리보기, 실기기 초대→가입→활동→
  첫 반응 완주 및 운영은 이번 검증에 포함하지 않았다. #1345 전체 완료를 주장하지 않는다.
- 기존 데이터/분석 snapshot·관계·runtime·다른 worktree 변경, 백필/재계산, push/배포 없음.

외부 증거: `/Users/kyoungnam/Documents/Codex/2026-10-28/r7-web-club-return/`의
`red.log`, `green-final.log`, `journey-focused.log`(최초 환경 실패), `journey-final.log`,
`types-isolated.log`, `lint-isolated.log`, `public-reaction.log`, `results.json`.
