# 구간 순위의 현재 권한 및 인증 세션 검증

2026-10-26 로컬 검증. 제품 커밋 `6f7e3f6f`. 배포/실기기/전체 앱 라우터 검증을 뜻하지 않는다.

## 변경과 경계

- 서비스는 호출 시작 시 Auth/Functions 앱과 SDK 사용자 객체를 함께 고정한다. 같은 UID라도 SDK 세션이 바뀌면 AppCheck 대기 뒤 전송하지 않고 이미 도착한 응답도 폐기한다.
- AppCheck를 포함한 요청 대기는 10초로 제한한다. AbortSignal은 UI 대기/응답 수용을 취소하며 이미 전달된 HTTP/서버 작업의 취소를 의미하지 않는다.
- 화면은 표시 중 30초마다 현재 페이지의 권한을 다시 확인한다. 초점 복귀 시에도 재조회하며 hidden 상태에서는 기존 결과를 즉시 숨긴다. 재조회 중과 네트워크/권한 실패 뒤 기존 순위를 남기지 않는다.
- 빠른 hidden→visible 전환은 직전 focus의 500ms 중복 억제와 별개로 재검사한다. visible+focus 연속 이벤트는 중복 표시 요청을 만들지 않는다.
- 서버의 공개 활동/양방향 차단/현재 팔로잉 판정은 유지한다. 타인의 raw activity로 우회하지 않는다.

## 회귀

- 서비스/컴포넌트 2개 suite 16 tests PASS. 같은 UID의 SDK 교체, AppCheck 도중 교체, Functions 앱 교체, timeout/abort 뒤 늦은 dispatch 방지, 30초 실패 제거, hidden 늦은 응답 및 빠른 복귀를 포함한다.
- 전체 WEB: 927 files / 9,761 tests PASS, 114.14초. `npm test -- --maxWorkers=2`에 연결된 계약검사도 성공했다. 이 전체 수에 위 focused 회귀가 포함되므로 합산하지 않는다.
- Node22 TypeScript/scoped ESLint PASS. `npm run build:dev`, `lint:budget`, `quality:budget` PASS. production 배포 환경의 빌드는 이 증거에 포함하지 않는다.

## 실제 SDK 증거

외부 디렉터리 `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882/leaderboard-lifecycle`.

- `demo-leaderboard-lifecycle`의 합성 viewer/author와 활동1개/구간1개만 사용한다. Functions5089/Auth9339 및 Firestore8398의 독립 namespace다. 기존 main/legend/R6 프로젝트는 변경하지 않았다.
- `results-8f3.json`: 실제 SDK `setActivitySubscription`/`getSegmentLeaderboard` 10요청 전부 HTTP200, pageErrors0. 팔로우 전 미노출→팔로우 후 노출→취소 후 focus 제거, 복귀 시 실제 재조회, 실제 30초 경과 후 취소 반영을 확인했다.
- 표시에는 실제 제품 `SegmentLeaderboard`를 사용한다. 합성 자료는 실제 helper로 source stamp를 작성했으며 실제 기록기/파일 업로드 producer 증거가 아니다.
- Headless Chrome의 visibility는 DOM 이벤트를 명시 주입했다. 이는 제품 이벤트 처리+실제 API 결합 검증이며 OS의 실제 백그라운드/복귀 검증은 아니다. focus도 명시 이벤트다.
- `following.png`를 390px에서 직접 시각 검토했다. `unfollowed.png`는 결과 제거 상태다.
- 8f3 서버 snapshot은 현재 구독 계약 증거이며 이후 240회/시간 정책 수정 전이다. 최종 snapshot 별도 재확인은 아래와 같다.

로컬 검토 URL: http://127.0.0.1:5274/ko . 합성 인증 파일은 공개/커밋하지 않는다. 정리는 외부 `cleanup.cjs --execute`로 exact fixture/Auth viewer만 제거한다. 반복 검토용 자료와 서버는 현재 보존한다.

## 최종 서버 연결 재확인

- 서버 source `8257f010fa83`, immutable `d3dc8d993397680b0a9a3cca7796f0c78ebd3ef8e653492785033dc6d1cd4616`. 이 검증의 Functions5089 wrapper만 교체하고 별도 hub4529에서 등록을 다시 읽었다. main/다른 데모 runtime은 변경하지 않았다.
- `final-results.json`: 실제 follow→순위 조회, API transport 실패→기존 결과 제거, 연결 복구→unfollow→명시 새로고침에서 0명 확인. 완료된 callable 4건 모두 HTTP200, pageErrors0. 네트워크 실패는 Playwright request abort로 만들었으며 성공/실패 JSON 응답을 대체하지 않았다.
- `final-following.png`, `final-offline.png`, `final-unfollowed.png`. 실패 화면은 오류 문구와 새로고침 버튼만 남고 이전 회원 기록은 없어졌음을 직접 시각 확인했다.
- 240회/시간 정책은 서버 scoped 회귀 근거다. 실제 UI 실행에서 240회/h 소진 시험을 했다고 주장하지 않는다. 기존 30초 자동 갱신 및 hidden 이벤트 증거는 `results-8f3.json`에 그대로 보존한다.
