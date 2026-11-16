# 버튼 크기 소스 전수 점검 / Button sizing source audit

## 범위 / Scope

2026-11-16, PR #1676의 모임 관전·Discord 수정 후 `src/` 전체를 점검했다.
테스트를 제외한 TSX를 TypeScript AST로 훑어 `Button`, `IconButton`, native `button`,
버튼 스타일 링크(`a`, `Link`, `LocalizedLink`)의 크기·전체 폭 지정·부모 레이아웃을 목록화했다.
별도로 `buttonClass()` 호출, 기능 CSS의 버튼 크기 규칙, 공용 버튼 구현과 기존 수정 이력을 확인했다.

- 최초 AST 목록: 293파일, 1,337개 선언. 카탈로그를 제외하면 292파일, 1,316개 선언.
- 이 숫자는 소스 선언 수이며 실제 렌더된 버튼 수나 화면별 시각 검수 수가 아니다.
- `src/`의 CSS 전체를 검색하고 버튼 selector의 크기 선언을 별도 추출했다.
- 범위: 클럽·모임·관전, 활동 상세·분석·기록, 코스·구간·이벤트, 훈련·피트니스·코치,
  알림·관계·피드, 공유·사진, 설정, 임베디드 공개 화면, 공용 컨트롤.

We inspected the entire public-web source, including explicit sizes, inherited layout stretching,
button-style links and feature CSS that overrides shared controls. Counts describe declarations,
not rendered instances or visually accepted screens.

## 확인한 원인과 조치 / Findings and repairs

| 유형 | 영향 범위 | 조치 |
| --- | --- | --- |
| 보조 동작에 남은 `lg`·기본 크기 | 파워·기록 분석, 피드 더 보기, 임베디드 재시도, 클럽 관리 | 역할에 맞는 공용 `sm` 사용 |
| 작은 버튼을 다시 키우는 CSS | 클럽, 설정, 코스·구간·이벤트, 활동 기록·분석, 게시판, 코치, 공유·사진 | 기능 CSS의 높이·padding 강제를 제거하거나 공용 컨트롤을 대상에서 제외 |
| grid·세로 Stack의 기본 stretch | 코스 가져오기·합류 지점 편집, 모임 공지·취소 확인, 알림, 공개 활동·사진·댓글 더 보기 | 기존 액션 행 또는 공용 가로 Stack으로 내용 너비 유지 |
| 페이지별 버튼 스타일 덮어쓰기 | 클럽 기록 필터·더 보기 | 공용 variant·size로 표현 |
| 강제 높이 제거 시 긴 레이블 줄바꿈 유실 | Strava 게시·연결, 공유·사진 작업, 분석 도구 | 전체 폭을 강제하지 않는 공용 `wrap` 옵션으로 줄바꿈과 크기별 최소 높이 유지 |
| 안전한 공용 컨트롤 제외를 덮어쓰기로 오인 | CSS 소유권 검사 | `:not()` 안의 제외와 실제 공용 컨트롤 선택을 구분하고 회귀 테스트 추가 |

관련 기능 CSS의 기존 허용 예외 16개를 삭제했다. 새로운 예외는 추가하지 않았다.
알림·재시도·페이지 이동·기간 추가/제거·검사·복원 같은 보조 동작과 주요 제출을 구분했다.
서로 대안인 제출·취소는 같은 크기를 유지한다. `sm`의 터치 영역은 공용 컴포넌트가 보장한다.

Repairs use shared sizes and action-row layout. Feature CSS no longer inflates affected compact
controls. Existing permission checks, requests, links, confirmation steps and domain behavior remain
unchanged. Paired form actions retain equal sizes; the shared control retains its touch target.

## 유지한 표현 / Intentional presentations

- 소셜 로그인, 실제 운동 시작, 주요 양식 제출.
- 목록 항목·선택 카드 전체가 클릭 대상인 화면.
- 긴 질문 전문, 설명을 포함하는 코치 제안, 분석 펼침 제목.
- 입력·선택 컨트롤의 조작 높이. 버튼의 크기 수정과 구분했다.

Primary submissions, sign-in, workout start, whole-item selection surfaces and full-text question
cards retain their intended presentation. Input and select sizing is preserved.

## 검증의 한계 / Verification limits

검증 명령과 결과는 PR 본문에 기록한다. 이 점검은 소스·CSS·컴포넌트 동작 기준이다.
브라우저 접근 호스트를 사용할 수 없었고 네이티브 Chrome 접근도 허용되지 않아,
실제 로그인 화면·모바일 뷰포트·긴 한국어/영어 레이블의 시각 검수는 완료하지 못했다.
운영 배포나 모든 화면의 시각적 합격을 의미하지 않는다.

See the PR for check results. Browser access was unavailable, and native Chrome access was denied.
Authenticated visual acceptance, narrow-viewport checks and long-label rendering remain unverified.
This report does not establish production deployment or visual acceptance of every screen.
