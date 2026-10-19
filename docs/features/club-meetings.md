# Club meetings / 동호회 모임

## 구현 범위

- 정상 클럽 회원은 사전 역할 선택 없이 모임을 개설합니다. 서버가 개설자를 주최자로 기록하고 본인 한 명만 처음 참석시킵니다.
- `kindId`와 표시 이름으로 종류를 저장합니다. 번개·투어 외의 종류도 작성할 수 있습니다.
- 코스 준비가 첫 단계입니다. 공개 코스, GPX, 공개 세그먼트에서 거리·누적 획고·체크포인트를 가져오고 기존 지도와 고도표를 재사용합니다. GPX에서 만든 구간은 모임 전용이며 공개 세그먼트를 새로 발행하지 않습니다.
- 참석·참석 취소·대기·자리 제안 수락과 회원에게 공개하는 참석·대기 명단을 제공합니다. 주최자 권한과 주최자 본인의 참석은 별개입니다.
- 수정·복사·초안 복구, 변경 공지와 확인, 신규 모집 마감, 전체 취소를 지원합니다. 주최자는 합류 지점별 이동 계획을 확인합니다.
- 모집 중 조를 만들고 조장·배정을 관리합니다. 드래그로 조 이동과 조 안 순서를 바꾸며, 일괄 이동·맞교환·키보드 위/아래 이동·되돌리기를 지원합니다. 처음 인원을 나누는 기준과 조별 선택 정원은 별개입니다.
- 취소·재신청을 서버 참석 세대로 구분해 이전 편집 배정을 복원하지 않습니다. 조 순서는 서버에 저장하고 회원들이 같은 명단을 확인합니다.
- 비용은 선택적인 예상 비용 안내입니다. 결제나 입금 확인 기능은 포함하지 않습니다.

## 저장 및 권한

`events/{eventId}`의 기존 참가자·대기 엔진이 정본입니다. `info.kind=CLUB_MEETING`으로 구분하고 상세 코스·장소·모집 소개는 서버 전용 `club_meeting/details` 문서에 저장합니다. 회원 검증을 거친 callable만 상세 정보를 반환합니다. 기존 공개 이벤트 루트의 시간·클럽 ID·개설자 ID까지 비공개인 구조는 아닙니다.

주최자와 본인만 이동 계획을 읽습니다. 공개 참가자 projection에는 클럽 모임을 포함하지 않습니다. 다른 사람의 대기 제안 토큰·개인 연락처·의료정보는 반환하지 않습니다. 기존 대회 등록·운영 API로 클럽 모임을 우회 변경할 수 없습니다.

초안은 로그인 사용자·클럽·새 모임/수정 모임별로 나누며 서버 저장 성공 후에만 제거합니다. 수정은 초안의 `baseRevision`으로 충돌을 검사합니다. 개설 재시도는 요청 ID와 본문 해시로 중복 생성을 막습니다.

## 경로와 서버 계약

- `/club/:groupId/events`: 기존 대회와 클럽 모임 목록
- `/club/:groupId/meetings/new`: 개설, `?copyFrom=eventId`: 복사
- `/club/:groupId/meetings/:meetingId`: 상세·참석·운영
- `/club/:groupId/meetings/:meetingId/edit`: 수정
- 기존 `/event/:eventId`는 클럽 모임이면 전용 상세로 연결

서버 API는 `createClubMeeting`, `updateClubMeeting`, `getClubMeetingSnapshot`, `listClubMeetings`, `clubMeetingAttendance`, `setClubMeetingRecruitment`, `cancelClubMeeting`, `publishClubMeetingNotice`, `confirmClubMeetingNotice`, `saveClubMeetingTeams`입니다. 상세 계약과 작성 필드 allowlist는 `src/services/clubMeetings.ts`와 서버의 `functions/src/event/club-meetings.ts`에 있습니다.

## 로컬 검증 환경

운영 데이터와 분리한 `demo-orider-club-meetings` 프로젝트를 사용합니다. Firestore 8189, Auth 9198, Functions 5109, 웹 5190을 사용하며 다른 작업의 기본 포트에는 접근하지 않습니다.

합성 회원·코스를 준비하고 HTTP 수용 검사를 실행할 수 있습니다.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node scripts/seed-club-meetings-emulator.cjs
node scripts/verify-club-meetings-emulator.mjs
```

웹 개발 서버에는 `VITE_USE_EMULATORS=true`, `VITE_AUTH_EMULATOR_PORT=9198`, `VITE_FIRESTORE_EMULATOR_PORT=8189`, `VITE_FUNCTIONS_EMULATOR_PORT=5109` 및 같은 demo 프로젝트의 Firebase 설정을 주입합니다. 공유 `node_modules`를 쓰는 여러 worktree는 `ORIDER_VITE_CACHE_DIR`을 서로 다른 경로로 지정합니다. 로컬 Google 인증 팝업에서 `주최라이더`를 고르면 일반 회원의 개설 동선을 검증할 수 있습니다.

검증 중에는 신규 모임 API와 프로필 확인 API만 로컬 Functions에 노출합니다. 운영 알림·메일·외부 전송을 실행하지 않습니다. 에뮬레이터의 함수 런타임은 이 기기의 Node 25로 실행됐으며 배포 대상 Node 22 환경은 별도 CI 확인 대상입니다.

## 검증 범위

합성 17명 모임을 바탕으로 인원·순서 변경을 검증하고, 별도 회귀 테스트와 에뮬레이터 모임으로 조장 유지, 취소·재신청, 대기 순번, 수정 충돌을 검증합니다. 드래그는 포인터 이벤트 테스트와 좌표·정리·자동 스크롤 회귀를 포함합니다. 실제 브라우저 연결이 끊겨 최종 시각 검수, 터치 감도와 브라우저 성능 검수는 완료하지 못했습니다.

## English

Active club members can create a meeting without selecting a role. The server assigns its creator as host and registers only that person initially. Meeting types are extensible. Course-first preparation reuses the platform map and elevation profile; GPX-derived sections belong to the meeting and do not publish global segments.

Attendance, cancellation, FIFO waitlists, place offers, member-visible rosters, editable drafts, copying, change notices and host travel summaries are supported. Costs are optional information only. Authoritative participation stays in the existing event engine. Detailed content requires membership-checked callables, while the existing public event envelope remains public. No production deployment is included in this local development work.

Hosts can arrange riding groups during recruitment, drag members between groups or reorder members within a group, select members for batch moves and swaps, and use keyboard ordering controls. Group limits are optional; initial splitting does not impose a fixed capacity. Saved ordering is shared with members. Attendance generations prevent cancelled and rejoined members from inheriting stale draft assignments. Final visual and real-device interaction acceptance remains pending because the browser connection was unavailable.
