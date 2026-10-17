# Activity detail review / 활동 상세 검수

## Scope

Activity overview, analysis, segments/laps, and owner-only comparison. Preserve the existing token system, server values, ownership checks, release flags, and Korean/English support from the October 17 UI work.

Changes include responsive map framing, balanced statistics, keyboard-accessible tab navigation, tab introductions, metric grouping, intentional loading/empty/retry states, segment units and rank bounds, readable mobile table columns, and comparison selection/date presentation. Empty lap tables are suppressed.

## Runtime evidence

The supplied Strava activity was inspected locally with its actual stored metrics, 17 segment efforts, and a selected earlier cycling activity. Private screenshots remain outside this public repository. Mobile inspection used the actual application in a 320px-wide same-origin frame; the browser viewport override did not change the real viewport. The frame measured 320px client width and 320px scroll width.

Independent visual review evaluated observed screenshots iteratively. The review covers desktop and 320px analysis, segment lists, selected comparisons, and the overview unavailable/retry state. Final independent ratings were 9.5/10 for the observed desktop and 320px analysis, segments, selected comparison, and overview unavailable/retry screens, including the final English overflow fixes. A score applies only to the state explicitly observed, not to hidden or unavailable states.

The overview callable's successful canonical response remained unavailable in local development because a registered local App Check configuration was missing. Its success state is **not verified**. Production overview and stored detailed metrics also showed different training-load values; this change preserves those values and identifies the detailed metric source without asserting an unverified explanation.

A temporary Firestore long-polling diagnostic allowed local reads through the inspection environment. It is not included in the change. No production activity, comments, visibility, Strava descriptions, or AI submissions were modified.

## Verification

Focused activity, lap, segment, comparison, and metric-provenance tests passed. Independent code review approved the implementation after correcting non-cycling retry visibility and adding regression coverage. Build, lint, quality budgets, and contract checks are recorded in the PR with final results.

## 한국어

실활동으로 네 탭을 확인하고 한국어·영어 및 320px 배치를 반복 검수했습니다. 운영 계정 화면과 위치 정보는 공개 저장소에 넣지 않았습니다. 로컬 App Check 설정이 없어 개요 API의 정상 응답 상태는 미검증으로 남깁니다. 실제로 관찰한 화면의 검수 점수를 전체 기능의 승인으로 확대하지 않습니다.
