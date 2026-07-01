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
      to: "/creator/recipes",
      title: ko ? "레시피 목록" : "Recipe catalog",
      body: ko ? "어떤 레시피가 있고 어떤 권한이 필요한지 봅니다." : "See available recipes and the scopes they need.",
      icon: BookOpen,
    },
    {
      to: "/creator/deploy",
      title: ko ? "내 도구에 직접 연결하기" : "Connect your own tools",
      body: ko
        ? "Developer API key와 필요한 scope를 골라 Notion, Slack, n8n, 개인 대시보드에 연결합니다."
        : "Create a Developer API key, choose scopes, and connect Notion, Slack, n8n, or your own dashboard.",
      icon: KeyRound,
    },
    {
      to: "/creator/examples",
      title: ko ? "활용 예시" : "Examples",
      body: ko ? "Notion, Slack, n8n, 개인 사이트에 바로 따라 붙일 수 있는 순서입니다." : "Follow practical Notion, Slack, n8n, and personal-site playbooks.",
      icon: FileText,
    },
    {
      to: "/creator/share",
      title: ko ? "자랑 카드" : "Share cards",
      body: ko ? "공개 전 숨김 처리된 카드와 주간 차트를 미리 봅니다." : "Preview redacted cards and weekly charts before sharing.",
      icon: ShieldCheck,
    },
  ];
}
