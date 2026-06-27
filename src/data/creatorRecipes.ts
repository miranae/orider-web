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
    status: string;
  };
  en: {
    title: string;
    summary: string;
    outcome: string;
    detail: string;
    labels: string[];
    shareMode: string;
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
      summary: "주간 활동, 부하, 회복 흐름을 읽어 나만의 훈련 일기를 만들고 자랑용 카드만 따로 공유합니다.",
      outcome: "결과: 비공개 일기 초안 + 위치/민감 지표가 제거된 공유 카드",
      detail: "서버-side AI credit으로 실행되며 provider key는 브라우저에 노출되지 않습니다. 주간 하이라이트, 주의할 피로 신호, 다음 주 한 줄 메모를 생성합니다.",
      labels: ["본인 데이터만", "비공개 초안", "AI 5회/일", "위치 제거"],
      shareMode: "redacted card / link-only",
      status: "추천",
    },
    en: {
      title: "AI ride diary",
      summary: "Turn weekly activities, load, and recovery signals into a private diary, then share only a redacted card.",
      outcome: "Output: private diary draft plus a location-safe share card",
      detail: "Runs through server-side Orider AI credits, so provider keys never reach the browser. It produces weekly highlights, fatigue cautions, and a next-week note.",
      labels: ["Own data only", "Private draft", "5 AI/day", "Location redacted"],
      shareMode: "redacted card / link-only",
      status: "Featured",
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
      summary: "최근 12주 훈련량과 TSS 흐름을 요약해 이번 주가 빌드업인지 과부하인지 바로 보여줍니다.",
      outcome: "결과: 12주 부하 차트 + 이번 주 요약 + 공유 가능한 집계 카드",
      detail: "라이더가 매주 월요일 확인하거나 이메일 digest로 받을 수 있는 형식입니다. 위치와 개별 활동명 없이 거리, 시간, 부하, 활동 수만 집계합니다.",
      labels: ["집계 데이터", "차트 공유", "이메일 준비", "읽기 전용"],
      shareMode: "public-safe chart",
      status: "레시피",
    },
    en: {
      title: "Weekly load report",
      summary: "Summarize 12 weeks of training load and show whether this week is building, flat, or too aggressive.",
      outcome: "Output: 12-week load chart, weekly summary, and public-safe aggregate card",
      detail: "Designed for a Monday check-in or an email digest. It aggregates distance, time, load, and activity count without route geometry or activity names.",
      labels: ["Aggregated", "Chart card", "Email-ready", "Read-only"],
      shareMode: "public-safe chart",
      status: "Recipe",
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
      summary: "고강도 운동이 누적될 때 회복일 또는 Z1/Z2 전환을 제안해 무리한 연속 훈련을 줄입니다.",
      outcome: "결과: 하루 1회 회복 경고 + 다음 훈련 강도 제안",
      detail: "TSS, 시간, 심박/파워 zone을 기준으로 최근 7일을 점검합니다. 오라이더 내부 알림이 기본이고, 이메일은 동의한 사용자에게만 보낼 수 있습니다.",
      labels: ["개인 알림", "하루 1회", "이메일 opt-in", "외부 전송 선택"],
      shareMode: "notification preview",
      status: "레시피",
    },
    en: {
      title: "Hard-day streak alert",
      summary: "Warn when hard training stacks up and suggest a recovery or Z1/Z2 day before fatigue becomes the story.",
      outcome: "Output: once-daily recovery warning plus next-session intensity suggestion",
      detail: "Looks at the last 7 days using TSS, duration, and HR/power zones. In-app alert is the default; email can be sent only after explicit opt-in.",
      labels: ["Private alert", "Daily polling", "Email opt-in", "External send opt-in"],
      shareMode: "notification preview",
      status: "Recipe",
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
      summary: "긴 라이딩을 GPX, 요약 표, 메모 템플릿으로 묶어 Notion/코치 리포트에 바로 붙입니다.",
      outcome: "결과: GPX 파일 + 활동 요약 markdown + 코치에게 보낼 체크리스트",
      detail: "위치 데이터가 포함되므로 기본 결과는 비공개 다운로드입니다. 공유할 때는 출발/도착 반경을 숨긴 요약 카드만 사용합니다.",
      labels: ["파일 생성", "Notion-ready", "본인 활동만", "위치 포함"],
      shareMode: "private export",
      status: "유틸",
    },
    en: {
      title: "Long-ride log package",
      summary: "Package a long ride into GPX, markdown summary, and coach-ready notes for Notion or a training log.",
      outcome: "Output: GPX file, activity summary markdown, and coach checklist",
      detail: "Because route data is included, the default output is a private download. Shared cards should hide start/end areas and use aggregate stats.",
      labels: ["File output", "Notion-ready", "Owned activities", "Uses location"],
      shareMode: "private export",
      status: "Utility",
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
      summary: "이번 달 거리, 상승고도, 최장 라이딩, 꾸준함을 배지처럼 만들어 개인 사이트나 커뮤니티에 자랑합니다.",
      outcome: "결과: 공개 안전 월간 배지 + embed용 JSON + 오라이더 게시글 초안",
      detail: "정밀 경로와 시작 위치 없이 월간 집계만 노출합니다. 라이더가 공개할 항목을 직접 고르고 언제든 key를 폐기할 수 있습니다.",
      labels: ["선택 공개", "위젯", "경로 숨김", "월간 배지"],
      shareMode: "public-safe widget",
      status: "아이디어",
    },
    en: {
      title: "Monthly ride badge",
      summary: "Turn monthly distance, elevation, longest ride, and consistency into a badge for a personal site or community post.",
      outcome: "Output: public-safe monthly badge, embeddable JSON, and Orider post draft",
      detail: "Only monthly aggregates are exposed by default. The rider chooses each public field and can revoke the API key at any time.",
      labels: ["Opt-in public", "Widget", "Route hidden", "Monthly badge"],
      shareMode: "public-safe widget",
      status: "Idea",
    },
  },
];
