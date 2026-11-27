import { standaloneText } from "../i18n/standaloneText";
import "./EventControls.css";
import "./CreatorReview.css";
import type { WeeklyStat } from "../components/WeeklyChart";
import InfoTip from "../components/InfoTip";
import GlossaryProvider from "../components/common/GlossaryProvider";
import GlossaryText from "../components/common/GlossaryText";
import "./ExploreReview.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { creatorRecipeErrorFeedback, creatorRecipeErrorResolveTo } from "../utils/creatorRecipeErrors";
import { Resolvable } from "../components/redesign/states/Resolvable";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import {
  Bell,
  BookOpen,
  Bot,
  Clipboard,
  ExternalLink,
  FileText,
  Flag,
  GitPullRequest,
  KeyRound,
  LineChart,
  Lock,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { RecipePreviewDialog, type RecipePreviewRequest } from "../components/creator/RecipePreviewDialog";
import { RecipeShareCard } from "../components/creator/RecipeShareCard";
import { RideStoryPhotoPicker } from "../components/creator/RideStoryPhotoPicker";
import { Button, Card, Chip, Text, buttonClass } from "../theme/components";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatTrainingLoad } from "../utils/trainingLoadDisplay";
import { useWeeklyStats } from "../hooks/useActivities";
import { buildCreatorHubDetailLinks } from "../data/creatorHubDetailLinks";
import {
  creatorRecipes,
  type CreatorRecipeIcon,
  type CreatorRecipeKind,
} from "../data/creatorRecipes";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useLocalizedNavigate } from "../hooks/useLocalizedNavigate";
import { formatCreatorEmailQuotaLabel, useCreatorRecipeEmail } from "../hooks/useCreatorRecipeEmail";
import { assertIsolatedStageRuntime, getRuntimeConfig, type RuntimeConfig } from "../services/runtimeConfig";
import { ICON_SIZE } from "../theme/tokens/icon";

type CreatorTab = "featured" | "recipes" | "share";
type CreatorSection = "overview" | "deploy" | "examples" | "recipes" | "share";
type CreatorScrollTarget = "deploy" | "recipes" | "share";

interface CreatorItem {
  id: string;
  kind: CreatorRecipeKind;
  icon: LucideIcon;
  title: string;
  summary: string;
  outcome: string;
  detail: string;
  scopes: string[];
  channels: string[];
  showShareCardPreview: boolean;
  labels: string[];
  scopeLabel: string;
  shareMode: string;
  deployMode: string;
  status: string;
}

interface AiDiaryPolicy {
  version: string;
  processor: { name: string; country: string; privacyPolicyUrl: string };
  purpose: string;
  dataCategories: string[];
  excludedData?: string[];
  retention: string;
  dailyLimit: number;
}

interface AiDiaryResponse {
  source: "cache" | "generated";
  generatedAt: number;
  quota: { limit: number; remaining: number; reset: number } | null;
  diary: {
    title: string;
    body: string;
    highlights: string[];
    cautions: string[];
  };
  shareCard: {
    title: string;
    body: string;
    footer: string;
    redactions: string[];
    kicker?: string;
    metrics?: { label: string; value: string }[];
  };
}

const iconMap: Record<CreatorRecipeIcon, LucideIcon> = {
  bot: Bot,
  lineChart: LineChart,
  bell: Bell,
  fileText: FileText,
  trophy: Trophy,
};

const kindTone: Record<CreatorRecipeKind, string> = {
  diary: "var(--lime)",
  chart: "var(--aqua)",
  alert: "var(--amber)",
  export: "var(--violet)",
  widget: "var(--rose)",
};

const marketStageIcons: LucideIcon[] = [BookOpen, ShieldCheck, KeyRound, LineChart];

const PUBLIC_REPOSITORY_URL = "https://github.com/miranae/orider-web";
export function creatorApiDocsLinks(config: RuntimeConfig = getRuntimeConfig()) {
  assertIsolatedStageRuntime(config);
  const base = (config.personalApiBase || "").trim();
  if (base) {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("personal-api/invalid-docs-base");
    }
  }
  const apiBase = base.replace(/\/+$/, "");
  return { docs: `${apiBase}/api/v1/docs`, openapi: `${apiBase}/api/v1/docs/openapi.yaml` };
}
const CREATOR_RECIPE_REQUEST_LINK = {
  pathname: "/community/board/write",
  search: "?type=inquiry&template=creator-recipe",
};
const recipeActionClass = "w-full justify-center min-[420px]:w-auto";
const metadataCodeClass = "max-w-full break-all rounded-[var(--r-sm)] px-1.5 py-0.5";

function parseCreatorTab(value: string | null): CreatorTab {
  return value === "recipes" || value === "share" ? value : "featured";
}

function parseCreatorSection(value: string | undefined): CreatorSection {
  if (value === "deploy" || value === "examples" || value === "recipes" || value === "share") return value;
  return "overview";
}

function sectionDefaultTab(section: CreatorSection, value: string | null): CreatorTab {
  if (section === "recipes") return "recipes";
  if (section === "share") return "share";
  return parseCreatorTab(value);
}

function buildCopy(language: string) {
  const ko = language.startsWith("ko");
  return {
    title: standaloneText(language, "creator_hub_ride_tools"),
    headline: standaloneText(language, "creator_hub_make_more_of_your_rides"),
    eyebrow: standaloneText(language, "creator_hub_turn_your_rides_into_stories_and"),
    subtitle: standaloneText(language, "creator_hub_create_a_diary_or_prepare_a"),
    tabs: {
      featured: standaloneText(language, "creator_hub_featured"),
      recipes: standaloneText(language, "creator_hub_recipes"),
      share: standaloneText(language, "creator_hub_share_cards"),
    },
    actions: {
      preview: standaloneText(language, "creator_hub_preview_share_card"),
      recipe: standaloneText(language, "creator_hub_view_ideas"),
      generate: standaloneText(language, "creator_hub_generate_diary"),
      generating: standaloneText(language, "creator_hub_generating_diary"),
      post: standaloneText(language, "creator_hub_share_as_post"),
      copy: standaloneText(language, "creator_hub_copy_card_text"),
      copied: standaloneText(language, "creator_hub_copied"),
      copyPrompt: standaloneText(language, "creator_hub_copy_prompt"),
      promptCopied: standaloneText(language, "creator_hub_prompt_copied"),
      loginNeeded: standaloneText(language, "creator_hub_sign_in_to_generate"),
      submitRecipe: standaloneText(language, "creator_hub_orider_public_repository"),
      requestRecipe: standaloneText(language, "creator_hub_request_recipe"),
      manageApiKeys: standaloneText(language, "creator_hub_create_api_key"),
      emailRecipe: standaloneText(language, "creator_hub_email_me_this"),
      chooseRideStory: standaloneText(language, "creator_hub_choose_photo_route"),
      emailing: standaloneText(language, "creator_hub_sending_email"),
      emailed: standaloneText(language, "creator_hub_sent"),
      emailFailed: standaloneText(language, "creator_hub_could_not_send_email"),
      emailQuota: standaloneText(language, "creator_hub_used_limit_sent_today"),
      emailQuotaExceeded: standaloneText(language, "creator_hub_you_ve_used_today_s_recipe"),
      emailCooldown: standaloneText(language, "creator_hub_you_can_resend_the_same_recipe"),
      emailLimitReached: standaloneText(language, "creator_hub_limit_reached"),
      emailCooldownShort: standaloneText(language, "creator_hub_wait_1_min"),
      copyChart: standaloneText(language, "creator_hub_copy_chart_card"),
      report: standaloneText(language, "creator_hub_report"),
      reported: standaloneText(language, "creator_hub_under_review"),
      reportFailed: standaloneText(language, "creator_hub_could_not_submit_report"),
      previewOpened: standaloneText(language, "creator_hub_opened_the_share_card_preview"),
      loginPrompt: standaloneText(language, "creator_hub_sign_in_to_generate_this_from"),
      emailLogin: standaloneText(language, "creator_hub_sign_in_to_send_this_only"),
      reportLogin: standaloneText(language, "creator_hub_sign_in_to_report_this_recipe"),
      copyFailed: standaloneText(language, "creator_hub_check_clipboard_permission_and_try_again"),
      deploy: standaloneText(language, "creator_hub_view_deployment_path"),
      deployOpened: standaloneText(language, "creator_hub_showing_the_recipe_deployment_flow"),
    },
    pathsTitle: standaloneText(language, "creator_hub_choose_your_role"),
    paths: [
      {
        title: standaloneText(language, "creator_hub_rider_try_first"),
        body: standaloneText(language, "creator_hub_before_deploying_a_recipe_preview_the"),
        action: standaloneText(language, "creator_hub_view_demo_card"),
        tab: "share" as CreatorTab,
      },
      {
        title: standaloneText(language, "creator_hub_operator_deploy_a_recipe"),
        body: standaloneText(language, "creator_hub_create_a_developer_api_key_choose"),
        action: standaloneText(language, "creator_hub_see_connection_steps"),
        tab: "recipes" as CreatorTab,
      },
      {
        title: standaloneText(language, "creator_hub_maker_propose_a_workflow"),
        body: standaloneText(language, "creator_hub_no_development_knowledge_is_required_request"),
        action: standaloneText(language, "creator_hub_request_recipe"),
        tab: "featured" as CreatorTab,
      },
    ],
    deployTitle: standaloneText(language, "creator_hub_how_recipes_get_deployed"),
    deployBody: standaloneText(language, "creator_hub_choose_where_to_run_a_recipe"),
    deploySteps: [
      {
        title: standaloneText(language, "creator_hub_1_choose_runtime"),
        body: standaloneText(language, "creator_hub_decide_whether_it_runs_inside_orider"),
      },
      {
        title: standaloneText(language, "creator_hub_2_set_scopes_and_visibility"),
        body: standaloneText(language, "creator_hub_choose_only_the_required_scopes_and"),
      },
      {
        title: standaloneText(language, "creator_hub_3_deploy_trigger"),
        body: standaloneText(language, "creator_hub_set_when_it_runs_monday_morning"),
      },
      {
        title: standaloneText(language, "creator_hub_4_operate_and_stop"),
        body: standaloneText(language, "creator_hub_track_the_last_run_errors_remaining"),
      },
    ],
    credit: {
      title: standaloneText(language, "creator_hub_ai_ride_diary_generation"),
      body: standaloneText(language, "creator_hub_ai_turns_your_last_7_days"),
      rules: [
        standaloneText(language, "creator_hub_only_successful_diary_generations_count_toward"),
        standaloneText(language, "creator_hub_unchanged_records_reuse_the_saved_draft"),
        standaloneText(language, "creator_hub_edit_your_highlight_and_save_a"),
      ],
      quotaUnknown: standaloneText(language, "creator_hub_remaining_ai_credits_appear_after_generation"),
      remaining: standaloneText(language, "creator_hub_remaining_limit_ai_credits_left_today"),
      cache: standaloneText(language, "creator_hub_loaded_today_s_existing_draft"),
      failed: standaloneText(language, "creator_hub_could_not_generate_the_diary_check"),
    },
    stats: [
      { label: standaloneText(language, "creator_hub_ways_to_use"), value: standaloneText(language, "creator_hub_diaries_reports_share_cards") },
      { label: standaloneText(language, "creator_hub_how_to_use"), value: standaloneText(language, "creator_hub_run_here_or_connect_tools") },
      { label: standaloneText(language, "creator_hub_data_access"), value: standaloneText(language, "creator_hub_rider_approved") },
    ],
    marketTitle: standaloneText(language, "creator_hub_a_recipe_hub_needs_structure_before"),
    marketBody: standaloneText(language, "creator_hub_for_creator_hub_to_scale_more"),
    marketStages: [
      {
        title: standaloneText(language, "creator_hub_1_discover"),
        body: standaloneText(language, "creator_hub_find_recipes_with_clear_outcomes_such"),
      },
      {
        title: standaloneText(language, "creator_hub_2_inspect"),
        body: standaloneText(language, "creator_hub_review_scopes_external_delivery_public_fields"),
      },
      {
        title: standaloneText(language, "creator_hub_3_deploy"),
        body: standaloneText(language, "creator_hub_run_inside_orider_or_connect_to"),
      },
      {
        title: standaloneText(language, "creator_hub_4_operate"),
        body: standaloneText(language, "creator_hub_track_last_run_errors_quota_and"),
      },
    ],
    marketRulesTitle: standaloneText(language, "creator_hub_hub_principles"),
    marketRules: [
      standaloneText(language, "creator_hub_run_only_rider_approved_recipes_so"),
      standaloneText(language, "creator_hub_keep_scopes_minimal_and_sensitive_fields"),
      standaloneText(language, "creator_hub_stopping_deployments_and_revoking_keys_matter"),
      standaloneText(language, "creator_hub_public_outputs_should_be_aggregates_cards"),
    ],
    card: {
      outcome: standaloneText(language, "creator_hub_output"),
      delivery: standaloneText(language, "creator_hub_delivery"),
      why: standaloneText(language, "creator_hub_why_it_helps"),
      deploy: standaloneText(language, "creator_hub_deployment"),
    },
    email: {
      title: standaloneText(language, "creator_hub_report_template_email"),
      body: standaloneText(language, "creator_hub_flagship_recipes_can_send_a_real"),
      safety: standaloneText(language, "creator_hub_no_arbitrary_recipient_entry_orider_sends"),
    },
    privacyTitle: standaloneText(language, "creator_hub_before_anything_is_shared"),
    privacy: [
      standaloneText(language, "creator_hub_exact_start_locations_and_route_geometry"),
      standaloneText(language, "creator_hub_health_and_effort_metrics_are_opt"),
      standaloneText(language, "creator_hub_ai_diaries_start_as_private_drafts"),
      standaloneText(language, "creator_hub_preview_and_visibility_controls_before_publishing"),
    ],
    shareTitle: standaloneText(language, "creator_hub_ai_ride_diary_share_card"),
    shareSubtitle: standaloneText(language, "creator_hub_keep_the_full_diary_private_and"),
    shareCard: {
      label: standaloneText(language, "creator_hub_example_ride_diary"),
      title: standaloneText(language, "creator_hub_example_a_steady_week_through_the"),
      body: standaloneText(language, "creator_hub_example_data_182_km_total_with"),
      footer: standaloneText(language, "creator_hub_exact_location_and_sensitive_metrics_hidden"),
    },
    builderTitle: standaloneText(language, "creator_hub_propose_what_you_want_to_build"),
    builderBody: standaloneText(language, "creator_hub_you_do_not_need_to_be"),
    useModesTitle: standaloneText(language, "creator_hub_how_can_i_use_this"),
    useModes: [
      {
        title: standaloneText(language, "creator_hub_try_it_inside_orider"),
        body: standaloneText(language, "creator_hub_use_in_product_actions_such_as"),
        action: standaloneText(language, "creator_hub_view_share_cards"),
        to: "/explore/recipes/share",
      },
      {
        title: standaloneText(language, "creator_hub_connect_it_to_your_own_tools"),
        body: standaloneText(language, "creator_hub_create_a_personal_api_key_in"),
        action: standaloneText(language, "creator_hub_view_examples"),
        to: "/explore/recipes/examples",
      },
      {
        title: standaloneText(language, "creator_hub_request_an_idea"),
        body: standaloneText(language, "creator_hub_no_code_is_required_requests_for"),
        action: standaloneText(language, "creator_hub_request_recipe"),
        to: CREATOR_RECIPE_REQUEST_LINK,
      },
    ],
    integrationsTitle: standaloneText(language, "creator_hub_example_integrations"),
    integrations: [
      {
        name: "Notion",
        label: standaloneText(language, "creator_hub_weekly_load_report"),
        goal: standaloneText(language, "creator_hub_generate_an_html_report_and_notion"),
        prepare: ko
          ? ["공개 저장소의 docs/recipes/weekly-load-report.md와 docs/recipes/report-template.md를 먼저 읽습니다.", "오라이더 설정 → Developer API에서 activities:read, fitness:read scope만 포함한 key를 만듭니다.", "n8n, GitHub Actions, 개인 서버 중 하나를 월요일 오전에 실행되도록 준비합니다."]
          : ["Read docs/recipes/weekly-load-report-en.md and docs/recipes/report-template-en.md first.", "Create an Orider Developer API key with only activities:read and fitness:read scopes.", "Prepare n8n, GitHub Actions, or your own server to run on Monday morning."],
        steps: ko
          ? ["예제 스크립트 examples/recipes/weekly-load-report/weekly-load-report.mjs로 HTML/JSON/TXT 산출물을 만듭니다.", "최근 7일과 직전 7일의 거리, 시간, 상승고도, 부하를 비교합니다.", "HTML에는 KPI 카드와 일별 부하 막대 차트를 넣고, Notion에는 public-safe 집계 요약만 저장합니다.", "지도/경로 썸네일은 streams:read를 켠 private HTML에서 Swagger/OpenAPI에 문서화된 endpoint로만 선택적으로 사용합니다."]
          : ["Run examples/recipes/weekly-load-report/weekly-load-report.mjs to create HTML/JSON/TXT outputs.", "Compare distance, duration, elevation, and load for the last 7 days versus the previous 7 days.", "Put KPI cards and a daily load bar chart in HTML; store only public-safe aggregates in Notion.", "Use map/route thumbnails only in private HTML through the endpoint documented in Swagger/OpenAPI when streams:read is explicitly enabled."],
        result: standaloneText(language, "creator_hub_on_monday_morning_you_get_a"),
        safety: standaloneText(language, "creator_hub_keep_home_area_starts_detailed_routes"),
        aiPrompt: standaloneText(language, "creator_hub_you_are_the_automation_implementer_write"),
      },
      {
        name: "Slack",
        label: standaloneText(language, "creator_hub_private_recovery_alert"),
        goal: standaloneText(language, "creator_hub_send_yourself_a_recovery_nudge_before"),
        prepare: ko
          ? ["Slack Incoming Webhook 또는 개인 DM bot token을 준비합니다.", "오라이더 API key는 activities:read만 허용합니다.", "알림 기준을 정합니다. 예: 3일 중 2일 이상 고강도, 또는 7일 부하가 평소보다 30% 이상 증가."]
          : ["Prepare a Slack Incoming Webhook or a private DM bot token.", "Allow only activities:read on the Orider API key.", "Define the alert rule, such as two hard days in three days or 30% higher weekly load."],
        steps: ko
          ? ["매일 오전 최근 7일 활동 시간, 강도, 부하만 읽습니다.", "정한 기준을 넘으면 개인 DM으로 '오늘은 Z1/Z2 회복주 권장' 메시지를 보냅니다.", "메시지에는 이유를 한 줄로 씁니다. 예: '최근 3일 중 2일이 고강도였습니다.'", "팀 채널에 보내야 한다면 총 시간, 총 거리 같은 집계값만 따로 선택합니다."]
          : ["Every morning, read only the last 7 days of duration, intensity, and load.", "When the rule matches, send a private DM recommending a Z1/Z2 recovery ride.", "Include one short reason, such as '2 of the last 3 days were hard.'", "If posting to a team channel, choose only aggregate duration or distance."],
        result: standaloneText(language, "creator_hub_you_receive_a_private_slack_dm"),
        safety: standaloneText(language, "creator_hub_test_in_a_private_dm_for"),
        aiPrompt: standaloneText(language, "creator_hub_you_are_the_automation_implementer_write_2"),
      },
      {
        name: "n8n",
        label: standaloneText(language, "creator_hub_monthly_badge_automation"),
        goal: standaloneText(language, "creator_hub_create_a_monthly_badge_and_email"),
        prepare: ko
          ? ["n8n에 Cron, HTTP Request, Set, Email 노드를 만듭니다.", "오라이더 API key는 activities:read만 허용합니다.", "공개할 항목을 미리 정합니다. 추천: 총 거리, 상승고도, 활동 수, 최장 라이딩 거리."]
          : ["Create Cron, HTTP Request, Set, and Email nodes in n8n.", "Allow only activities:read on the Orider API key.", "Pick public fields first: total distance, elevation, activity count, and longest ride."],
        steps: ko
          ? ["Cron을 매월 1일 오전 9시로 설정합니다.", "HTTP Request 노드가 지난달 활동 집계를 가져옵니다.", "Set 노드에서 공개 문구를 만듭니다. 예: '6월 18회 · 642km · 7,820m 상승'.", "Email 노드로 본인에게 먼저 보내고, 확인 후 블로그나 프로필에 붙입니다."]
          : ["Set Cron to 9 AM on the first day of each month.", "Use HTTP Request to fetch last month's aggregate activity data.", "Use Set to create public copy, such as 'June: 18 rides · 642 km · 7,820 m climbed.'", "Email it to yourself first, then paste it into a blog or profile after review."],
        result: standaloneText(language, "creator_hub_at_the_start_of_each_month"),
        safety: standaloneText(language, "creator_hub_prefer_email_to_myself_first_review"),
        aiPrompt: standaloneText(language, "creator_hub_you_are_the_n8n_automation_implementer"),
      },
      {
        name: standaloneText(language, "creator_hub_personal_site"),
        label: standaloneText(language, "creator_hub_public_profile_badge"),
        goal: standaloneText(language, "creator_hub_add_a_current_ride_status_badge"),
        prepare: ko
          ? ["개인 사이트에서 읽을 수 있는 작은 JSON 파일 또는 API endpoint를 준비합니다.", "오라이더 API key는 월간 집계만 읽도록 제한합니다.", "방문자에게 보여줄 항목을 3~4개로 제한합니다."]
          : ["Prepare a small JSON file or endpoint that your personal site can read.", "Limit the Orider API key to monthly aggregates.", "Limit public fields to three or four items."],
        steps: ko
          ? ["하루 1회 또는 월 1회 집계 데이터를 읽습니다.", "JSON에는 month, distanceKm, elevationM, rideCount, updatedAt만 남깁니다.", "사이트에서는 이 JSON을 읽어 '이번 달 642km 라이딩' 같은 작은 배지로 보여줍니다.", "API key가 노출되지 않도록 브라우저가 오라이더 API를 직접 호출하지 않게 합니다."]
          : ["Read aggregate data daily or monthly.", "Keep only month, distanceKm, elevationM, rideCount, and updatedAt in the JSON.", "Render a small badge such as '642 km ridden this month.'", "Do not let the browser call the Orider API directly with your API key."],
        result: standaloneText(language, "creator_hub_your_profile_shows_rider_identity_without"),
        safety: standaloneText(language, "creator_hub_keep_api_keys_on_a_server"),
        aiPrompt: standaloneText(language, "creator_hub_you_are_the_web_automation_implementer"),
      },
    ],
    apiPath: {
      title: standaloneText(language, "creator_hub_shortest_path_to_connect_your_own"),
      body: standaloneText(language, "creator_hub_external_tools_do_not_copy_a"),
      steps: [
        standaloneText(language, "creator_hub_1_create_a_personal_api_key"),
        standaloneText(language, "creator_hub_2_call_endpoints_from_swagger_openapi"),
        standaloneText(language, "creator_hub_3_choose_a_trigger_manual_daily"),
        standaloneText(language, "creator_hub_4_aggregate_or_remove_sensitive_data"),
      ],
    },
    apiDocs: {
      title: standaloneText(language, "creator_hub_api_contract"),
      body: standaloneText(language, "creator_hub_when_implementing_recipes_confirm_endpoint_paths"),
      swagger: standaloneText(language, "creator_hub_open_swagger_ui"),
      yaml: standaloneText(language, "creator_hub_view_openapi_yaml"),
    },
    weekly: {
      title: standaloneText(language, "creator_hub_weekly_distance"),
      body: standaloneText(language, "creator_hub_compare_weekly_distance_with_the_supporting"),
      empty: standaloneText(language, "creator_hub_no_activities_to_chart_yet"),
      demo: standaloneText(language, "creator_hub_demo_data"),
      own: standaloneText(language, "creator_hub_my_data"),
      distance: standaloneText(language, "creator_hub_distance"),
      time: standaloneText(language, "creator_hub_activity_time"),
      rides: standaloneText(language, "creator_hub_activities"),
      tss: standaloneText(language, "creator_hub_training_score"),
      shareTitle: standaloneText(language, "creator_hub_my_last_6_weeks_of_training"),
    },
  };
}

function demoWeeklyStats(): WeeklyStat[] {
  return [
    { week: "5/11", distance: 84, time: 3.4, elevation: 620, rides: 2, tss: 132, tssEstimated: false, tssUnknownCount: 0 },
    { week: "5/18", distance: 126, time: 4.9, elevation: 1040, rides: 3, tss: 211, tssEstimated: false, tssUnknownCount: 0 },
    { week: "5/25", distance: 94, time: 3.7, elevation: 760, rides: 2, tss: 158, tssEstimated: false, tssUnknownCount: 0 },
    { week: "6/1", distance: 162, time: 6.2, elevation: 1510, rides: 4, tss: 302, tssEstimated: false, tssUnknownCount: 0 },
    { week: "6/8", distance: 118, time: 4.4, elevation: 870, rides: 3, tss: 196, tssEstimated: false, tssUnknownCount: 0 },
    { week: "6/15", distance: 188, time: 7.1, elevation: 2140, rides: 4, tss: 344, tssEstimated: false, tssUnknownCount: 0 },
  ];
}


function diaryFailureMessage(error: unknown, language: string, fallback: string): string {
  const sharedFeedback = creatorRecipeErrorFeedback(error, language, "diary");
  if (sharedFeedback) return sharedFeedback.message;
  const details = error && typeof error === "object" && "details" in error ? error.details : null;
  const reason = details && typeof details === "object" && "reason" in details ? details.reason : null;
  switch (reason) {
    case "no-activities": return standaloneText(language, "creator_hub_no_cycling_activities_from_the_last");
    case "in-flight": return standaloneText(language, "creator_hub_a_diary_is_already_being_generated");
    case "daily-limit": return standaloneText(language, "creator_hub_you_have_used_today_s_ai");
    case "attempt-limit": return standaloneText(language, "creator_hub_the_repeated_request_safety_limit_has");
    case "consent-required": return standaloneText(language, "creator_hub_please_review_the_current_ai_processing");
    default: return fallback;
  }
}

export default function CreatorHubPage({ section: sectionOverride }: { /** 앱 탐색 임베드는 경로 대신 쿼리로 섹션을 넘긴다. */ section?: string | null } = {}) {
  const { i18n } = useTranslation();
  const { t: loadT } = useTranslation("dashboard");
  const { user, signIn } = useAuth();
  const { showToast } = useToast();
  // 임베드(앱 탐색 탭)는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 인스턴스(#847).
  const { functions } = useFirebaseServices();
  const { section: routeSection } = useParams<{ section?: string }>();
  const sectionParam = sectionOverride ?? routeSection;
  const navigate = useLocalizedNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { weeklyStats } = useWeeklyStats();
  const copy = useMemo(() => buildCopy(i18n.language), [i18n.language]);
  const apiDocsLinks = creatorApiDocsLinks();
  const section = parseCreatorSection(sectionParam);
  const tabParam = searchParams.get("tab");
  const [tab, setTabState] = useState<CreatorTab>(() => sectionDefaultTab(section, tabParam));
  const [chartCopied, setChartCopied] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [copyingPromptId, setCopyingPromptId] = useState<string | null>(null);
  const [reportedItemIds, setReportedItemIds] = useState<Set<string>>(() => new Set());
  const [reportingItemIds, setReportingItemIds] = useState<Set<string>>(() => new Set());
  const [reportFailedItemIds, setReportFailedItemIds] = useState<Set<string>>(() => new Set());
  const [savedDiary, setDiary] = useState<AiDiaryResponse | null>(null);
  const [diaryOwnerId, setDiaryOwnerId] = useState<string | null>(null);
  const diary = diaryOwnerId === user?.uid ? savedDiary : null;
  const [diaryPolicy, setDiaryPolicy] = useState<AiDiaryPolicy | null>(null);
  const consentDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (diaryPolicy) consentDialogRef.current?.showModal(); }, [diaryPolicy]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const diaryOwner = useRef(user?.uid);
  diaryOwner.current = user?.uid;
  useEffect(() => { setDiary(null); setDiaryError(null); setDiaryPolicy(null); }, [user?.uid]);
  // resolveTo: 문구를 누르면 갈 해결 화면(활동 없음 → 활동 가져오기, 처리 한도 → 문의 게시판).
  const [diaryError, setDiaryError] = useState<{ message: string; resolveTo?: string } | null>(null);
  const {
    emailFailedItemIds,
    emailQuota,
    emailSendingId,
    emailSentItemIds,
    handleEmailRecipe: sendCreatorRecipeEmail,
    markEmailFailed,
    markEmailSent,
    quotaNow,
  } = useCreatorRecipeEmail({
    user,
    language: i18n.language,
    actions: copy.actions,
    showToast,
    signIn,
  });
  const [previewRequest, setPreviewRequest] = useState<RecipePreviewRequest | null>(null);
  useEffect(() => { setPreviewRequest(null); }, [user?.uid]);
  const [rideStoryPickerOpen, setRideStoryPickerOpen] = useState(false);
  const deploySectionRef = useRef<HTMLElement | null>(null);
  const recipesSectionRef = useRef<HTMLDivElement | null>(null);
  const shareSectionRef = useRef<HTMLDivElement | null>(null);

  const items: CreatorItem[] = useMemo(() => {
    const locale = i18n.language.startsWith("ko") ? "ko" : "en";
    return creatorRecipes.map((recipe) => {
      const localized = recipe[locale];
      return {
        id: recipe.id,
        kind: recipe.kind,
        icon: iconMap[recipe.icon],
        title: localized.title,
        summary: localized.summary,
        outcome: localized.outcome,
        detail: localized.detail,
        scopes: recipe.scopes,
        channels: recipe.channels,
        showShareCardPreview: recipe.showShareCardPreview,
        labels: localized.labels,
        scopeLabel: localized.scopeLabel ?? (locale === "ko" ? "Scopes · 직접 만드는 확장판" : "Scopes · extension only"),
        shareMode: localized.shareMode,
        deployMode: localized.deployMode,
        status: localized.status,
      };
    });
  }, [i18n.language]);

  const visibleItems = items.filter((item) => {
    if (tab === "featured") return true;
    if (tab === "recipes") return item.id !== "ai-diary";
    return item.id === "ai-diary" || item.id === "ride-story" || item.id === "ride-widget";
  });

  const chartWeeks = useMemo(() => {
    // 부하 미확인은 원본 거리와 별개 상태다. 실제 입력과 명시된 예시를 분리한다.
    const actual = weeklyStats.filter((week) => week.rides > 0 || week.distance > 0 || (week.tss ?? 0) > 0).slice(-6);
    return user ? actual : demoWeeklyStats();
  }, [weeklyStats, user]);
  const chartMax = Math.max(1, ...chartWeeks.map((week) => week.distance));
  const chartTotal = chartWeeks.reduce(
    (acc, week) => ({
      distance: acc.distance + week.distance,
      time: acc.time + week.time,
      rides: acc.rides + week.rides,
      tss: acc.tss + (week.tss ?? 0),
    }),
    { distance: 0, time: 0, rides: 0, tss: 0 },
  );
  const chartTotalLoad = {
    tss: chartWeeks.some((week) => week.tss !== null) ? chartTotal.tss : null,
    tssEstimated: chartWeeks.some((week) => week.tssEstimated),
    tssUnknownCount: chartWeeks.reduce((sum, week) => sum + (week.tssUnknownCount ?? 0), 0),
  };
  const chartUsesOwnData = Boolean(user && weeklyStats.some((week) => week.rides > 0 || week.distance > 0 || (week.tss ?? 0) > 0));
  const shareCard = diary?.shareCard ?? copy.shareCard;
  const weeklyShareText = `${copy.weekly.shareTitle} (${chartWeeks[0]?.week ?? ""} – ${chartWeeks[chartWeeks.length - 1]?.week ?? ""})\n${copy.weekly.distance}: ${Math.round(chartTotal.distance)}km · ${copy.weekly.time}: ${chartTotal.time.toFixed(1)}h · ${copy.weekly.rides}: ${chartTotal.rides} · ${formatTrainingLoad(chartTotalLoad, loadT)}\n${chartUsesOwnData ? copy.weekly.own : user ? copy.weekly.empty : copy.weekly.demo}`;

  useEffect(() => {
    setTabState(sectionDefaultTab(section, tabParam));
  }, [section, tabParam]);

  useEffect(() => {
    const scroller = document.querySelector("main");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTo({ top: 0 });
    }
  }, [section]);

  const scrollToTarget = (target: CreatorScrollTarget) => {
    window.requestAnimationFrame(() => {
      const element =
        target === "deploy"
          ? deploySectionRef.current
          : target === "share"
            ? shareSectionRef.current
            : recipesSectionRef.current;
      if (!element) return;
      const scroller = element.closest("main");
      if (scroller instanceof HTMLElement) {
        const elementRect = element.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        scroller.scrollTo({
          top: scroller.scrollTop + elementRect.top - scrollerRect.top - 18,
          behavior: "smooth",
        });
        return;
      }
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const setTab = (nextTab: CreatorTab, scrollTarget?: CreatorScrollTarget) => {
    if (scrollTarget === "deploy") {
      navigate("/explore/recipes/deploy");
      return;
    }
    if (scrollTarget === "share" || nextTab === "share") {
      navigate("/explore/recipes/share");
      return;
    }
    if (scrollTarget === "recipes" || nextTab === "recipes") {
      navigate("/explore/recipes/recipes");
      return;
    }
    setTabState(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "featured") nextParams.delete("tab");
    else nextParams.set("tab", nextTab);
    setSearchParams(nextParams, { replace: true });
    if (scrollTarget) scrollToTarget(scrollTarget);
  };

  const handleCopyChart = async () => {
    try {
      await navigator.clipboard.writeText(weeklyShareText);
      setChartCopied(true);
      showToast(copy.actions.copied);
      window.setTimeout(() => setChartCopied(false), 1600);
    } catch {
      showToast(copy.actions.copyFailed, "error");
    }
  };

  const handleCopyPrompt = async (promptId: string, prompt: string) => {
    if (copyingPromptId === promptId) return;
    setCopyingPromptId(promptId);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPromptId(promptId);
      showToast(copy.actions.promptCopied);
      window.setTimeout(() => setCopiedPromptId((current) => (current === promptId ? null : current)), 1600);
    } catch {
      showToast(copy.actions.copyFailed, "error");
    } finally {
      setCopyingPromptId((current) => (current === promptId ? null : current));
    }
  };

  const handleEmailRecipe = async (itemId: string) => {
    if (!user) {
      showToast(copy.actions.emailLogin, "info");
      await signIn();
      return;
    }

    if (itemId === "ride-story") {
      setRideStoryPickerOpen(true);
      return;
    }

    await sendCreatorRecipeEmail(itemId);
  };
  const handleGenerateDiary = async () => {
    if (!user) {
      showToast(copy.actions.loginPrompt, "info");
      await signIn();
      return;
    }
    if (generating || policyLoading) return;
    const owner = user.uid;
    setPolicyLoading(true);
    setDiaryError(null);
    try {
      const policy = await httpsCallable<{ lang: string }, AiDiaryPolicy>(functions, "getCreatorAiDiaryPolicy")({ lang: i18n.language.startsWith("ko") ? "ko" : "en" });
      if (diaryOwner.current === owner) setDiaryPolicy(policy.data);
    } catch (error) {
      const message = diaryFailureMessage(error, i18n.language, copy.credit.failed);
      const resolveTo = creatorRecipeErrorResolveTo(error);
      setDiaryError({ message, resolveTo });
      if (resolveTo) showToast(message, "error", { resolve: { to: resolveTo } });
      else showToast(message, "error");
    } finally { setPolicyLoading(false); }
  };
  const generateConsentedDiary = async () => {
    if (!user || !diaryPolicy) return;
    const consentVersion = diaryPolicy.version;
    setDiaryPolicy(null);
    if (generating) return;
    const owner = user.uid;
    setGenerating(true);
    setDiaryError(null);
    try {
      const fn = httpsCallable<{ lang: string; period: "week"; consentVersion: string }, AiDiaryResponse>(
        functions,
        "generateAiDiary",
        { timeout: 90_000 },
      );
      const result = await fn({ lang: i18n.language.startsWith("en") ? "en" : "ko", period: "week", consentVersion });
      if (diaryOwner.current !== owner) return;
      setDiaryOwnerId(owner);
      setDiary(result.data);
      setTab("share", "share");
      showToast(result.data.source === "cache" ? copy.credit.cache : copy.actions.previewOpened);
    } catch (error) {
      const message = diaryFailureMessage(error, i18n.language, copy.credit.failed);
      const resolveTo = creatorRecipeErrorResolveTo(error);
      setDiaryError({ message, resolveTo });
      if (resolveTo) showToast(message, "error", { resolve: { to: resolveTo } });
      else showToast(message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleReportItem = async (itemId: string) => {
    if (!user) {
      showToast(copy.actions.reportLogin, "info");
      await signIn();
      return;
    }
    if (reportedItemIds.has(itemId) || reportingItemIds.has(itemId)) return;
    setReportingItemIds((prev) => new Set(prev).add(itemId));
    try {
      const fn = httpsCallable<{ itemId: string; reason: string }, { reportId: string; status: string }>(
        functions,
        "reportCreatorShowcaseItem",
      );
      await fn({ itemId, reason: "other" });
      setReportFailedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setReportedItemIds((prev) => new Set(prev).add(itemId));
      showToast(copy.actions.reported);
    } catch {
      setReportFailedItemIds((prev) => new Set(prev).add(itemId));
      showToast(copy.actions.reportFailed, "error");
    } finally {
      setReportingItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const detailLinks = useMemo(() => buildCreatorHubDetailLinks(i18n.language), [i18n.language]);
  const activeDetail = detailLinks.find((link) => link.to.endsWith(`/${section}`));

  return (
    <GlossaryProvider scopeKey={`record-tools:${section}`}>
    <div className="event-controls-surface explore-records-surface space-y-4">
      {diaryPolicy && <dialog ref={consentDialogRef} className="fixed inset-0 m-auto w-full max-w-xl bg-transparent p-4 backdrop:bg-black/55" aria-labelledby="creator-ai-consent-title" onCancel={() => setDiaryPolicy(null)}>
        <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[var(--r-lg)] border p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)", color: "var(--ink-2)" }}>
          <h2 id="creator-ai-consent-title" className="text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{i18n.t("creatorHubCopy.consent_to_ai_ride_diary_generation", { ns: "common" })}</h2>
          <p className="text-[length:var(--fs-sm)] leading-6">{diaryPolicy.purpose}</p>
          <dl className="space-y-3 text-[length:var(--fs-sm)] leading-6">
            <div><dt className="font-semibold">{i18n.t("creatorHubCopy.external_ai_processor_country", { ns: "common" })}</dt><dd>{diaryPolicy.processor.name} · {diaryPolicy.processor.country}</dd></div>
            <div><dt className="font-semibold">{i18n.t("creatorHubCopy.data_sent", { ns: "common" })}</dt><dd>{diaryPolicy.dataCategories.join(" · ")}</dd></div>
            {diaryPolicy.excludedData && <div><dt className="font-semibold">{i18n.t("creatorHubCopy.data_excluded", { ns: "common" })}</dt><dd>{diaryPolicy.excludedData.join(" · ")}</dd></div>}
            <div><dt className="font-semibold">{i18n.t("creatorHubCopy.retention", { ns: "common" })}</dt><dd>{diaryPolicy.retention}</dd></div>
          </dl>
          <p className="text-[length:var(--fs-sm)] leading-6">{i18n.t("creatorHubCopy.location_activity_names_and_raw_heart", { ns: "common" })}</p>
          <a className="text-[length:var(--fs-sm)] underline" style={{ color: "var(--lime)" }} href={diaryPolicy.processor.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">{i18n.t("creatorHubCopy.ai_processor_privacy_policy", { ns: "common" })}</a>
          <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{standaloneText(i18n.language, "creator_hub_daily_generation_policy", { limit: String(diaryPolicy.dailyLimit) })}</p>
          <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setDiaryPolicy(null)}>{i18n.t("creatorHubCopy.cancel", { ns: "common" })}</Button><Button size="sm" variant="primary" onClick={() => void generateConsentedDiary()}>{i18n.t("creatorHubCopy.agree_and_generate", { ns: "common" })}</Button></div>
        </div>
      </dialog>}

      <section className="grid gap-4">
        {/* 제목은 다른 탐색 화면처럼 카드 밖, 하위 탭 바로 아래(셸 여백 16)에 둔다. */}
        {section === "overview" && <header>
          <Text as="h1" variant="pageTitle" data-testid="E6-0" className="max-w-4xl">{copy.headline}</Text>
          <p className="mt-2 max-w-4xl text-[length:var(--fs-base)] leading-7" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.subtitle}</GlossaryText></p>
        </header>}
        <div className="min-w-0 rounded-[var(--r-lg)] border p-6 md:p-8" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          {section === "overview" ? (
          <>
          <div className="inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--ft-body-size)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--lime)" }}>
            <Sparkles size={ICON_SIZE.sm} />
            {copy.eyebrow}
          </div>
          <div className="mt-4 grid gap-2 min-[420px]:flex min-[420px]:flex-wrap">
            <Button className={recipeActionClass} size="sm" variant="secondary" onClick={handleGenerateDiary} loading={generating || policyLoading}>
              <Bot size={ICON_SIZE.sm} />
              {user ? (generating ? copy.actions.generating : copy.actions.generate) : copy.actions.loginNeeded}
            </Button>
            <Link to="/community/board/write" className={buttonClass({ variant: "primary", size: "sm", className: recipeActionClass })}>
                <MessageSquareText size={ICON_SIZE.sm} aria-hidden />
                {copy.actions.post}
            </Link>
            <Link to="/explore/recipes/recipes" className={buttonClass({ variant: "secondary", size: "sm", className: recipeActionClass })}>
                <BookOpen size={ICON_SIZE.sm} />
                {copy.actions.recipe}
            </Link>

          </div>
          </>
          ) : (
          <>
            <Link to="/explore/recipes" className="inline-flex items-center gap-2 text-[length:var(--ft-body-size)] font-medium no-underline" style={{ color: "var(--lime)" }}>
              <BookOpen size={ICON_SIZE.sm} />
              {copy.title}
            </Link>
            <h1 className="mt-3 max-w-3xl text-[length:var(--fs-xl)] font-bold leading-tight" style={{ color: "var(--ink-0)" }}>{activeDetail?.title ?? copy.title}</h1>
            <p className="mt-2 max-w-3xl text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}>{activeDetail?.body ?? copy.subtitle}</p>
          </>
          )}
        </div>

        {section === "overview" && (
        <details className="creator-technical-summary">
          <summary>{i18n.t("creatorHubCopy.connections_and_data_access", { ns: "common" })}</summary>
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
          {copy.stats.map((stat) => (
            <div key={stat.label} className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
              <Text as="div" variant="eyebrow">{stat.label}</Text>
              <div className="mt-1 text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{stat.value}</div>
            </div>
          ))}
        </div>
        </details>
        )}
      </section>


      {section === "overview" && (
      <section className="rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>
          {i18n.t("creatorHubCopy.more_ways_to_use_your_rides", { ns: "common" })}
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[...detailLinks].sort((a, b) => Number(b.to.endsWith("/share")) - Number(a.to.endsWith("/share"))).map((link) => {
            const DetailIcon = link.icon;
            return (
              <Link key={link.to} to={link.to} className="rounded-[var(--r-md)] border p-4 no-underline" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}>
                <div className="flex items-center gap-2 text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)" }}>
                  <DetailIcon size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
                  {link.title}
                </div>
                <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>{link.body}</p>
              </Link>
            );
          })}
        </div>
      </section>
      )}

      {section === "deploy" && (
      <section ref={deploySectionRef} className="scroll-mt-28 rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.deployTitle}</GlossaryText></h2>
            <p className="mt-2 max-w-4xl text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.deployBody}</GlossaryText></p>
          </div>
          <Link to="/settings/developer" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <KeyRound size={ICON_SIZE.sm} aria-hidden />
            {copy.actions.manageApiKeys}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {copy.deploySteps.map((step) => (
            <div key={step.title} className="rounded-[var(--r-md)] border p-4" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{step.title}</div>
              <p className="mt-2 text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {section === "deploy" && (
      <section className="rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.useModesTitle}</GlossaryText></h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {copy.useModes.map((mode) => {
              const toPath = typeof mode.to === "string" ? mode.to : mode.to.pathname ?? "";
              if (typeof mode.to === "string" && mode.to.startsWith("http")) {
                return (
                  <div key={mode.title} className="flex flex-col rounded-[var(--r-md)] border p-4" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                    <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{mode.title}</div>
                    <p className="mt-2 text-[length:var(--ft-body-size)] leading-6 md:flex-1" style={{ color: "var(--ink-3)" }}>{mode.body}</p>
                    <a href={mode.to} className={buttonClass({ variant: "secondary", size: "sm", className: "mt-4 w-full justify-center" })}>
                      <MessageSquareText size={ICON_SIZE.sm} aria-hidden />
                      {mode.action}
                    </a>
                  </div>
                );
              }
              return (
                <div key={mode.title} className="flex flex-col rounded-[var(--r-md)] border p-4" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                  <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{mode.title}</div>
                  <p className="mt-2 text-[length:var(--ft-body-size)] leading-6 md:flex-1" style={{ color: "var(--ink-3)" }}>{mode.body}</p>
                  <Link to={mode.to} className={buttonClass({ variant: toPath.endsWith("/share") ? "primary" : "secondary", size: "sm", className: "mt-4 w-full justify-center" })}>
                    {toPath.endsWith("/examples") ? <FileText size={ICON_SIZE.sm} aria-hidden /> : <ShieldCheck size={ICON_SIZE.sm} aria-hidden />}
                    {mode.action}
                  </Link>
                </div>
              );
            })}
          </div>
      </section>
      )}

      {section === "examples" && (
      <section data-testid="E6-4" className="rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <h2 className="text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{i18n.t("creatorHubCopy.guides_for_your_tools", { ns: "common" })}</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {copy.integrations.map((item) => (
              <div key={item.name} className="rounded-[var(--r-md)] border p-4 md:p-5" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--lime)" }}>{item.name}</div>
                    <div className="mt-1 text-[length:var(--fs-base)] font-semibold leading-6" style={{ color: "var(--ink-0)" }}><CreatorTechnicalText language={i18n.language}>{item.goal}</CreatorTechnicalText></div>
                  </div>
                  <Chip>{item.label}</Chip>
                </div>
                <div className="mt-4 rounded-[var(--r-sm)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{i18n.t("creatorHubCopy.result", { ns: "common" })}</Text>
                  <p className="mt-1 text-[length:var(--ft-body-size)] font-medium leading-6" style={{ color: "var(--ink-1)" }}><CreatorTechnicalText language={i18n.language}>{item.result}</CreatorTechnicalText></p>
                  <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><CreatorTechnicalText language={i18n.language}>{item.safety}</CreatorTechnicalText></p>
                </div>
                <details className="creator-technical-summary mt-4"><summary>{i18n.t("creatorHubCopy.setup_and_steps", { ns: "common" })}</summary>
                <div className="mt-4 rounded-[var(--r-sm)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{i18n.t("creatorHubCopy.prepare", { ns: "common" })}</Text>
                  <ul className="mt-2 space-y-1.5">
                    {item.prepare.map((step) => (
                      <li key={step} className="text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-2)" }}><CreatorTechnicalText language={i18n.language}>{step}</CreatorTechnicalText></li>
                    ))}
                  </ul>
                </div>
                <Text as="div" variant="eyebrow" className="mt-4">{i18n.t("creatorHubCopy.steps", { ns: "common" })}</Text>
                <ol className="mt-2 space-y-2">
                  {item.steps.map((step) => (
                    <li key={step} className="text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}><CreatorTechnicalText language={i18n.language}>{step}</CreatorTechnicalText></li>
                  ))}
                </ol>

                </details>
                <details className="creator-technical-summary mt-4"><summary>{i18n.t("creatorHubCopy.ai_prompt_and_copy", { ns: "common" })}</summary>
                <div className="mt-4 rounded-[var(--r-sm)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText size={ICON_SIZE.sm} style={{ color: "var(--lime)" }} />
                      <Text as="div" variant="eyebrow">{i18n.t("creatorHubCopy.prompt_for_your_ai_assistant", { ns: "common" })}</Text>
                    </div>
                    <Button data-testid="E6-4-1" size="sm" variant="ghost" loading={copyingPromptId === item.name} onClick={() => void handleCopyPrompt(item.name, item.aiPrompt)}>
                      <Clipboard size={ICON_SIZE.sm} aria-hidden />
                      {copiedPromptId === item.name ? copy.actions.promptCopied : copy.actions.copyPrompt}
                    </Button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-[var(--r-sm)] p-3 text-[length:var(--ft-body-size)] leading-5" style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>
                    {item.aiPrompt}
                  </p>
                </div>
                </details>
              </div>
            ))}
          </div>
      </section>
      )}

      {(section === "recipes" || section === "share") && (
      <div ref={recipesSectionRef} className="scroll-mt-28 flex gap-1 overflow-x-auto rounded-[var(--r-lg)] border p-1" role="tablist" aria-label={i18n.t("surfaceStatus.creatorViews", { ns: "common" })} style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        {(["featured", "recipes", "share"] as CreatorTab[]).map((nextTab) => {
          const active = tab === nextTab;
          return (
            <Button data-testid="E6-1-1"
              key={nextTab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(nextTab)}
              className="h-9 shrink-0 rounded-[var(--r-md)] px-3 text-[length:var(--ft-body-size)] font-medium"
              style={{
                background: active ? "var(--bg-3)" : "transparent",
                color: active ? "var(--ink-0)" : "var(--ink-3)",
              }}
            >
              {copy.tabs[nextTab]}
            </Button>
          );
        })}
      </div>
      )}

      {section === "recipes" && (
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div data-testid="E6-1" className="grid items-start gap-3 md:grid-cols-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const quotaLabel = formatCreatorEmailQuotaLabel(copy.actions.emailQuota, emailQuota);
            const nextAllowedAt = emailQuota?.nextAllowedAtByRecipe[item.id] ?? 0;
            const isEmailCoolingDown = nextAllowedAt > quotaNow;
            const isEmailLimitReached = emailQuota ? emailQuota.remaining <= 0 : false;
            const emailDisabled = isEmailCoolingDown || isEmailLimitReached;
            return (
              <Card key={item.id} padding="none" className="self-start p-4!">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]" style={{ background: "var(--bg-2)", color: kindTone[item.kind] }}>
                      <Icon size={ICON_SIZE.lg} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 break-words text-[length:var(--fs-base)] font-semibold leading-5" style={{ color: "var(--ink-0)" }}>{item.title}</h2>
                        <Chip>{item.status}</Chip>
                      </div>
                      <p className="mt-1 break-words text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>{item.summary}</p>
                    </div>
                </div>

                <div className="mt-4 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.outcome}</Text>
                  <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-1)" }}>{item.outcome}</p>
                  <Text as="div" variant="eyebrow" className="mt-3">{copy.card.why}</Text>
                  <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>{item.detail}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.labels.map((label) => (
                    <Chip key={label}>{label}</Chip>
                  ))}
                </div>

                <details className="creator-technical-summary mt-4">
                  <summary>{i18n.t("creatorHubCopy.data_permissions_and_connections", { ns: "common" })}</summary>
                <div className="mt-4 grid gap-3 text-[length:var(--ft-body-size)] min-[420px]:grid-cols-2" style={{ color: "var(--ink-3)" }}>
                  <div>
                    <Text as="div" variant="eyebrow">{item.scopeLabel}</Text>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.scopes.map((scope) => <code key={scope} className={metadataCodeClass} style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{scope}</code>)}
                    </div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow">{i18n.t("surfaceStatus.share", { ns: "common" })}</Text>
                    <div className="mt-1 break-words" style={{ color: "var(--ink-2)" }}>{item.shareMode}</div>
                  </div>
                </div>
                <div className="mt-3 text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-3)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.delivery}</Text>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.channels.map((channel) => (
                      <code key={channel} className={metadataCodeClass} style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{channel}</code>
                    ))}
                  </div>
                </div>
                <div className="mt-3 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.deploy}</Text>
                  <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>{item.deployMode}</p>
                </div>

                </details>

                <div className="mt-4 grid gap-2 min-[420px]:flex min-[420px]:flex-wrap">
                  <Button data-testid="E6-1-2" className={recipeActionClass} size="sm" variant="secondary" onClick={() => {
                    if (!user) { void signIn(); return; }
                    if (item.id === "ai-diary") { void handleGenerateDiary(); return; }
                    if (item.id === "ride-story") { setRideStoryPickerOpen(true); return; }
                    setPreviewRequest({ recipeId: item.id });
                  }}><ShieldCheck size={ICON_SIZE.sm} />{i18n.t("creatorHubCopy.preview_output", { ns: "common" })}</Button>
                  <Button data-testid="E6-1-4"
                    className={recipeActionClass}
                    size="sm"
                    variant="secondary"
                    loading={emailSendingId === item.id}
                    disabled={emailDisabled}
                    onClick={() => void handleEmailRecipe(item.id)}
                  >
                    <Send size={ICON_SIZE.sm} />
                    {emailSendingId === item.id
                      ? copy.actions.emailing
                      : emailSentItemIds.has(item.id)
                        ? copy.actions.emailed
                        : emailFailedItemIds.has(item.id)
                          ? isEmailLimitReached
                            ? copy.actions.emailLimitReached
                            : isEmailCoolingDown
                              ? copy.actions.emailCooldownShort
                              : copy.actions.emailFailed
                          : item.id === "ride-story"
                            ? copy.actions.chooseRideStory
                            : copy.actions.emailRecipe}
                  </Button>
                  {quotaLabel && (
                    <div className="flex min-h-9 items-center text-[length:var(--ft-body-size)]" style={{ color: isEmailLimitReached ? "var(--rose)" : "var(--ink-3)" }}>
                      {quotaLabel}
                    </div>
                  )}
                  <Button
                    className={recipeActionClass}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTab("recipes", "recipes");
                    }}
                  >
                      <BookOpen size={ICON_SIZE.sm} />
                      {copy.actions.recipe}
                  </Button>
                  <Button
                    className={recipeActionClass}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTab("recipes", "deploy");
                      showToast(copy.actions.deployOpened, "info");
                    }}
                  >
                    <KeyRound size={ICON_SIZE.sm} />
                    {copy.actions.deploy}
                  </Button>
                  <Button data-testid="E6-1-6"
                    className={recipeActionClass}
                    size="sm"
                    variant="ghost"
                    loading={reportingItemIds.has(item.id)}
                    disabled={reportedItemIds.has(item.id)}
                    onClick={() => void handleReportItem(item.id)}
                  >
                    <Flag size={ICON_SIZE.sm} />
                    {reportedItemIds.has(item.id)
                      ? copy.actions.reported
                      : reportFailedItemIds.has(item.id)
                        ? copy.actions.reportFailed
                        : copy.actions.report}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <aside className="space-y-4">
          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <FileText size={ICON_SIZE.md} style={{ color: "var(--aqua)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.apiDocs.title}</GlossaryText></h2>
            </div>
            <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.apiDocs.body}</GlossaryText></p>
            <div className="mt-4 grid gap-2 min-[420px]:grid-cols-2 lg:grid-cols-1">
              <a href={apiDocsLinks.docs} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <ExternalLink size={ICON_SIZE.sm} aria-hidden />
                {copy.apiDocs.swagger}
              </a>
              <a data-testid="E6-4-2" href={apiDocsLinks.openapi} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <FileText size={ICON_SIZE.sm} aria-hidden />
                {copy.apiDocs.yaml}
              </a>
            </div>
          </div>
          <div ref={shareSectionRef} className="scroll-mt-28 rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <Bell size={ICON_SIZE.md} style={{ color: "var(--amber)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.email.title}</GlossaryText></h2>
            </div>
            <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.email.body}</GlossaryText></p>
            <div className="mt-3 rounded-[var(--r-md)] border p-3 text-[length:var(--ft-body-size)] leading-5" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
              {copy.email.safety}
            </div>
          </div>

          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <Lock size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.privacyTitle}</GlossaryText></h2>
            </div>
            <ul className="mt-3 space-y-2">
              {copy.privacy.map((item) => (
                <li key={item} className="flex gap-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>
                  <ShieldCheck size={ICON_SIZE.sm} className="mt-0.5 shrink-0" style={{ color: "var(--lime)" }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="mb-4 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <div className="flex items-center gap-2">
                <Bot size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
                <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.credit.title}</div>
              </div>
              <details className="creator-technical-summary mt-3"><summary>{i18n.t("creatorHubCopy.generation_limits_and_data", { ns: "common" })}</summary>
              <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.credit.body}</GlossaryText></p>
              <ul className="mt-2 space-y-1.5">
                {copy.credit.rules.map((rule) => (
                  <li key={rule} className="flex gap-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>
                    <ShieldCheck size={ICON_SIZE.xs} className="mt-0.5 shrink-0" style={{ color: "var(--lime)" }} />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
              </details>
              <div className="mt-2 text-[length:var(--ft-body-size)]" style={{ color: "var(--ink-2)" }}>
                {diary?.quota
                  ? copy.credit.remaining.replace("{{remaining}}", String(diary.quota.remaining)).replace("{{limit}}", String(diary.quota.limit))
                  : diary?.source === "cache"
                    ? copy.credit.cache
                    : copy.credit.quotaUnknown}
              </div>
              {diaryError && <div className="mt-2 text-[length:var(--ft-body-size)]" style={{ color: "var(--rose)" }}><Resolvable resolve={diaryError.resolveTo ? { to: diaryError.resolveTo } : undefined}>{diaryError.message}</Resolvable></div>}
              <div className="mt-3">
                <Button size="sm" variant="primary" onClick={handleGenerateDiary} loading={generating || policyLoading}>
                  <Sparkles size={ICON_SIZE.sm} />
                  {user ? (generating ? copy.actions.generating : copy.actions.generate) : copy.actions.loginNeeded}
                </Button>
              </div>
            </div>
            <Text as="div" variant="eyebrow">{copy.shareCard.label}</Text>
            <h2 className="mt-1 text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.shareTitle}</h2>
            <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.shareSubtitle}</p>
            <div className="mt-4"><RecipeShareCard key={diary?.generatedAt ?? "example"} card={shareCard} language={i18n.language} ready={Boolean(diary)} onError={(action) => showToast(action === "export" ? (i18n.t("creatorHubCopy.could_not_save_the_image_please", { ns: "common" })) : copy.actions.copyFailed, "error")} /></div>
            {diary && (
              <div className="mt-3 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <Text as="div" variant="eyebrow">{i18n.t("creatorHubCopy.private_diary_only_you", { ns: "common" })} — {diary.diary.title}</Text>
                <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>{diary.diary.body}</p>
              </div>
            )}
          </div>
        </aside>
      </section>
      )}

      {section === "share" && (
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2">
            <Sparkles size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
            <h2 className="text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.shareTitle}</GlossaryText></h2>
          </div>
          <p className="mt-2 text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}>{copy.shareSubtitle}</p>
          <div ref={shareSectionRef} className="mt-5"><RecipeShareCard key={diary?.generatedAt ?? "example"} card={shareCard} language={i18n.language} ready={Boolean(diary)} onError={(action) => showToast(action === "export" ? (i18n.t("creatorHubCopy.could_not_save_the_image_please", { ns: "common" })) : copy.actions.copyFailed, "error")} /></div>
          {diary && (
            <div data-testid="E6-2" className="mt-4 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <Text as="div" variant="eyebrow">{i18n.t("creatorHubCopy.private_diary_only_you", { ns: "common" })} — {diary.diary.title}</Text>
              <p className="mt-1 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>{diary.diary.body}</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <Bot size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.credit.title}</GlossaryText></h2>
            </div>
            <details className="creator-technical-summary mt-3"><summary>{i18n.t("creatorHubCopy.generation_limits_and_data", { ns: "common" })}</summary>
            <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.credit.body}</GlossaryText></p>
            <ul className="mt-3 space-y-1.5">
              {copy.credit.rules.map((rule) => (
                <li key={rule} className="flex gap-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>
                  <ShieldCheck size={ICON_SIZE.xs} className="mt-0.5 shrink-0" style={{ color: "var(--lime)" }} />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            </details>
            <div className="mt-3">
              <Button data-testid="E6-1-3" size="sm" variant="primary" onClick={handleGenerateDiary} loading={generating || policyLoading}>
                <Sparkles size={ICON_SIZE.sm} />
                {user ? (generating ? copy.actions.generating : copy.actions.generate) : copy.actions.loginNeeded}
              </Button>
            </div>
          </div>

          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <Lock size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.privacyTitle}</GlossaryText></h2>
            </div>
            <ul className="mt-3 space-y-2">
              {copy.privacy.map((item) => (
                <li key={item} className="flex gap-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>
                  <ShieldCheck size={ICON_SIZE.sm} className="mt-0.5 shrink-0" style={{ color: "var(--lime)" }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
      )}

      {section === "share" && (
      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--ft-body-size)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--aqua)" }}>
                <LineChart size={ICON_SIZE.sm} />
                {chartUsesOwnData ? copy.weekly.own : user ? copy.weekly.empty : copy.weekly.demo}
              </div>
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.weekly.title}</GlossaryText></h2>
              <p className="mt-1 max-w-3xl text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.weekly.body}</GlossaryText></p>
            </div>
            <Button data-testid="E6-2-2" size="sm" variant="secondary" onClick={handleCopyChart} disabled={Boolean(user && chartWeeks.length === 0)}>
              <Clipboard size={ICON_SIZE.sm} />
              {chartCopied ? copy.actions.copied : copy.actions.copyChart}
            </Button>
          </div>

          <div className="mt-4 grid h-48 grid-cols-6 items-end gap-2 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
            {chartWeeks.map((week, index) => {
              const height = Math.round((week.distance / chartMax) * 132);
              const basis = week.loadEvidence?.basisTotals;
              const pointsUnit = standaloneText(i18n.language, "creator_hub_pts");
              const basisText = basis ? [
                [standaloneText(i18n.language, "creator_hub_power_based_tss"), basis.power],
                [standaloneText(i18n.language, "creator_hub_heart_rate_tss"), basis.heartRate],
                [standaloneText(i18n.language, "creator_hub_time_estimated_tss"), basis.time],
                [standaloneText(i18n.language, "creator_hub_unknown_basis_tss"), basis.unknown],
              ].filter(([, value]) => Number(value) > 0).map(([label, value]) => `${label} ${Math.round(Number(value))}${pointsUnit}`).join("\n") : "";
              const loadText = formatTrainingLoad({ ...week, tssUnknownCount: week.tssUnknownCount ?? 0 }, loadT);
              const loadValue = loadT("charts.weeklyChart.tssValue", { value: week.tss });
              const tooltipText = [
                `${copy.weekly.distance} ${week.distance.toFixed(1)} km`,
                `${copy.weekly.time} ${week.time.toFixed(1)} h`,
                week.tss === null ? loadText : loadText.replace(loadValue, `${loadValue}${pointsUnit}`),
                basisText,
              ].filter(Boolean).join("\n");
              const mobileTick = index === 0 || index === Math.floor((chartWeeks.length - 1) / 2) || index === chartWeeks.length - 1;
              return (
                <div key={week.week} className="flex h-full min-w-0 flex-col justify-end gap-2"
                  >
                  <div className="flex min-h-0 flex-1 items-end justify-center">
                    <InfoTip className="creator-week-tip" title={`${week.week} · ${copy.weekly.distance}`} content={tooltipText} label={`${week.week} ${copy.weekly.distance} ${week.distance.toFixed(1)} km`} style={{ display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                    <span
                      className="w-full max-w-10 rounded-t-[var(--r-sm)]"
                      data-testid="creator-distance-bar"
                      style={{ display: "block", height, background: "linear-gradient(180deg, var(--aqua), var(--lime))" }}
                    />
                    </InfoTip>
                  </div>
                  <div className="creator-week-tick text-center text-[length:var(--ft-body-size)]" data-mobile-tick={mobileTick} style={{ color: "var(--ink-3)" }}>{week.week}</div>
                </div>
              );
            })}
          </div>

          <div className="creator-week-stats mt-3 grid grid-cols-4 gap-2">
            {[
              { label: copy.weekly.distance, value: `${Math.round(chartTotal.distance)}km` },
              { label: copy.weekly.time, value: `${chartTotal.time.toFixed(1)}h` },
              { label: copy.weekly.rides, value: String(chartTotal.rides) },
              { label: copy.weekly.tss, value: formatTrainingLoad(chartTotalLoad, loadT) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-[var(--r-md)] border p-2" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <Text as="div" variant="eyebrow">{stat.label}</Text>
                <div className="mt-1 text-[length:var(--fs-base)] font-semibold tabular-nums" style={{ color: "var(--ink-0)" }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div data-testid="E6-3" className="flex items-center gap-2">
              <Send size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.apiPath.title}</GlossaryText></h2>
            </div>
            <details className="creator-technical-summary mt-3"><summary>{i18n.t("creatorHubCopy.how_to_connect_your_tools", { ns: "common" })}</summary>
            <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.apiPath.body}</GlossaryText></p>
            <ol className="mt-3 space-y-2">
              {copy.apiPath.steps.map((step) => (
                <li key={step} className="text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-2)" }}>{step}</li>
              ))}
            </ol>
            </details>

          </div>
        </aside>
      </section>
      )}

      {(section === "deploy" || section === "recipes") && (
      <details className="creator-technical-summary rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
      <summary>{i18n.t("creatorHubCopy.workflow_and_data_protection", { ns: "common" })}</summary>
      <section className="grid gap-4 rounded-[var(--r-lg)] border p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_360px]" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <div>
          <div className="inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--ft-body-size)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--aqua)" }}>
            <BookOpen size={ICON_SIZE.sm} />
            {copy.tabs.recipes}
          </div>
          <h2 className="mt-3 max-w-3xl text-[length:var(--fs-xl)] font-semibold leading-7" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.marketTitle}</GlossaryText></h2>
          <p className="mt-2 max-w-4xl text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.marketBody}</GlossaryText></p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {copy.marketStages.map((stage, index) => {
              const StageIcon = marketStageIcons[index] ?? Sparkles;
              return (
                <div key={stage.title} className="rounded-[var(--r-md)] border p-4" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)]" style={{ background: "var(--bg-1)", color: index === 0 ? "var(--aqua)" : index === 1 ? "var(--lime)" : index === 2 ? "var(--amber)" : "var(--violet)" }}>
                      <StageIcon size={ICON_SIZE.md} />
                    </span>
                    <div className="text-[length:var(--ft-body-size)] font-semibold" style={{ color: "var(--ink-0)" }}>{stage.title}</div>
                  </div>
                  <p className="mt-3 text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}>{stage.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[var(--r-md)] border p-4" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={ICON_SIZE.md} style={{ color: "var(--lime)" }} />
            <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.marketRulesTitle}</GlossaryText></h2>
          </div>
          <ul className="mt-4 space-y-3">
            {copy.marketRules.map((rule) => (
              <li key={rule} className="flex gap-2 text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-2)" }}>
                <ShieldCheck size={ICON_SIZE.sm} className="mt-1 shrink-0" style={{ color: "var(--lime)" }} />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
      </details>
      )}

      {section !== "overview" && (
      <section className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}><GlossaryText>{copy.builderTitle}</GlossaryText></h2>
        <p className="mt-1 max-w-4xl text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.builderBody}</GlossaryText></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link data-testid="E6-3-1" to="/settings/developer" className={buttonClass({ variant: "primary", size: "sm" })}>
            <KeyRound size={ICON_SIZE.sm} aria-hidden />
            {copy.actions.manageApiKeys}
          </Link>
          <a data-testid="E6-1-8" href={PUBLIC_REPOSITORY_URL} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <GitPullRequest size={ICON_SIZE.sm} aria-hidden />
            {copy.actions.submitRecipe}
          </a>
          <Link data-testid="E6-1-7" to={CREATOR_RECIPE_REQUEST_LINK} className={buttonClass({ variant: "primary", size: "sm" })}>
            <MessageSquareText size={ICON_SIZE.sm} aria-hidden />
            {copy.actions.requestRecipe}
          </Link>
        </div>
      </section>
      )}

      {previewRequest && user && <RecipePreviewDialog key={user.uid} request={previewRequest} language={i18n.language} ownerId={user.uid} onClose={() => setPreviewRequest(null)} onSent={() => markEmailSent(previewRequest.recipeId)} />}
      <RideStoryPhotoPicker
        onPreview={(selection) => { setPreviewRequest({ recipeId: "ride-story", ...selection }); setRideStoryPickerOpen(false); }}
        open={rideStoryPickerOpen}
        userId={user?.uid ?? null}
        onClose={() => setRideStoryPickerOpen(false)}
        onSent={() => markEmailSent("ride-story")}
        onFailed={() => markEmailFailed("ride-story")}
      />
    </div>
    </GlossaryProvider>
  );
}


function CreatorTechnicalText({ children, language }: { children: string; language: string }) {
  const terms: Record<string, string> = {
    KPI: standaloneText(language, "creator_hub_key_performance_indicators_the_main_summary"),
    HTML: standaloneText(language, "creator_hub_a_document_format_you_can_open"),
    Swagger: standaloneText(language, "creator_hub_a_tool_for_reading_and_trying"),
    OpenAPI: standaloneText(language, "creator_hub_a_standard_describing_api_endpoints_and"),
  };
  return children.split(/\b(KPI|HTML|Swagger|OpenAPI)\b/g).map((part, index) => terms[part]
    ? <InfoTip key={index} title={part} content={terms[part]} label={part}>{part}</InfoTip>
    : <Fragment key={index}><GlossaryText>{part}</GlossaryText></Fragment>);
}
