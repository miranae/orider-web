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

## 초대 로그인 대기·재시도 후속 (기준 73dac49f, 2026-10-28)

#1345의 위 기존 연결은 유지한다. 초대 화면만 `signIn`을 직접 호출하여 대기 표시와
중복 방지가 없었다. AuthProvider는 새 `signIn` 호출 때 기존 대기 promise를 취소한다.
반면 기존 `ClubLoginGate`는 중복 실행 방지·취소·실패 처리가 이미 있었다.
그 동작을 `useInPlaceSignIn`으로 추출해 두 화면에서 재사용했다. 초대 화면은 로그인 중
버튼을 비활성화하고, 취소 뒤 같은 URL에서 다시 시작할 수 있다. 호출이 실패로 끝나면
기존 공통 로그인 실패 문구로 재시도를 안내한다. Google 제공자의 실패는 기존 로그인
대화상자 처리 범위이며 이 수정이 실제 OAuth 실패를 재현했다고 주장하지 않는다.

- 초대 경로·query·hash 보존, 호출 실패 후 재시도, pending 중 중복 방지/취소 후 재시도:
  수정 전 신규 3개 중 2 FAIL/1 PASS, 수정 후 기존 클럽·초대·AppCheck 포함 4 suites/32 PASS.
- 신규 초대 로그인 검사는 Auth `signIn` promise를 제어하는 React/라우터 테스트다.
  기존 초대/AuthProvider 테스트도 함께 통과했다. 실 OAuth·기기·운영 완주는 별도다.
- 전체 TypeScript 및 변경 파일 ESLint 통과. 서버·ACL·가입/반응 mutation·분석 snapshot·
  원본·관계·에뮬레이터 변경 및 자동 계산/백필 없음. 새 전체 suite 결과는 주장하지 않는다.
- 증거: `/Users/kyoungnam/Documents/Codex/2026-10-28/r7-invite-login-recovery/`
  `red.log`, `focused.log`, `types.log`, `lint.log`.

클럽 게시물/라이딩 진입과 공통 상세/반응 연결은 위 기존 구현을 재사용한다. 카카오/OG의
운영 캐시 철회, 설치 유무를 포함한 실기기 여정, 자체 구간 모집단·부정기록 정책의 운영
수용은 이 좁은 로그인 회귀로 완료 처리하지 않는다.

## 최신 누적 로컬 게이트 (2026-10-28)

R6 시각 개선 `73dac49f`와 R7 초대 로그인 복구를 포함한 제품 HEAD
`88fac4a3118f811467e3277ef24c447c46fa557a`에서 Node **22.23.4**, worker **2**로 검사했다.
전체 Vitest **956 files / 10,172 tests PASS, 0 FAIL** (266.45초), `test:contracts`,
`lint:budget`, `quality:budget`, `build:dev` 모두 exit 0이다. 검증 전후 HEAD 동일,
tracked/untracked worktree 변경 없음. 이 문서 추가 커밋은 제품 코드를 바꾸지 않는다.

증거: `/Users/kyoungnam/Documents/Codex/2026-10-28/web-final-88fac4a3/results.json` 및
같은 디렉터리의 `vitest.log`, `contracts.log`, `lint.log`, `quality.log`, `build.log`.
이전 단계의 수치/실패 증거는 그대로 보존했다. 공유 에뮬레이터·브라우저 fixture 반복·
사용자 데이터/관계·분석 결과·백필·재계산·원격 push/PR/배포 변경은 없다.
이 게이트는 실제 OAuth/호스팅/실기기/운영 수용 검증을 대체하지 않는다.

## 독립 실제 SDK 브라우저 후속 (제품 88fac4a3)

새 demo 프로젝트와 전용 Auth9339/Firestore8429/Functions5069/WEB5399에서 실제
AppRoot·AuthProvider·공통 상세를 사용했다. 1280/390 각각 로그인 이후 가입200 →
클럽/라이딩/활동 진입 → 좋아요200 및 Firestore 멤버십/좋아요 readback을 확인했다.
Google popup은 외부 `apis.google.com` 차단으로 실패하여 로그인만 기존 `__e2eSignIn`의
실제 Auth emulator SDK로 대체했다. 완전한 OAuth UI 여정 성공으로 표현하지 않는다.
로컬 wrapper만 AppCheck attestation을 생략했고 실제 Auth/ACL 구현은 재사용했다.
추가 owner-anchor discovery403은 각1회 관측되어 HTTP 전체 무오류도 주장하지 않는다.

합성 seed의 legacy inviteCode/삭제필드 누락에 따른 초기 실패를 보존했다. 정정 뒤
승인된 두 여정의 활동 payload/hash/updateTime은 동일했고 멤버십/좋아요는 원복했다.
전용 listener 모두 종료 확인. 제품 수정·공유 서비스·기존 데이터·분석·원격 변경 없음.
UI/HTTP 증거와 제한: `/Users/kyoungnam/Documents/Codex/2026-10-28/r7-isolated-journey/README.md`,
`results.json`, `ui/journey-1280.json`, `ui/journey-390.json` 및 해당 PNG.
이 합성 화면의 미제공 메모/경로 안내는 제한된 wrapper/fixture 범위이며 R7 전체 수용이나
실기기·운영·OG/공유 정책 완료 증거로 대체하지 않는다.
