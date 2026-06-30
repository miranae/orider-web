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
      labels: ["본인 데이터만", "비공개 초안", "AI 5회/일", "위치 제거"],
      shareMode: "redacted card / link-only",
      deployMode: "오라이더 안에서 실행합니다. 로그인 후 생성 버튼을 누르면 서버가 내 최근 활동을 읽어 비공개 초안을 만들고, 공유 카드는 사용자가 직접 게시합니다.",
      status: "바로 사용 가능",
    },
    en: {
      title: "AI ride diary",
      summary: "Read this week's rides and create both a private training diary and a short share card for the community.",
      outcome: "Private diary draft, weekly highlights, and a share card with location and sensitive metrics removed.",
      detail: "For example, if recovery looked slow after a hard Wednesday, the diary can mention the fatigue signal while the public card keeps only safe totals such as distance and elevation. AI calls run server-side so provider keys never reach the browser.",
      labels: ["Own data only", "Private draft", "5 AI/day", "Location redacted"],
      shareMode: "redacted card / link-only",
      deployMode: "Runs inside Orider. After sign-in, the generate action reads recent activities server-side, creates a private draft, and lets the rider publish the share card manually.",
      status: "Try now",
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
      summary: "최근 훈련량을 주 단위로 묶어 이번 주가 빌드업인지, 유지 주간인지, 과부하에 가까운지 빠르게 보여줍니다.",
      outcome: "주간 부하 차트, 지난주 대비 변화, 공유 가능한 거리·시간·활동 수 집계 카드가 나옵니다.",
      detail: "월요일 아침에 보면 이번 주를 밀어붙여도 되는지, 회복 위주로 돌려야 하는지 판단하기 쉽습니다. 외부로 보낼 때는 위치와 활동명 없이 집계값만 사용합니다.",
      labels: ["집계 데이터", "차트 공유", "이메일 준비", "읽기 전용"],
      shareMode: "public-safe chart",
      deployMode: "오라이더에서는 즉시 미리보고, 외부 배치는 월요일 오전 같은 일정 트리거로 Notion·Slack·n8n에서 API를 호출하도록 설정합니다.",
      status: "바로 보기 + 직접 연결",
    },
    en: {
      title: "Weekly load report",
      summary: "Group recent training by week and show whether this week is building, steady, or drifting toward overload.",
      outcome: "Weekly load chart, change from last week, and a shareable aggregate card for distance, time, and activity count.",
      detail: "A Monday check-in makes it easier to decide whether to push or recover this week. External delivery uses only aggregates, with no location or activity names.",
      labels: ["Aggregated", "Chart card", "Email-ready", "Read-only"],
      shareMode: "public-safe chart",
      deployMode: "Preview immediately in Orider. For external deployment, schedule a Monday-morning trigger in Notion, Slack, n8n, or a server that calls the API.",
      status: "Preview + build",
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
      summary: "긴 라이딩 하나를 GPX, 요약 표, 회고 메모, 코치에게 보낼 체크리스트로 묶어 정리합니다.",
      outcome: "GPX 파일, 활동 요약 markdown, Notion에 붙일 표, 코치에게 보낼 질문 목록이 나옵니다.",
      detail: "위치 데이터가 포함되므로 기본 결과는 본인만 내려받는 비공개 파일입니다. 공유용으로 바꿀 때는 출발·도착 반경을 숨긴 요약 카드만 사용합니다.",
      labels: ["파일 생성", "Notion-ready", "본인 활동만", "위치 포함"],
      shareMode: "private export",
      deployMode: "자동 상시 실행보다 수동 실행이 안전합니다. 롱라이드 하나를 선택한 뒤 비공개 파일로 내려받고, 필요한 요약만 Notion이나 코치에게 보냅니다.",
      status: "직접 만들기",
    },
    en: {
      title: "Long-ride log package",
      summary: "Turn one long ride into a GPX file, summary table, reflection note, and coach-ready checklist.",
      outcome: "GPX file, markdown activity summary, Notion-ready table, and questions to send a coach.",
      detail: "Because route data is included, the default output is a private download. Public cards should hide start/end areas and use aggregate stats only.",
      labels: ["File output", "Notion-ready", "Owned activities", "Uses location"],
      shareMode: "private export",
      deployMode: "Best deployed as a manual action, not always-on automation. Pick one long ride, download private files, then send only the necessary summary to Notion or a coach.",
      status: "Build recipe",
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
