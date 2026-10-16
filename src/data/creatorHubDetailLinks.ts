import { BookOpen, FileText, KeyRound, ShieldCheck, type LucideIcon } from "lucide-react";

export interface CreatorHubDetailLink {
  to: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

export function buildCreatorHubDetailLinks(language: string): CreatorHubDetailLink[] {
  const ko = language.startsWith("ko");
  return [
    {
      to: "/explore/recipes/recipes",
      title: ko ? "레시피 목록" : "Recipe catalog",
      body: ko ? "일기, 리포트, 사진 포스터 중 필요한 활용법을 고릅니다." : "Choose diaries, reports, or photo posters for your rides.",
      icon: BookOpen,
    },
    {
      to: "/explore/recipes/deploy",
      title: ko ? "내 도구에 직접 연결하기" : "Connect your own tools",
      body: ko
        ? "내 기록을 노트나 알림으로 받아보고, 자주 하는 작업을 자동화합니다."
        : "Turn your rides into notes and reminders, and automate routine tasks.",
      icon: KeyRound,
    },
    {
      to: "/explore/recipes/examples",
      title: ko ? "활용 예시" : "Examples",
      body: ko ? "Notion, Slack, n8n, 개인 사이트에 바로 따라 붙일 수 있는 순서입니다." : "Follow practical Notion, Slack, n8n, and personal-site playbooks.",
      icon: FileText,
    },
    {
      to: "/explore/recipes/share",
      title: ko ? "자랑 카드" : "Share cards",
      body: ko ? "공개 전 숨김 처리된 카드와 주간 차트를 미리 봅니다." : "Preview redacted cards and weekly charts before sharing.",
      icon: ShieldCheck,
    },
  ];
}
