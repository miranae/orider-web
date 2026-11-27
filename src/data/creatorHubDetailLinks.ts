import { standaloneText } from "../i18n/standaloneText";
import { BookOpen, FileText, KeyRound, ShieldCheck, type LucideIcon } from "lucide-react";

export interface CreatorHubDetailLink {
  to: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

export function buildCreatorHubDetailLinks(language: string): CreatorHubDetailLink[] {
  return [
    {
      to: "/explore/recipes/recipes",
      title: standaloneText(language, "creator_detail_recipe_catalog"),
      body: standaloneText(language, "creator_detail_choose_diaries_reports_or_photo_posters"),
      icon: BookOpen,
    },
    {
      to: "/explore/recipes/deploy",
      title: standaloneText(language, "creator_detail_connect_your_own_tools"),
      body: standaloneText(language, "creator_detail_turn_your_rides_into_notes_and"),
      icon: KeyRound,
    },
    {
      to: "/explore/recipes/examples",
      title: standaloneText(language, "creator_detail_examples"),
      body: standaloneText(language, "creator_detail_follow_practical_notion_slack_n8n_and"),
      icon: FileText,
    },
    {
      to: "/explore/recipes/share",
      title: standaloneText(language, "creator_detail_share_cards"),
      body: standaloneText(language, "creator_detail_preview_redacted_cards_and_weekly_charts"),
      icon: ShieldCheck,
    },
  ];
}
