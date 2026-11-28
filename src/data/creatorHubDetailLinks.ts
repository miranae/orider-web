import { BookOpen, FileText, KeyRound, ShieldCheck, type LucideIcon } from "lucide-react";

/**
 * 「이 기록으로 만들기」는 라이더용(`/records/studio`)과 개발자용(`/settings/developer/:section`)으로 나뉜다.
 * 라이더 화면에는 API key·Swagger·GitHub·n8n 같은 개발자 안내를 보이지 않는다(#3956).
 */
export type CreatorHubMode = "rider" | "developer";

export const RECORDS_STUDIO_PATH = "/records/studio";
export const DEVELOPER_GUIDE_PATH = "/settings/developer";
export const RIDER_STUDIO_SECTIONS = ["overview", "recipes", "share"] as const;
export const DEVELOPER_GUIDE_SECTIONS = ["deploy", "examples"] as const;
export type RiderStudioSection = typeof RIDER_STUDIO_SECTIONS[number];
export type DeveloperGuideSection = typeof DEVELOPER_GUIDE_SECTIONS[number];

export function isRiderStudioSection(value: string | null | undefined): value is RiderStudioSection {
  return RIDER_STUDIO_SECTIONS.some((section) => section === value);
}

export function isDeveloperGuideSection(value: string | null | undefined): value is DeveloperGuideSection {
  return DEVELOPER_GUIDE_SECTIONS.some((section) => section === value);
}

/** 옛 `/explore/recipes/:section`·`/creator/:section` 의 새 위치. 모르는 섹션은 라이더 첫 화면. */
export function creatorSectionDestination(section: string | null | undefined): string {
  if (isDeveloperGuideSection(section)) return `${DEVELOPER_GUIDE_PATH}/${section}`;
  if (isRiderStudioSection(section) && section !== "overview") return `${RECORDS_STUDIO_PATH}/${section}`;
  return RECORDS_STUDIO_PATH;
}

export interface CreatorHubDetailLink {
  section: string;
  to: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

export function buildCreatorHubDetailLinks(language: string, mode: CreatorHubMode = "rider"): CreatorHubDetailLink[] {
  const ko = language.startsWith("ko");
  if (mode === "developer") {
    return [
      {
        section: "deploy",
        to: `${DEVELOPER_GUIDE_PATH}/deploy`,
        title: ko ? "내 도구에 직접 연결하기" : "Connect your own tools",
        body: ko
          ? "내 기록을 노트나 알림으로 받아보고, 자주 하는 작업을 자동화합니다."
          : "Turn your rides into notes and reminders, and automate routine tasks.",
        icon: KeyRound,
      },
      {
        section: "examples",
        to: `${DEVELOPER_GUIDE_PATH}/examples`,
        title: ko ? "활용 예시" : "Examples",
        body: ko ? "Notion, Slack, n8n, 개인 사이트에 바로 따라 붙일 수 있는 순서입니다." : "Follow practical Notion, Slack, n8n, and personal-site playbooks.",
        icon: FileText,
      },
    ];
  }
  return [
    {
      section: "recipes",
      to: `${RECORDS_STUDIO_PATH}/recipes`,
      title: ko ? "만들 수 있는 것" : "What you can make",
      body: ko ? "일기, 리포트, 사진 포스터 중 필요한 것을 고릅니다." : "Choose diaries, reports, or photo posters for your rides.",
      icon: BookOpen,
    },
    {
      section: "share",
      to: `${RECORDS_STUDIO_PATH}/share`,
      title: ko ? "자랑 카드" : "Share cards",
      body: ko ? "공개 전 숨김 처리된 카드와 주간 차트를 미리 봅니다." : "Preview redacted cards and weekly charts before sharing.",
      icon: ShieldCheck,
    },
  ];
}
