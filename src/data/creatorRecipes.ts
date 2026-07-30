export type CreatorRecipeKind = "diary" | "chart" | "alert" | "export" | "widget";
export type CreatorRecipeIcon = "bot" | "lineChart" | "bell" | "fileText" | "trophy";

export interface CreatorRecipeMeta {
  id: string;
  kind: CreatorRecipeKind;
  icon: CreatorRecipeIcon;
  scopes: string[];
  channels: string[];
  ko: {
    title: string;
    summary: string;
    outcome: string;
    detail: string;
    labels: string[];
    scopeLabel?: string;
    shareMode: string;
    deployMode: string;
    status: string;
  };
  en: {
    title: string;
    summary: string;
    outcome: string;
    detail: string;
    labels: string[];
    scopeLabel?: string;
    shareMode: string;
    deployMode: string;
    status: string;
  };
}

export const creatorRecipes: CreatorRecipeMeta[] = [
  {
    id: "ai-diary",
    kind: "diary",
    icon: "bot",
    scopes: ["activities:read", "streams:read", "fitness:read"],
    channels: ["orider-ai-credit", "share-card", "community-post"],
    ko: {
      title: "AI 자동 라이딩 일기",
      summary: "이번 주 라이딩을 자동으로 읽고, 혼자 보는 훈련 일기와 커뮤니티에 올릴 수 있는 짧은 자랑 카드를 따로 만듭니다.",
      outcome: "비공개 일기 초안, 이번 주 하이라이트, 위치와 민감 지표를 뺀 공유 카드가 나옵니다.",
      detail: "예를 들어 수요일 고강도 이후 회복이 늦었다면 일기에는 피로 신호를 적고, 공유 카드에는 총 거리와 상승고도처럼 안전한 내용만 남깁니다. AI 호출은 서버에서 처리되어 모델 provider key가 브라우저에 노출되지 않습니다.",
      labels: ["본인 데이터만", "비공개 초안", "공용 AI 크레딧", "위치 제거"],
      shareMode: "redacted card / link-only",
      deployMode: "오라이더 안에서 실행합니다. 로그인 후 생성 버튼을 누르면 서버가 내 최근 활동을 읽어 비공개 초안을 만들고, 모든 AI 레시피가 공유하는 일일 크레딧을 1회 사용합니다.",
      status: "바로 사용 가능",
    },
    en: {
      title: "AI ride diary",
      summary: "Read this week's rides and create both a private training diary and a short share card for the community.",
      outcome: "Private diary draft, weekly highlights, and a share card with location and sensitive metrics removed.",
      detail: "For example, if recovery looked slow after a hard Wednesday, the diary can mention the fatigue signal while the public card keeps only safe totals such as distance and elevation. AI calls run server-side so provider keys never reach the browser.",
      labels: ["Own data only", "Private draft", "Shared AI credits", "Location redacted"],
      shareMode: "redacted card / link-only",
      deployMode: "Runs inside Orider. After sign-in, the generate action reads recent activities server-side, creates a private draft, and spends 1 credit from the shared daily pool used by all AI recipes.",
      status: "Try now",
    },
  },
  {
    id: "commute-diary",
    kind: "diary",
    icon: "fileText",
    scopes: ["activities:read"],
    channels: ["weekly-review", "email-report"],
    ko: {
      title: "자전거 출퇴근 일기",
      summary: "최근 7일의 자전거 출퇴근 합계와 Orider가 제공하는 고정 회고 질문을 본인 이메일로 받아봅니다.",
      outcome: "자출 횟수·총 거리·총 이동 시간·총 상승고도와 회고 질문을 담은 비공개 이메일 리포트가 나옵니다.",
      detail: "Strava의 출퇴근 표시나 명확한 활동명으로 자출을 찾고 거리와 이동 시간을 집계합니다. 몸 상태·날씨·교통을 추정하거나 저장하지 않으며, 일기 입력·보관함·공유 카드는 현재 제공하지 않습니다.",
      labels: ["최근 7일", "본인 이메일", "자출 집계", "회고 질문"],
      scopeLabel: "Scopes · 직접 만드는 확장판",
      shareMode: "private email",
      deployMode: "오라이더 안에서 직접 요청하면 최근 7일 자출 합계와 직접 답할 회고 질문을 본인 계정 이메일로 보냅니다. 현재 이메일에는 Personal Data API key가 필요하지 않고 답변은 저장하지 않으며, 정기 발송은 별도 동의가 필요합니다.",
      status: "이메일 리포트",
    },
    en: {
      title: "Bike commute diary",
      summary: "Email yourself the last 7 days of bike commute totals and a fixed set of guided reflection prompts.",
      outcome: "A private email report with commute count, total distance, total moving time, total elevation gain, and reflection prompts.",
      detail: "Commutes are identified from Strava's commute flag or a clear activity name, then distance and moving time are totaled. Orider does not infer or store condition, weather, or traffic, and currently provides no diary entry, archive, or share card.",
      labels: ["Last 7 days", "Email to self", "Commute totals", "Reflection prompts"],
      scopeLabel: "Scopes · extension only",
      shareMode: "private email",
      deployMode: "Request it inside Orider to send the last 7 days of commute totals and guided reflection prompts to your account email. The current email requires no Personal Data API key, answers are not stored, and recurring delivery requires separate consent.",
      status: "Email report",
    },
  },
  {
    id: "weekly-load",
    kind: "chart",
    icon: "lineChart",
    scopes: ["activities:read", "fitness:read"],
    channels: ["dashboard", "share-card", "email-digest-ready"],
    ko: {
      title: "주간 부하 리포트",
      summary: "최근 7일 훈련 부하를 유료 분석 리포트처럼 정리해 전주 대비 변화, 강도 분포, 대표 활동 썸네일, 다음 행동을 한 번에 보여줍니다.",
      outcome: "KPI 카드, 최근 7일 부하 막대 차트, 대표 활동 지도 썸네일, 강도 분포 해석, 다음 세션 제안이 포함된 이메일 리포트가 나옵니다.",
      detail: "월요일 아침에 보면 이번 주를 밀어붙일지 회복으로 돌릴지 판단하기 쉽습니다. 본인 이메일에는 지도 썸네일과 날짜 단위 힌트를 넣고, 외부 공유용으로는 위치와 활동명 없이 집계값 중심으로 줄일 수 있습니다.",
      labels: ["리포트 템플릿", "부하 차트", "지도 썸네일", "전주 비교"],
      shareMode: "private report / public-safe summary",
      deployMode: "오라이더에서는 본인 이메일로 즉시 리포트를 받아봅니다. 정기 배치는 별도 동의 후 월요일 오전 트리거로 실행하고, 외부 도구에는 집계 요약만 넘깁니다.",
      status: "리포트 미리보기",
    },
    en: {
      title: "Weekly load report",
      summary: "Turn the last 7 days of training load into a premium-style report with week-over-week change, intensity mix, key thumbnails, and next actions.",
      outcome: "An email report with KPI cards, a 7-day load bar chart, key-session map thumbnails, intensity readout, and next-session guidance.",
      detail: "A Monday check-in makes it easier to decide whether to push or recover this week. Your own email can include map thumbnails and date-level hints; external sharing can be reduced to safe aggregates.",
      labels: ["Report template", "Load chart", "Map thumbnails", "Week compare"],
      shareMode: "private report / public-safe summary",
      deployMode: "Send an instant report to your verified account email inside Orider. Recurring delivery needs separate opt-in; external tools receive aggregate summaries by default.",
      status: "Report preview",
    },
  },
  {
    id: "hard-days",
    kind: "alert",
    icon: "bell",
    scopes: ["activities:read"],
    channels: ["in-app-alert", "email-opt-in", "discord-webhook"],
    ko: {
      title: "3일 연속 고강도 알림",
      summary: "강한 운동이 며칠째 이어질 때 오늘은 회복주로 돌릴지, Z1/Z2로 낮출지 알려주는 안전장치입니다.",
      outcome: "하루 1회 회복 경고, 다음 훈련 강도 제안, 알림을 보낸 이유 요약이 나옵니다.",
      detail: "최근 7일의 시간, 부하, 심박/파워 zone을 보고 과부하 가능성을 점검합니다. 기본은 앱 안 알림이고, 이메일이나 Discord 전송은 사용자가 따로 동의한 경우에만 켭니다.",
      labels: ["개인 알림", "하루 1회", "이메일 opt-in", "외부 전송 선택"],
      shareMode: "notification preview",
      deployMode: "하루 1회 예약 실행으로 배치합니다. 먼저 앱 안 알림으로 검증하고, 사용자가 동의한 뒤 이메일이나 Discord webhook을 연결합니다.",
      status: "직접 만들기",
    },
    en: {
      title: "Hard-day streak alert",
      summary: "A safety guard that tells you when several hard days suggest a recovery ride or lower Z1/Z2 session.",
      outcome: "Once-daily recovery warning, next-session intensity suggestion, and a short reason for the alert.",
      detail: "It checks the last 7 days of duration, load, and HR/power zones. In-app alert is the default; email or Discord delivery is enabled only after explicit opt-in.",
      labels: ["Private alert", "Daily polling", "Email opt-in", "External send opt-in"],
      shareMode: "notification preview",
      deployMode: "Deploy as a once-daily scheduled check. Validate with in-app alerts first, then connect email or Discord webhooks only after opt-in.",
      status: "Build recipe",
    },
  },
  {
    id: "gpx-helper",
    kind: "export",
    icon: "fileText",
    scopes: ["activities:read", "streams:read", "exports:read"],
    channels: ["download", "notion-log", "coach-report"],
    ko: {
      title: "롱라이드 기록 패키지",
      summary: "긴 라이딩 하나를 코치/Notion에 바로 붙일 수 있는 기록 초안, 보급 회고, 다음 라이딩 질문으로 정리합니다.",
      outcome: "비공개 export 안내, 핵심 지표 카드, Markdown 기록 초안, 라이딩 해석, 코치 질문, 공유 제외 항목이 나옵니다.",
      detail: "이메일에는 경로 파일을 첨부하지 않습니다. 대신 최근 30일 최장 라이딩을 골라 거리·시간·상승고도·심박/파워 기준값과 보급/페이스/회복 메모 템플릿을 만듭니다. 공개용으로 바꿀 때는 출발·도착 위치와 경로 geometry를 제외합니다.",
      labels: ["파일 생성", "Notion-ready", "본인 활동만", "위치 포함"],
      shareMode: "private export",
      deployMode: "자동 상시 실행보다 수동 실행이 안전합니다. 후보 라이딩을 확인한 뒤 비공개 파일은 직접 내려받고, 이메일에는 기록 초안과 체크리스트만 보냅니다.",
      status: "직접 만들기",
    },
    en: {
      title: "Long-ride log package",
      summary: "Turn one long ride into a coach/Notion-ready record draft, fueling review, and next-ride questions.",
      outcome: "Private export guidance, key metric cards, markdown record draft, ride readout, coach questions, and public-sharing exclusions.",
      detail: "The email does not attach route files. It selects the longest ride in the last 30 days and turns distance, time, elevation, HR/power baselines, fueling, pacing, and recovery prompts into a useful package. Public versions must remove start/end location and route geometry.",
      labels: ["File output", "Notion-ready", "Owned activities", "Uses location"],
      shareMode: "private export",
      deployMode: "Best deployed as a manual action, not always-on automation. Confirm the candidate ride, download private files yourself, and email only the record draft and checklist.",
      status: "Build recipe",
    },
  },
  {
    id: "ride-story",
    kind: "widget",
    icon: "trophy",
    scopes: ["activities:read"],
    channels: ["share-card", "email-report", "personal-archive"],
    ko: {
      title: "Ride Story",
      summary: "사진이나 경로가 있는 활동 하나를 9:16 공유용 포스터로 정리합니다. 거리, 상승고도, 시간, 경로 실루엣, 오라이더 브랜딩을 한 장에 담습니다.",
      outcome: "오라이더 로고가 들어간 라이딩 포스터, 공개용 짧은 캡션, 저장 전 확인할 개인정보 체크리스트가 나옵니다.",
      detail: "가장 잘 어울리는 최근 활동을 고르고, 업로드한 활동 사진이 있으면 그 사진을 배경으로 사용합니다. 사진이 없으면 지도 썸네일이나 경로 실루엣으로 대체하고, Strava 로고나 원본 좌표는 넣지 않습니다.",
      labels: ["공유 포스터", "사진 우선", "경로 실루엣", "Strava 로고 없음"],
      shareMode: "public-safe poster / private email",
      deployMode: "오라이더 안에서 본인 이메일로 먼저 받아봅니다. 포스터는 검토 후 직접 저장하거나 공유하는 흐름을 권장하며, 원본 위치 데이터는 이메일 본문에 포함하지 않습니다.",
      status: "바로 사용 가능",
    },
    en: {
      title: "Ride Story",
      summary: "Turn one activity with a photo or route into a 9:16 share poster with distance, elevation, time, route silhouette, and Orider branding.",
      outcome: "An Orider-branded ride poster, short public caption, and a privacy checklist to review before saving or sharing.",
      detail: "Orider picks a recent activity that fits the format and uses an uploaded activity photo when available. If no photo exists, it falls back to a map thumbnail or route silhouette without Strava branding or raw coordinates.",
      labels: ["Share poster", "Photo first", "Route silhouette", "No Strava logo"],
      shareMode: "public-safe poster / private email",
      deployMode: "Send it to your verified account email first inside Orider. Review the poster before saving or sharing; raw location data is not included in the email body.",
      status: "Try now",
    },
  },
  {
    id: "ride-widget",
    kind: "widget",
    icon: "trophy",
    scopes: ["activities:read"],
    channels: ["public-widget", "personal-site", "share-card"],
    ko: {
      title: "월간 라이딩 배지",
      summary: "이번 달 거리, 상승고도, 활동 수, 최장 라이딩을 배지처럼 만들어 프로필이나 커뮤니티에 올립니다.",
      outcome: "공개 안전 월간 배지, 개인 사이트에 붙일 JSON, 오라이더 게시글 초안이 나옵니다.",
      detail: "정밀 경로와 시작 위치는 쓰지 않고 월간 집계만 노출합니다. 공개할 항목은 라이더가 직접 고르고, 마음이 바뀌면 API key를 폐기해 배지를 멈출 수 있습니다.",
      labels: ["선택 공개", "위젯", "경로 숨김", "월간 배지"],
      shareMode: "public-safe widget",
      deployMode: "월 1회 갱신 작업으로 배치합니다. 공개할 집계 항목을 고른 뒤 개인 사이트가 읽을 JSON이나 카드 문구를 갱신합니다.",
      status: "아이디어",
    },
    en: {
      title: "Monthly ride badge",
      summary: "Turn monthly distance, elevation, activity count, and longest ride into a badge for a profile or community post.",
      outcome: "Public-safe monthly badge, embeddable JSON for a personal site, and an Orider post draft.",
      detail: "Only monthly aggregates are exposed, with no precise routes or start locations. The rider chooses each public field and can revoke the API key at any time.",
      labels: ["Opt-in public", "Widget", "Route hidden", "Monthly badge"],
      shareMode: "public-safe widget",
      deployMode: "Deploy as a monthly refresh job. Choose public aggregate fields, then update the JSON or card copy consumed by a personal site.",
      status: "Idea",
    },
  },
];
