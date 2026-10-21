import "./EventControls.css";
import "./CreatorReview.css";
import type { WeeklyStat } from "../components/WeeklyChart";
import InfoTip from "../components/InfoTip";
import GlossaryProvider from "../components/common/GlossaryProvider";
import GlossaryText from "../components/common/GlossaryText";
import "./ExploreReview.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { creatorRecipeErrorFeedback } from "../utils/creatorRecipeErrors";
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
import { functions } from "../services/firebase";
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
    title: ko ? "기록 활용" : "Ride tools",
    headline: ko ? "라이딩 기록 활용" : "Make more of your rides",
    eyebrow: ko ? "내 기록으로 일기와 공유 카드 만들기" : "Turn your rides into stories and share cards",
    subtitle: ko
      ? "내 활동으로 일기를 만들고 공유 카드를 준비하세요. 외부 도구에 연결할 때는 사용할 기록과 필요한 권한을 선택합니다."
      : "Create a diary or prepare a share card from your activities. Choose which records and permissions to use when connecting external tools.",
    tabs: {
      featured: ko ? "추천" : "Featured",
      recipes: ko ? "레시피" : "Recipes",
      share: ko ? "자랑 카드" : "Share cards",
    },
    actions: {
      preview: ko ? "공유 카드 보기" : "Preview share card",
      recipe: ko ? "활용 방법 보기" : "View ideas",
      generate: ko ? "AI 일기 생성" : "Generate diary",
      generating: ko ? "AI 일기 생성 중" : "Generating diary",
      post: ko ? "게시글로 공유" : "Share as post",
      copy: ko ? "카드 문구 복사" : "Copy card text",
      copied: ko ? "복사됨" : "Copied",
      copyPrompt: ko ? "작업 지시 복사" : "Copy prompt",
      promptCopied: ko ? "작업 지시 복사됨" : "Prompt copied",
      loginNeeded: ko ? "로그인 후 생성 가능" : "Sign in to generate",
      submitRecipe: ko ? "오라이더 공개 저장소" : "Orider public repository",
      requestRecipe: ko ? "활용법 요청" : "Request recipe",
      manageApiKeys: ko ? "API key 만들기" : "Create API key",
      emailRecipe: ko ? "내 이메일로 받기" : "Email me this",
      chooseRideStory: ko ? "사진/경로 선택" : "Choose photo/route",
      emailing: ko ? "이메일 발송 중" : "Sending email",
      emailed: ko ? "발송 완료" : "Sent",
      emailFailed: ko ? "이메일을 보내지 못했습니다" : "Could not send email",
      emailQuota: ko ? "오늘 {{used}}/{{limit}}회 사용" : "{{used}}/{{limit}} sent today",
      emailQuotaExceeded: ko
        ? "오늘의 레시피 이메일 발송 한도를 모두 사용했습니다. 내일 다시 발송할 수 있습니다."
        : "You've used today's recipe email limit. You can send more tomorrow.",
      emailCooldown: ko
        ? "같은 레시피는 1분 뒤 다시 보낼 수 있습니다."
        : "You can resend the same recipe after 1 minute.",
      emailLimitReached: ko ? "한도 사용 완료" : "Limit reached",
      emailCooldownShort: ko ? "잠시 후 가능" : "Wait 1 min",
      copyChart: ko ? "차트 카드 복사" : "Copy chart card",
      report: ko ? "신고" : "Report",
      reported: ko ? "검토 대기" : "Under review",
      reportFailed: ko ? "신고를 접수하지 못했습니다" : "Could not submit report",
      previewOpened: ko ? "공유 카드 예시로 이동했습니다." : "Opened the share card preview.",
      loginPrompt: ko ? "로그인하면 내 활동 데이터로 생성할 수 있습니다." : "Sign in to generate this from your activity data.",
      emailLogin: ko ? "로그인하면 본인 확인 이메일로만 받아볼 수 있습니다." : "Sign in to send this only to your verified account email.",
      reportLogin: ko ? "로그인하면 레시피 신고를 접수할 수 있습니다." : "Sign in to report this recipe.",
      copyFailed: ko ? "복사 권한을 확인한 뒤 다시 시도해 주세요." : "Check clipboard permission and try again.",
      deploy: ko ? "배치 방법 보기" : "View deployment path",
      deployOpened: ko ? "레시피 배치 흐름을 보여드릴게요." : "Showing the recipe deployment flow.",
    },
    pathsTitle: ko ? "원하는 역할을 고르세요" : "Choose your role",
    paths: [
      {
        title: ko ? "라이더: 바로 써보기" : "Rider: try first",
        body: ko
          ? "레시피를 배치하기 전, 어떤 결과가 나오는지 데모 카드와 주간 차트로 먼저 확인합니다. 로그인하면 같은 화면이 내 활동 데이터 기반 결과로 바뀝니다."
          : "Before deploying a recipe, preview the output through demo cards and weekly charts. After sign-in, the same surfaces use your own activity data.",
        action: ko ? "데모 카드 보기" : "View demo card",
        tab: "share" as CreatorTab,
      },
      {
        title: ko ? "운영자: 레시피 배치하기" : "Operator: deploy a recipe",
        body: ko
          ? "Developer API에서 key를 만들고 필요한 scope만 고른 뒤, Notion, Slack, n8n, 개인 서버 중 어디에서 실행할지 정합니다. 핵심은 선택, 권한, 트리거, 중지 방법입니다."
          : "Create a Developer API key, choose only the needed scopes, and decide where it runs: Notion, Slack, n8n, or your own server. The key decisions are selection, scopes, triggers, and stop controls.",
        action: ko ? "연결 순서 보기" : "See connection steps",
        tab: "recipes" as CreatorTab,
      },
      {
        title: ko ? "메이커: 새 활용법 제안하기" : "Maker: propose a workflow",
        body: ko
          ? "개발 지식이 없어도 됩니다. 동호회 리포트, 회복 알림, 월간 배지처럼 실제로 필요한 장면을 요청하면 레시피 후보가 됩니다."
          : "No development knowledge is required. Request real workflows such as club reports, recovery alerts, or monthly badges.",
        action: ko ? "활용법 요청" : "Request recipe",
        tab: "featured" as CreatorTab,
      },
    ],
    deployTitle: ko ? "레시피는 이렇게 배치합니다" : "How recipes get deployed",
    deployBody: ko
      ? "레시피를 어디서 실행할지, 어떤 기록을 읽을 수 있는지, 언제 중지할지 차례로 정하세요."
      : "Choose where to run a recipe, what data it can read, and how to stop it.",
    deploySteps: [
      {
        title: ko ? "1. 실행 위치 고르기" : "1. Choose runtime",
        body: ko
          ? "오라이더 안에서 바로 실행할지, n8n·Slack·Notion·개인 서버 같은 외부 도구에서 돌릴지 먼저 고릅니다."
          : "Decide whether it runs inside Orider or in an external tool such as n8n, Slack, Notion, or a personal server.",
      },
      {
        title: ko ? "2. 권한과 공개 범위 설정" : "2. Set scopes and visibility",
        body: ko
          ? "필요한 scope만 선택하고, 위치·심박·파워·피로도 같은 민감 데이터가 외부로 나가는지 확인합니다."
          : "Choose only the required scopes and check whether location, heart rate, power, or fatigue data leaves Orider.",
      },
      {
        title: ko ? "3. 트리거 배치" : "3. Deploy trigger",
        body: ko
          ? "월요일 오전, 매일 1회, 라이딩 완료 후, 수동 실행처럼 언제 실행될지 정합니다. 이 단계가 실제 배치입니다."
          : "Set when it runs: Monday morning, once daily, after a ride, or manually. This is the actual deployment step.",
      },
      {
        title: ko ? "4. 운영과 중지" : "4. Operate and stop",
        body: ko
          ? "마지막 실행 결과, 오류, 남은 횟수, 연결된 API key를 확인하고 언제든 알림·webhook·key를 끌 수 있어야 합니다."
          : "Track the last run, errors, remaining quota, and connected API key. Riders must be able to turn off alerts, webhooks, or keys.",
      },
    ],
    credit: {
      title: ko ? "AI 일기 생성" : "AI ride diary generation",
      body: ko
        ? "내 최근 7일 운동 집계로 AI가 비공개 일기와 공개 하이라이트를 만듭니다. 생성 전에 외부 AI 처리자와 전송 항목을 확인하고 동의할 수 있습니다."
        : "AI turns your last 7 days of training aggregates into a private diary and a public highlight. Review the external AI processor and data sent before consenting.",
      rules: [
        ko ? "성공한 일기 생성만 일일 한도에 포함됩니다." : "Only successful diary generations count toward your daily limit.",
        ko ? "같은 기록은 저장된 초안을 다시 사용합니다." : "Unchanged records reuse the saved draft.",
        ko ? "공유 전 문구를 편집하고 PNG로 저장할 수 있습니다." : "Edit your highlight and save a PNG before sharing.",
      ],
      quotaUnknown: ko ? "남은 AI 크레딧은 생성 후 표시됩니다." : "Remaining AI credits appear after generation.",
      remaining: ko ? "오늘 남은 AI 크레딧 {{remaining}}/{{limit}}회" : "{{remaining}}/{{limit}} AI credits left today",
      cache: ko ? "오늘 이미 만든 초안을 다시 불러왔습니다." : "Loaded today's existing draft.",
      failed: ko
        ? "AI 일기를 생성하지 못했습니다. 활동 데이터가 있는지 확인하거나 일일 한도가 초기화된 뒤 다시 시도해 주세요."
        : "Could not generate the diary. Check that activity data is available, or try again after the daily limit resets.",
    },
    stats: [
      { label: ko ? "활용 방법" : "Ways to use", value: ko ? "일기·리포트·공유 카드" : "Diaries, reports, share cards" },
      { label: ko ? "이용 방식" : "How to use", value: ko ? "직접 실행·내 도구 연결" : "Run here or connect tools" },
      { label: ko ? "데이터 접근" : "Data access", value: ko ? "본인 승인" : "Rider approved" },
    ],
    marketTitle: ko ? "레시피 허브로 키우려면 구조가 먼저 필요합니다" : "A recipe hub needs structure before scale",
    marketBody: ko
      ? "Creator Hub가 커지려면 레시피 카드가 많아지는 것만으로는 부족합니다. 사용자는 검색하고, 고르고, 권한을 확인하고, 배치하고, 결과를 보고, 언제든 중지할 수 있어야 합니다. 오라이더의 방향은 데이터를 밖으로 내보내는 일이 아니라, 본인 기록을 안전한 방식으로 오래 활용하게 돕는 것입니다."
      : "For Creator Hub to scale, more cards are not enough. Riders need to search, choose, inspect permissions, deploy, review outputs, and stop recipes at any time. Orider's direction is not to push data outward, but to help each rider keep using their own records safely over time.",
    marketStages: [
      {
        title: ko ? "1. 발견" : "1. Discover",
        body: ko
          ? "Notion 리포트, 회복 알림, 월간 배지처럼 결과가 분명한 레시피를 카탈로그에서 찾습니다."
          : "Find recipes with clear outcomes, such as Notion reports, recovery alerts, or monthly badges.",
      },
      {
        title: ko ? "2. 검토" : "2. Inspect",
        body: ko
          ? "필요한 scope, 외부 전송 여부, 공개되는 필드, 실행 주기를 설치 전에 확인합니다."
          : "Review scopes, external delivery, public fields, and run schedule before installation.",
      },
      {
        title: ko ? "3. 배치" : "3. Deploy",
        body: ko
          ? "오라이더 안에서 실행하거나, n8n·Slack·Notion·개인 서버에 연결해 실제로 돌립니다."
          : "Run inside Orider or connect to n8n, Slack, Notion, or your own server.",
      },
      {
        title: ko ? "4. 운영" : "4. Operate",
        body: ko
          ? "마지막 실행 결과, 오류, 남은 횟수, 연결된 API key를 보고 언제든 끄거나 삭제합니다."
          : "Track last run, errors, quota, and connected API keys, then pause or delete when needed.",
      },
    ],
    marketRulesTitle: ko ? "허브 원칙" : "Hub principles",
    marketRules: [
      ko ? "원본 데이터가 의도치 않게 외부로 유출되지 않도록, 사용자가 승인한 레시피만 실행합니다." : "Run only rider-approved recipes so raw data is not exposed unintentionally.",
      ko ? "레시피마다 필요한 scope를 작게 유지하고, 민감 필드는 기본 비공개로 둡니다." : "Keep scopes minimal and sensitive fields private by default.",
      ko ? "검색·추가·삭제보다 더 중요한 것은 배치 후 중지와 key 폐기입니다." : "Stopping deployments and revoking keys matter more than simple add/delete.",
      ko ? "공개 결과물은 경로 좌표가 아니라 집계값, 카드, 리포트 중심으로 설계합니다." : "Public outputs should be aggregates, cards, and reports, not route geometry.",
    ],
    card: {
      outcome: ko ? "나오는 결과" : "Output",
      delivery: ko ? "전달 채널" : "Delivery",
      why: ko ? "왜 유용한가" : "Why it helps",
      deploy: ko ? "배치 방식" : "Deployment",
    },
    email: {
      title: ko ? "리포트 템플릿 이메일" : "Report-template email",
      body: ko
        ? "대표 레시피는 본인 계정 이메일로 실제 리포트를 보내볼 수 있습니다. 주간 부하 리포트는 KPI 카드, 부하 차트, 대표 활동 썸네일, 다음 행동을 포함합니다. 내장 정기 발송은 제공하지 않으며, 직접 자동화를 만들려면 Personal Data API를 사용합니다."
        : "Flagship recipes can send a real report to your account email. The weekly load report includes KPI cards, a load chart, key-session thumbnails, and next actions. Recurring delivery requires your own Personal Data API automation.",
      safety: ko
        ? "임의 주소 입력은 허용하지 않고, 로그인한 본인의 확인된 이메일로만 보냅니다. 외부 공유용 결과는 집계 요약 중심으로 따로 줄일 수 있어야 합니다."
        : "No arbitrary recipient entry: Orider sends only to the signed-in rider's verified account email. External sharing should be reducible to aggregate-only summaries.",
    },
    privacyTitle: ko ? "공유 전 보호장치" : "Before anything is shared",
    privacy: [
      ko ? "정확한 출발 위치와 경로는 기본 제거" : "Exact start locations and route geometry are removed by default",
      ko ? "심박·파워·피로도 같은 민감 지표는 선택 공개" : "Health and effort metrics are opt-in",
      ko ? "AI 일기는 먼저 비공개 초안으로 생성" : "AI diaries start as private drafts",
      ko ? "공개 전 미리보기와 공개범위 선택" : "Preview and visibility controls before publishing",
    ],
    shareTitle: ko ? "AI 자동 일기 공유 카드" : "AI ride diary share card",
    shareSubtitle: ko
      ? "원문 일기는 비공개로 두고, 자랑하기 좋은 요약만 카드로 공유합니다."
      : "Keep the full diary private and share only a redacted highlight card.",
    shareCard: {
      label: ko ? "라이딩 일기 예시" : "Example ride diary",
      title: ko ? "예시: 긴 업힐을 버틴 꾸준한 한 주" : "Example: a steady week through the climbs",
      body: ko
        ? "예시 데이터: 총 182km, 상승고도 2,140m. 수요일 고강도 이후 금요일은 회복주로 전환했고, 주말 롱라이드에서 페이스가 안정적으로 돌아왔습니다."
        : "Example data: 182 km total with 2,140 m climbed. After a hard Wednesday, Friday shifted to recovery and the weekend long ride settled back into a steady pace.",
      footer: ko ? "정확한 위치와 민감 지표는 숨김" : "Exact location and sensitive metrics hidden",
    },
    builderTitle: ko ? "만들고 싶은 활용법을 제안하세요" : "Propose what you want to build",
    builderBody: ko
      ? "개발자가 아니어도 괜찮습니다. 노션에 주간 리포트를 남기고 싶다, Slack으로 회복 알림을 받고 싶다, n8n으로 월간 배지를 자동 생성하고 싶다처럼 실제로 필요한 장면을 남겨 주세요. 개발자는 그 아이디어를 Personal Data API 레시피로 구체화해 PR로 보낼 수 있습니다."
      : "You do not need to be a developer to contribute. Ask for real workflows such as a Notion weekly report, Slack recovery reminder, or n8n monthly badge automation. Developers can turn those ideas into Personal Data API recipes and submit PRs.",
    useModesTitle: ko ? "어떻게 쓰면 되나요?" : "How can I use this?",
    useModes: [
      {
        title: ko ? "오라이더 안에서 바로 써보기" : "Try it inside Orider",
        body: ko
          ? "AI 일기 생성, 주간 부하 차트 미리보기, 공유 카드 복사처럼 화면 안에서 끝나는 기능입니다. 로그인하면 내 활동 데이터로 계산되고, 비로그인 상태에서는 데모 데이터가 보입니다."
          : "Use in-product actions such as AI diary generation, weekly load preview, and share-card copy. Signed-in riders use their own data; signed-out visitors see demo data.",
        action: ko ? "자랑 카드 보기" : "View share cards",
        to: "/explore/recipes/share",
      },
      {
        title: ko ? "내 도구에 직접 연결하기" : "Connect it to your own tools",
        body: ko
          ? "설정의 Developer API에서 개인 API key를 만들고, 필요한 scope만 골라 Notion, Slack, n8n, 개인 대시보드 같은 도구에서 본인 데이터를 읽어갑니다. 이 단계는 간단한 자동화나 개발 지식이 필요합니다."
          : "Create a personal API key in Developer API settings, choose only the scopes you need, and read your own data from tools like Notion, Slack, n8n, or a personal dashboard. This path needs basic automation or development knowledge.",
        action: ko ? "활용 예시 보기" : "View examples",
        to: "/explore/recipes/examples",
      },
      {
        title: ko ? "아이디어만 제안하기" : "Request an idea",
        body: ko
          ? "코드를 몰라도 됩니다. 동호회에서 필요한 리포트, 훈련 알림, 월간 배지, 공유 카드 같은 활용 장면을 요청하면 레시피 후보가 됩니다."
          : "No code is required. Requests for club reports, training alerts, monthly badges, or share cards can become future recipe candidates.",
        action: ko ? "활용법 요청" : "Request recipe",
        to: CREATOR_RECIPE_REQUEST_LINK,
      },
    ],
    integrationsTitle: ko ? "활용 예시" : "Example integrations",
    integrations: [
      {
        name: "Notion",
        label: ko ? "주간 부하 리포트" : "Weekly load report",
        goal: ko ? "월요일 아침마다 HTML 리포트와 Notion 요약이 같이 만들어지게 하기" : "Generate an HTML report and Notion summary every Monday morning",
        prepare: ko
          ? ["공개 저장소의 docs/recipes/weekly-load-report.md와 docs/recipes/report-template.md를 먼저 읽습니다.", "오라이더 설정 → Developer API에서 activities:read, fitness:read scope만 포함한 key를 만듭니다.", "n8n, GitHub Actions, 개인 서버 중 하나를 월요일 오전에 실행되도록 준비합니다."]
          : ["Read docs/recipes/weekly-load-report-en.md and docs/recipes/report-template-en.md first.", "Create an Orider Developer API key with only activities:read and fitness:read scopes.", "Prepare n8n, GitHub Actions, or your own server to run on Monday morning."],
        steps: ko
          ? ["예제 스크립트 examples/recipes/weekly-load-report/weekly-load-report.mjs로 HTML/JSON/TXT 산출물을 만듭니다.", "최근 7일과 직전 7일의 거리, 시간, 상승고도, 부하를 비교합니다.", "HTML에는 KPI 카드와 일별 부하 막대 차트를 넣고, Notion에는 public-safe 집계 요약만 저장합니다.", "지도/경로 썸네일은 streams:read를 켠 private HTML에서 Swagger/OpenAPI에 문서화된 endpoint로만 선택적으로 사용합니다."]
          : ["Run examples/recipes/weekly-load-report/weekly-load-report.mjs to create HTML/JSON/TXT outputs.", "Compare distance, duration, elevation, and load for the last 7 days versus the previous 7 days.", "Put KPI cards and a daily load bar chart in HTML; store only public-safe aggregates in Notion.", "Use map/route thumbnails only in private HTML through the endpoint documented in Swagger/OpenAPI when streams:read is explicitly enabled."],
        result: ko ? "월요일 아침에는 개인 HTML 리포트가 생기고, Notion에는 '3회 · 125km · 5시간 · load 97 · 다음 고강도 전 회복 확인' 같은 안전한 요약만 쌓입니다." : "On Monday morning, you get a private HTML report, while Notion stores a safe summary such as '3 sessions · 125 km · 5 h · load 97 · check recovery before the next hard session.'",
        safety: ko ? "Notion과 Slack에는 집 근처 출발지, 상세 경로, 활동명, stream 좌표를 남기지 말고 집계값과 다음 행동만 저장하세요." : "Keep home-area starts, detailed routes, activity titles, and stream coordinates out of Notion and Slack; store aggregates and next actions only.",
        aiPrompt: ko
          ? "너는 자동화 구현 담당자야. 오라이더 공개 저장소의 레시피 문서를 기준으로 주간 부하 리포트 자동화를 바로 만들 수 있게 구현안을 작성해줘.\n\n목표: 매주 월요일 오전, 오라이더 Personal Data API로 최근 7일 훈련을 읽어 개인 HTML 리포트와 Notion용 집계 요약을 만든다.\n참고 경로: API key 생성 화면은 /ko/settings/developer, API 가이드는 docs/PERSONAL_DATA_API.md, 정식 API 계약은 Swagger UI /api/v1/docs 또는 OpenAPI YAML /api/v1/docs/openapi.yaml, 레시피 문서는 docs/recipes/weekly-load-report.md, 리포트 템플릿은 docs/recipes/report-template.md, 실행 예제는 examples/recipes/weekly-load-report/weekly-load-report.mjs다.\nAPI 계약 확인: X-API-Key 헤더, endpoint path, request/response schema, content type, error code는 Swagger/OpenAPI를 기준으로 확인한다. 사용 가능한 endpoint나 응답 필드를 md 문서만 보고 임의로 만들지 않는다.\n필요 권한: 기본은 Orider activities:read, fitness:read만 사용한다. 지도/경로 썸네일은 private HTML에만 넣고 싶을 때 streams:read를 명시적으로 추가하고 Swagger/OpenAPI에 문서화된 route thumbnail endpoint를 호출한다. Notion은 대상 데이터베이스에 page를 생성할 권한만 사용한다.\n사용자가 준비해야 할 값: ORIDER_API_KEY, NOTION_TOKEN, NOTION_DATABASE_ID, 실행 시간대, 월요일 실행 시각.\n산출물: weekly-load-report.html, weekly-load-summary.json, weekly-load-public-summary.txt, Notion row.\n리포트 구성: 상단 판정, KPI 카드, 최근 7일 일별 load 막대 차트, 직전 7일 대비 변화, 대표 활동 요약, 다음 행동.\n저장 금지: 위치, 경로 좌표, 출발/도착 지점, 활동 상세 이름, 심박/파워 상세 스트림, API key.\n출력 형식: 파일 구조, API 호출 순서, 데이터 변환 함수, HTML 템플릿 구조, Notion 속성 설계, n8n 또는 GitHub Actions 실행 예시, 환경변수 목록, 오류 처리, 테스트 순서, 완료 조건을 순서대로 써줘.\n중요: Swagger/OpenAPI에 없는 endpoint나 응답 필드는 임의로 만들지 말고 확인 필요 항목으로 표시해줘."
          : "You are the automation implementer. Write an implementation-ready plan for a weekly load report using Orider's public recipe docs.\n\nGoal: every Monday morning, read the last 7 days from the Orider Personal Data API and create both a private HTML report and an aggregate Notion summary.\nReference paths: create API keys at /en/settings/developer; API guide is docs/PERSONAL_DATA_API-en.md; the formal API contract is Swagger UI /api/v1/docs or OpenAPI YAML /api/v1/docs/openapi.yaml; recipe docs are docs/recipes/weekly-load-report-en.md; report template is docs/recipes/report-template-en.md; runnable example is examples/recipes/weekly-load-report/weekly-load-report.mjs.\nAPI contract check: confirm the X-API-Key header, endpoint paths, request/response schemas, content types, and error codes in Swagger/OpenAPI. Do not invent endpoints or response fields from markdown docs alone.\nRequired scopes: default to Orider activities:read and fitness:read only. Add streams:read only when the rider explicitly wants private HTML route/map thumbnails, then call the route thumbnail endpoint documented in Swagger/OpenAPI. Notion should only be allowed to create pages in the target database.\nValues the user must provide: ORIDER_API_KEY, NOTION_TOKEN, NOTION_DATABASE_ID, timezone, Monday run time.\nOutputs: weekly-load-report.html, weekly-load-summary.json, weekly-load-public-summary.txt, and a Notion row.\nReport sections: top readout, KPI cards, 7-day daily load bar chart, previous-7-day comparison, key-session summary, and next action.\nNever store: location, route coordinates, start/end areas, detailed activity names, detailed HR/power streams, or API keys.\nOutput format: file structure, API call order, data transform functions, HTML template structure, Notion property schema, n8n or GitHub Actions runner, environment variables, error handling, test steps, and done criteria.\nImportant: if an endpoint or response field is not documented in Swagger/OpenAPI, mark it as needs confirmation instead of inventing it.",
      },
      {
        name: "Slack",
        label: ko ? "개인 회복 알림" : "Private recovery alert",
        goal: ko ? "고강도 훈련이 연속될 때 팀 채널이 아니라 나에게 먼저 회복 알림 보내기" : "Send yourself a recovery nudge before hard days stack up",
        prepare: ko
          ? ["Slack Incoming Webhook 또는 개인 DM bot token을 준비합니다.", "오라이더 API key는 activities:read만 허용합니다.", "알림 기준을 정합니다. 예: 3일 중 2일 이상 고강도, 또는 7일 부하가 평소보다 30% 이상 증가."]
          : ["Prepare a Slack Incoming Webhook or a private DM bot token.", "Allow only activities:read on the Orider API key.", "Define the alert rule, such as two hard days in three days or 30% higher weekly load."],
        steps: ko
          ? ["매일 오전 최근 7일 활동 시간, 강도, 부하만 읽습니다.", "정한 기준을 넘으면 개인 DM으로 '오늘은 Z1/Z2 회복주 권장' 메시지를 보냅니다.", "메시지에는 이유를 한 줄로 씁니다. 예: '최근 3일 중 2일이 고강도였습니다.'", "팀 채널에 보내야 한다면 총 시간, 총 거리 같은 집계값만 따로 선택합니다."]
          : ["Every morning, read only the last 7 days of duration, intensity, and load.", "When the rule matches, send a private DM recommending a Z1/Z2 recovery ride.", "Include one short reason, such as '2 of the last 3 days were hard.'", "If posting to a team channel, choose only aggregate duration or distance."],
        result: ko ? "아침에 Slack DM으로 '오늘은 회복주 추천' 알림을 받고, 민감한 위치·심박 데이터는 공개하지 않습니다." : "You receive a private Slack DM recommending recovery without exposing sensitive location or heart-rate data.",
        safety: ko ? "팀 채널에 자동 전송하기 전에는 반드시 본인 DM으로 며칠 테스트하세요." : "Test in a private DM for several days before sending anything to a team channel.",
        aiPrompt: ko
          ? "너는 자동화 구현 담당자야. 오라이더 Personal Data API와 Slack DM을 연결해 개인 회복 알림 자동화를 바로 만들 수 있게 구현안을 작성해줘.\n\n목표: 매일 오전 최근 훈련 부하를 확인하고, 과부하 조건이면 내 Slack DM으로만 회복 알림을 보낸다.\n참고 경로: API key 생성 화면은 /ko/settings/developer, API 가이드는 docs/PERSONAL_DATA_API.md, 정식 API 계약은 Swagger UI /api/v1/docs 또는 OpenAPI YAML /api/v1/docs/openapi.yaml이다.\nAPI 계약 확인: X-API-Key 헤더, endpoint path, request/response schema, content type, error code는 Swagger/OpenAPI를 기준으로 확인한다.\n필요 권한: Orider activities:read만 사용한다. Slack은 개인 DM 또는 Incoming Webhook 전송 권한만 사용한다.\n사용자가 준비해야 할 값: ORIDER_API_KEY, SLACK_WEBHOOK_URL 또는 SLACK_BOT_TOKEN, SLACK_USER_ID, 실행 시간대, 매일 실행 시각.\n판정 규칙: 최근 3일 중 2일 이상 고강도이거나, 최근 7일 부하가 평소 기준보다 30% 이상 증가하면 알림을 보낸다. 평소 기준이 없으면 첫 2주 동안은 알림 대신 기준값을 쌓는다.\n메시지 내용: 오늘 권장 강도, 판단 이유 한 줄, 최근 7일 요약만 포함한다.\n전송 금지: 위치, 경로, 활동명, 심박 상세값, 팀 채널 자동 전송.\n출력 형식: 실행 흐름, Slack 설정 방법, API 호출 순서, 의사코드 또는 n8n 노드 구성, 중복 알림 방지, 테스트 순서, 완료 조건을 순서대로 써줘.\n중요: Swagger/OpenAPI에 없는 endpoint나 응답 필드는 임의로 만들지 말고 확인 필요 항목으로 표시해줘."
          : "You are the automation implementer. Write an implementation-ready plan that connects the Orider Personal Data API to a private Slack recovery alert.\n\nGoal: every morning, check recent training load and send a Slack DM only when overload conditions match.\nReference paths: create API keys at /en/settings/developer; API guide is docs/PERSONAL_DATA_API-en.md; the formal API contract is Swagger UI /api/v1/docs or OpenAPI YAML /api/v1/docs/openapi.yaml.\nAPI contract check: confirm the X-API-Key header, endpoint paths, request/response schemas, content types, and error codes in Swagger/OpenAPI.\nRequired scopes: use only Orider activities:read. Slack should only be able to send a private DM or webhook message.\nValues the user must provide: ORIDER_API_KEY, SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN, SLACK_USER_ID, timezone, daily run time.\nRules: alert when 2 of the last 3 days were hard or the last 7 days of load are 30% above the rider's normal baseline. If no baseline exists, collect baseline data for the first 2 weeks instead of alerting.\nMessage content: today's suggested intensity, one-line reason, and a 7-day aggregate summary only.\nNever send: location, routes, activity names, detailed heart-rate values, or automatic team-channel posts.\nOutput format: execution flow, Slack setup, API call order, pseudocode or n8n nodes, duplicate-alert prevention, test steps, and done criteria.\nImportant: if an endpoint or response field is not documented in Swagger/OpenAPI, mark it as needs confirmation instead of inventing it.",
      },
      {
        name: "n8n",
        label: ko ? "월간 배지 자동화" : "Monthly badge automation",
        goal: ko ? "코드를 거의 쓰지 않고 월간 라이딩 배지와 이메일 요약 만들기" : "Create a monthly badge and email summary with little code",
        prepare: ko
          ? ["n8n에 Cron, HTTP Request, Set, Email 노드를 만듭니다.", "오라이더 API key는 activities:read만 허용합니다.", "공개할 항목을 미리 정합니다. 추천: 총 거리, 상승고도, 활동 수, 최장 라이딩 거리."]
          : ["Create Cron, HTTP Request, Set, and Email nodes in n8n.", "Allow only activities:read on the Orider API key.", "Pick public fields first: total distance, elevation, activity count, and longest ride."],
        steps: ko
          ? ["Cron을 매월 1일 오전 9시로 설정합니다.", "HTTP Request 노드가 지난달 활동 집계를 가져옵니다.", "Set 노드에서 공개 문구를 만듭니다. 예: '6월 18회 · 642km · 7,820m 상승'.", "Email 노드로 본인에게 먼저 보내고, 확인 후 블로그나 프로필에 붙입니다."]
          : ["Set Cron to 9 AM on the first day of each month.", "Use HTTP Request to fetch last month's aggregate activity data.", "Use Set to create public copy, such as 'June: 18 rides · 642 km · 7,820 m climbed.'", "Email it to yourself first, then paste it into a blog or profile after review."],
        result: ko ? "매월 초 본인 이메일로 공개 가능한 배지 문구가 오고, 확인한 뒤 개인 사이트에 붙일 수 있습니다." : "At the start of each month, you receive safe badge copy by email and can paste it into your site.",
        safety: ko ? "자동 공개보다 '이메일로 먼저 받기 → 확인 후 게시' 흐름을 권장합니다." : "Prefer 'email to myself first → review → publish' over automatic public posting.",
        aiPrompt: ko
          ? "너는 n8n 자동화 구현 담당자야. 오라이더 Personal Data API로 월간 라이딩 배지 초안을 만들고 이메일로 먼저 보내는 n8n 워크플로를 바로 만들 수 있게 작성해줘.\n\n목표: 매월 1일 오전 9시, 지난달 라이딩 집계로 공개 가능한 배지 문구를 만들고 내 이메일로 보낸다.\n참고 경로: API key 생성 화면은 /ko/settings/developer, API 가이드는 docs/PERSONAL_DATA_API.md, 정식 API 계약은 Swagger UI /api/v1/docs 또는 OpenAPI YAML /api/v1/docs/openapi.yaml이다.\nAPI 계약 확인: X-API-Key 헤더, endpoint path, request/response schema, content type, error code는 Swagger/OpenAPI를 기준으로 확인한다.\n필요 권한: Orider activities:read만 사용한다. 이메일 노드는 본인 주소로만 발송한다.\n사용자가 준비해야 할 값: ORIDER_API_KEY, 이메일 발송 계정 또는 SMTP 설정, 받는 이메일, 실행 시간대.\n계산 항목: 지난달 총 거리, 상승고도, 활동 수, 최장 라이딩 거리.\n공개 문구 예시: '6월 18회 · 642km · 7,820m 상승 · 최장 112km'.\n자동 공개 금지: 블로그, 프로필, SNS에는 자동 게시하지 않고 이메일 확인 후 사용자가 직접 게시한다.\n출력 형식: n8n Cron, HTTP Request, Set, Email 노드별 설정값, 각 노드 입력/출력, 실패 시 재시도, 샘플 JSON, 테스트 순서, 완료 조건을 순서대로 써줘.\n중요: Swagger/OpenAPI에 없는 endpoint나 응답 필드는 임의로 만들지 말고 확인 필요 항목으로 표시해줘."
          : "You are the n8n automation implementer. Write an implementation-ready n8n workflow that uses the Orider Personal Data API to draft a monthly riding badge and email it to me first.\n\nGoal: at 9 AM on the first day of each month, create public-safe badge copy from last month's riding aggregates and email it to me.\nReference paths: create API keys at /en/settings/developer; API guide is docs/PERSONAL_DATA_API-en.md; the formal API contract is Swagger UI /api/v1/docs or OpenAPI YAML /api/v1/docs/openapi.yaml.\nAPI contract check: confirm the X-API-Key header, endpoint paths, request/response schemas, content types, and error codes in Swagger/OpenAPI.\nRequired scopes: use only Orider activities:read. The email node sends only to my address.\nValues the user must provide: ORIDER_API_KEY, email/SMTP account settings, recipient email, timezone.\nCalculated fields: last month's total distance, elevation, ride count, and longest ride distance.\nExample public copy: 'June: 18 rides · 642 km · 7,820 m climbed · longest 112 km'.\nDo not auto-publish: do not post to a blog, profile, or social channel automatically; the user reviews the email and posts manually.\nOutput format: n8n Cron, HTTP Request, Set, and Email node settings, each node's input/output, retry behavior, sample JSON, test steps, and done criteria.\nImportant: if an endpoint or response field is not documented in Swagger/OpenAPI, mark it as needs confirmation instead of inventing it.",
      },
      {
        name: ko ? "개인 웹사이트" : "Personal site",
        label: ko ? "공개 프로필 배지" : "Public profile badge",
        goal: ko ? "블로그나 프로필에 현재 라이딩 현황 배지 달기" : "Add a current ride-status badge to a blog or profile",
        prepare: ko
          ? ["개인 사이트에서 읽을 수 있는 작은 JSON 파일 또는 API endpoint를 준비합니다.", "오라이더 API key는 월간 집계만 읽도록 제한합니다.", "방문자에게 보여줄 항목을 3~4개로 제한합니다."]
          : ["Prepare a small JSON file or endpoint that your personal site can read.", "Limit the Orider API key to monthly aggregates.", "Limit public fields to three or four items."],
        steps: ko
          ? ["하루 1회 또는 월 1회 집계 데이터를 읽습니다.", "JSON에는 month, distanceKm, elevationM, rideCount, updatedAt만 남깁니다.", "사이트에서는 이 JSON을 읽어 '이번 달 642km 라이딩' 같은 작은 배지로 보여줍니다.", "API key가 노출되지 않도록 브라우저가 오라이더 API를 직접 호출하지 않게 합니다."]
          : ["Read aggregate data daily or monthly.", "Keep only month, distanceKm, elevationM, rideCount, and updatedAt in the JSON.", "Render a small badge such as '642 km ridden this month.'", "Do not let the browser call the Orider API directly with your API key."],
        result: ko ? "정확한 경로나 시작 위치 없이도 프로필에 라이더 정체성을 보여줄 수 있습니다." : "Your profile shows rider identity without exposing exact routes or start areas.",
        safety: ko ? "API key는 서버나 자동화 도구에만 두고, 공개 HTML/JS에는 절대 넣지 마세요." : "Keep API keys on a server or automation tool; never put them in public HTML or JavaScript.",
        aiPrompt: ko
          ? "너는 웹 자동화 구현 담당자야. 개인 웹사이트에 붙일 오라이더 공개 프로필 배지를 바로 만들 수 있게 서버/자동화 구조와 프론트엔드 코드를 작성해줘.\n\n목표: 브라우저에 API key를 노출하지 않고, 하루 1회 오라이더 월간 집계를 읽어 공개 JSON을 갱신한 뒤 개인 사이트에서 배지로 보여준다.\n참고 경로: API key 생성 화면은 /ko/settings/developer, API 가이드는 docs/PERSONAL_DATA_API.md, 정식 API 계약은 Swagger UI /api/v1/docs 또는 OpenAPI YAML /api/v1/docs/openapi.yaml이다.\nAPI 계약 확인: X-API-Key 헤더, endpoint path, request/response schema, content type, error code는 Swagger/OpenAPI를 기준으로 확인한다.\n필요 권한: Orider activities:read 또는 OpenAPI/가이드에 월간 집계 전용 scope가 있으면 그 최소 scope만 사용한다.\n사용자가 준비해야 할 값: ORIDER_API_KEY, 공개 JSON을 저장할 위치, 배지를 붙일 사이트 경로, 실행 시간대.\n공개 JSON 스키마: month, distanceKm, elevationM, rideCount, updatedAt만 포함한다.\n제외 항목: 경로, 출발지, 도착지, 활동명, 심박/파워 상세값, API key.\n출력 형식: 권장 아키텍처, GitHub Actions 또는 서버 함수 예시, 환경변수 목록, public JSON 예시, 프론트엔드 배지 컴포넌트, 캐시/오류 처리, 테스트 순서, 완료 조건을 순서대로 써줘.\n중요: Swagger/OpenAPI에 없는 endpoint나 응답 필드는 임의로 만들지 말고 확인 필요 항목으로 표시해줘."
          : "You are the web automation implementer. Write an implementation-ready server/automation design and frontend code for a public Orider profile badge on a personal website.\n\nGoal: never expose the API key in the browser. Once per day, read Orider monthly aggregates, update public JSON, and render that JSON as a small badge on the site.\nReference paths: create API keys at /en/settings/developer; API guide is docs/PERSONAL_DATA_API-en.md; the formal API contract is Swagger UI /api/v1/docs or OpenAPI YAML /api/v1/docs/openapi.yaml.\nAPI contract check: confirm the X-API-Key header, endpoint paths, request/response schemas, content types, and error codes in Swagger/OpenAPI.\nRequired scopes: use Orider activities:read, or a more limited monthly aggregate scope if OpenAPI/the guide provides one.\nValues the user must provide: ORIDER_API_KEY, public JSON storage location, site path for the badge, timezone.\nPublic JSON schema: include only month, distanceKm, elevationM, rideCount, and updatedAt.\nExclude: routes, start/end areas, activity names, detailed heart-rate/power values, and API keys.\nOutput format: recommended architecture, GitHub Actions or server-function example, environment variables, public JSON example, frontend badge component, cache/error handling, test steps, and done criteria.\nImportant: if an endpoint or response field is not documented in Swagger/OpenAPI, mark it as needs confirmation instead of inventing it.",
      },
    ],
    apiPath: {
      title: ko ? "직접 연결해서 쓰는 가장 짧은 경로" : "Shortest path to connect your own tools",
      body: ko
        ? "외부 도구에서 쓰려면 완성 기능을 복사하는 것이 아니라, Personal Data API로 본인 데이터를 읽어 직접 연결합니다. API key는 본인 계정에서 만들고 언제든 폐기할 수 있으며, 배치할 때 필요한 scope와 실행 주기만 선택해야 합니다."
        : "External tools do not copy a finished feature from this page. They connect to your own data through the Personal Data API. Create and revoke keys from your account, then choose only the scopes and schedule each deployment needs.",
      steps: [
        ko ? "1. /ko/settings/developer에서 개인 API key 생성" : "1. Create a personal API key at /en/settings/developer",
        ko ? "2. Swagger/OpenAPI의 endpoint 계약에 맞춰 Notion, Slack, n8n, 개인 서버에서 호출" : "2. Call endpoints from Swagger/OpenAPI in Notion, Slack, n8n, or your own server",
        ko ? "3. 실행 주기 선택: 수동, 매일 1회, 매주 월요일, 라이딩 완료 후" : "3. Choose a trigger: manual, daily, Monday morning, or after a ride",
        ko ? "4. 공유 전 위치·민감 지표를 집계하거나 제거하고, 필요하면 API key를 폐기" : "4. Aggregate or remove sensitive data before sharing, and revoke the key when needed",
      ],
    },
    apiDocs: {
      title: ko ? "API 계약 바로 확인" : "API contract",
      body: ko
        ? "레시피를 구현할 때 endpoint path, request/response schema, content type, error code는 md 문서가 아니라 Swagger/OpenAPI에서 확인하세요."
        : "When implementing recipes, confirm endpoint paths, request/response schemas, content types, and error codes in Swagger/OpenAPI instead of markdown docs.",
      swagger: ko ? "Swagger UI 열기" : "Open Swagger UI",
      yaml: ko ? "OpenAPI YAML 보기" : "View OpenAPI YAML",
    },
    weekly: {
      title: ko ? "주간 이동거리" : "Weekly distance",
      body: ko
        ? "주별 이동거리와 보조 훈련 점수(TSS)를 함께 확인합니다."
        : "Compare weekly distance with the supporting training score (TSS).",
      empty: ko ? "아직 차트로 표시할 활동이 없습니다." : "No activities to chart yet.",
      demo: ko ? "데모 데이터" : "Demo data",
      own: ko ? "내 데이터" : "My data",
      distance: ko ? "이동거리" : "Distance",
      time: ko ? "활동시간" : "Activity time",
      rides: ko ? "활동횟수" : "Activities",
      tss: ko ? "훈련점수" : "Training score",
      shareTitle: ko ? "최근 6주 훈련 기록" : "My last 6 weeks of training",
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
  const ko = language.startsWith("ko");
  switch (reason) {
    case "no-activities": return ko ? "최근 7일에 일기로 만들 자전거 활동이 없습니다. 활동을 기록하거나 가져온 뒤 다시 생성해 주세요." : "No cycling activities from the last 7 days are available for a diary. Record or import a ride, then try again.";
    case "in-flight": return ko ? "이미 일기를 생성하고 있습니다. 잠시 기다린 뒤 다시 확인해 주세요." : "A diary is already being generated. Please wait a moment before trying again.";
    case "daily-limit": return ko ? "오늘의 AI 일기 생성 한도를 모두 사용했습니다. 내일 다시 생성할 수 있습니다." : "You have used today's AI diary generation limit. You can generate again tomorrow.";
    case "attempt-limit": return ko ? "반복 요청 안전 한도에 도달했습니다. 실패 요청도 이 안전 한도에 포함되며, 내일 다시 시도할 수 있습니다." : "The repeated-request safety limit has been reached. Failed attempts count toward this safety limit. Please try again tomorrow.";
    case "consent-required": return ko ? "AI 처리 정책을 다시 확인해야 합니다. 생성 버튼을 다시 눌러 최신 정책에 동의해 주세요." : "Please review the current AI processing policy. Select Generate again to give your consent to the updated policy.";
    default: return fallback;
  }
}

export default function CreatorHubPage() {
  const { i18n } = useTranslation();
  const { t: loadT } = useTranslation("dashboard");
  const { user, signIn } = useAuth();
  const { showToast } = useToast();
  const { section: sectionParam } = useParams<{ section?: string }>();
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
  const [diaryError, setDiaryError] = useState<string | null>(null);
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
      setDiaryError(message);
      showToast(message, "error");
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
      setDiaryError(message);
      showToast(message, "error");
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
    <div className="event-controls-surface explore-records-surface space-y-8">
      {diaryPolicy && <dialog ref={consentDialogRef} className="fixed inset-0 m-auto w-full max-w-xl bg-transparent p-4 backdrop:bg-black/55" aria-labelledby="creator-ai-consent-title" onCancel={() => setDiaryPolicy(null)}>
        <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[var(--r-lg)] border p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)", color: "var(--ink-2)" }}>
          <h2 id="creator-ai-consent-title" className="text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{i18n.language.startsWith("ko") ? "AI 라이딩 일기 생성 동의" : "Consent to AI ride diary generation"}</h2>
          <p className="text-[length:var(--fs-sm)] leading-6">{diaryPolicy.purpose}</p>
          <dl className="space-y-3 text-[length:var(--fs-sm)] leading-6">
            <div><dt className="font-semibold">{i18n.language.startsWith("ko") ? "외부 AI 처리자 · 처리 국가" : "External AI processor · country"}</dt><dd>{diaryPolicy.processor.name} · {diaryPolicy.processor.country}</dd></div>
            <div><dt className="font-semibold">{i18n.language.startsWith("ko") ? "전송하는 데이터" : "Data sent"}</dt><dd>{diaryPolicy.dataCategories.join(" · ")}</dd></div>
            {diaryPolicy.excludedData && <div><dt className="font-semibold">{i18n.language.startsWith("ko") ? "전송하지 않는 데이터" : "Data excluded"}</dt><dd>{diaryPolicy.excludedData.join(" · ")}</dd></div>}
            <div><dt className="font-semibold">{i18n.language.startsWith("ko") ? "보관 안내" : "Retention"}</dt><dd>{diaryPolicy.retention}</dd></div>
          </dl>
          <p className="text-[length:var(--fs-sm)] leading-6">{i18n.language.startsWith("ko") ? "위치·활동명·원시 심박/파워는 보내지 않습니다. 원문은 나만 보는 초안이며 외부 공유는 별도 하이라이트를 확인한 뒤 직접 진행합니다." : "Location, activity names, and raw heart-rate/power data are not sent. Your diary is private; review the separate highlight before sharing it yourself."}</p>
          <a className="text-[length:var(--fs-sm)] underline" style={{ color: "var(--lime)" }} href={diaryPolicy.processor.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">{i18n.language.startsWith("ko") ? "AI 처리자 개인정보 정책" : "AI processor privacy policy"}</a>
          <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{i18n.language.startsWith("ko") ? `성공한 생성은 하루 ${diaryPolicy.dailyLimit}회까지. 동일 기록은 저장된 초안을 재사용합니다.` : `Up to ${diaryPolicy.dailyLimit} successful generations per day. Unchanged records reuse the saved draft.`}</p>
          <div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => setDiaryPolicy(null)}>{i18n.language.startsWith("ko") ? "취소" : "Cancel"}</Button><Button size="sm" variant="primary" onClick={() => void generateConsentedDiary()}>{i18n.language.startsWith("ko") ? "동의하고 생성" : "Agree and generate"}</Button></div>
        </div>
      </dialog>}

      <section className="grid gap-4">
        <div className="min-w-0 rounded-[var(--r-lg)] border p-6 md:p-8" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          {section === "overview" ? (
          <>
          <div className="mb-3 inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--ft-body-size)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--lime)" }}>
            <Sparkles size={ICON_SIZE.sm} />
            {copy.eyebrow}
          </div>
          <h1 data-testid="E6-0" className="mt-2 max-w-4xl text-[length:var(--fs-3xl)] font-bold leading-tight" style={{ color: "var(--ink-0)" }}>{copy.headline}</h1>
          <p className="mt-3 max-w-4xl text-[length:var(--fs-base)] leading-7" style={{ color: "var(--ink-3)" }}><GlossaryText>{copy.subtitle}</GlossaryText></p>
          <div className="mt-6 grid gap-2 min-[420px]:flex min-[420px]:flex-wrap">
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
            <h1 className="mt-3 max-w-3xl text-[length:var(--fs-2xl)] font-bold leading-tight" style={{ color: "var(--ink-0)" }}>{activeDetail?.title ?? copy.title}</h1>
            <p className="mt-2 max-w-3xl text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}>{activeDetail?.body ?? copy.subtitle}</p>
          </>
          )}
        </div>

        {section === "overview" && (
        <details className="creator-technical-summary">
          <summary>{i18n.language.startsWith("ko") ? "연결 방식과 데이터 권한" : "Connections and data access"}</summary>
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
          {i18n.language.startsWith("ko") ? "다른 활용 방법" : "More ways to use your rides"}
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
          <h2 className="text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{i18n.language.startsWith("ko") ? "목적에 맞는 연결 가이드" : "Guides for your tools"}</h2>
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
                  <Text as="div" variant="eyebrow">{i18n.language.startsWith("ko") ? "결과" : "Result"}</Text>
                  <p className="mt-1 text-[length:var(--ft-body-size)] font-medium leading-6" style={{ color: "var(--ink-1)" }}><CreatorTechnicalText language={i18n.language}>{item.result}</CreatorTechnicalText></p>
                  <p className="mt-2 text-[length:var(--ft-body-size)] leading-5" style={{ color: "var(--ink-3)" }}><CreatorTechnicalText language={i18n.language}>{item.safety}</CreatorTechnicalText></p>
                </div>
                <details className="creator-technical-summary mt-4"><summary>{i18n.language.startsWith("ko") ? "준비와 따라하기" : "Setup and steps"}</summary>
                <div className="mt-4 rounded-[var(--r-sm)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{i18n.language.startsWith("ko") ? "준비" : "Prepare"}</Text>
                  <ul className="mt-2 space-y-1.5">
                    {item.prepare.map((step) => (
                      <li key={step} className="text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-2)" }}><CreatorTechnicalText language={i18n.language}>{step}</CreatorTechnicalText></li>
                    ))}
                  </ul>
                </div>
                <Text as="div" variant="eyebrow" className="mt-4">{i18n.language.startsWith("ko") ? "따라하기" : "Steps"}</Text>
                <ol className="mt-2 space-y-2">
                  {item.steps.map((step) => (
                    <li key={step} className="text-[length:var(--ft-body-size)] leading-6" style={{ color: "var(--ink-3)" }}><CreatorTechnicalText language={i18n.language}>{step}</CreatorTechnicalText></li>
                  ))}
                </ol>

                </details>
                <details className="creator-technical-summary mt-4"><summary>{i18n.language.startsWith("ko") ? "AI 작업 지시와 복사" : "AI prompt and copy"}</summary>
                <div className="mt-4 rounded-[var(--r-sm)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line-soft)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText size={ICON_SIZE.sm} style={{ color: "var(--lime)" }} />
                      <Text as="div" variant="eyebrow">{i18n.language.startsWith("ko") ? "AI에게 전달할 작업 지시" : "Prompt for your AI assistant"}</Text>
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
      <div ref={recipesSectionRef} className="scroll-mt-28 flex gap-1 overflow-x-auto rounded-[var(--r-lg)] border p-1" role="tablist" aria-label="Creator Hub views" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
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
                  <summary>{i18n.language.startsWith("ko") ? "데이터 권한과 연결 방식" : "Data permissions and connections"}</summary>
                <div className="mt-4 grid gap-3 text-[length:var(--ft-body-size)] min-[420px]:grid-cols-2" style={{ color: "var(--ink-3)" }}>
                  <div>
                    <Text as="div" variant="eyebrow">{item.scopeLabel}</Text>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.scopes.map((scope) => <code key={scope} className={metadataCodeClass} style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{scope}</code>)}
                    </div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow">Share</Text>
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
                  }}><ShieldCheck size={ICON_SIZE.sm} />{i18n.language.startsWith("ko") ? "결과 미리보기" : "Preview output"}</Button>
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
              <details className="creator-technical-summary mt-3"><summary>{i18n.language.startsWith("ko") ? "생성 횟수와 데이터 안내" : "Generation limits and data"}</summary>
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
              {diaryError && <div className="mt-2 text-[length:var(--ft-body-size)]" style={{ color: "var(--rose)" }}>{diaryError}</div>}
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
            <div className="mt-4"><RecipeShareCard key={diary?.generatedAt ?? "example"} card={shareCard} language={i18n.language} ready={Boolean(diary)} onError={(action) => showToast(action === "export" ? (i18n.language.startsWith("ko") ? "이미지를 저장하지 못했습니다. 다시 시도해 주세요." : "Could not save the image. Please retry.") : copy.actions.copyFailed, "error")} /></div>
            {diary && (
              <div className="mt-3 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <Text as="div" variant="eyebrow">{i18n.language.startsWith("ko") ? "비공개 일기 · 나만 보기" : "Private diary · only you"} — {diary.diary.title}</Text>
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
          <div ref={shareSectionRef} className="mt-5"><RecipeShareCard key={diary?.generatedAt ?? "example"} card={shareCard} language={i18n.language} ready={Boolean(diary)} onError={(action) => showToast(action === "export" ? (i18n.language.startsWith("ko") ? "이미지를 저장하지 못했습니다. 다시 시도해 주세요." : "Could not save the image. Please retry.") : copy.actions.copyFailed, "error")} /></div>
          {diary && (
            <div data-testid="E6-2" className="mt-4 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <Text as="div" variant="eyebrow">{i18n.language.startsWith("ko") ? "비공개 일기 · 나만 보기" : "Private diary · only you"} — {diary.diary.title}</Text>
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
            <details className="creator-technical-summary mt-3"><summary>{i18n.language.startsWith("ko") ? "생성 횟수와 데이터 안내" : "Generation limits and data"}</summary>
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
              const ko = i18n.language.startsWith("ko");
              const pointsUnit = ko ? "점" : " pts";
              const basisText = basis ? [
                [ko ? "파워 기반 TSS" : "Power-based TSS", basis.power],
                [ko ? "심박 기반 TSS" : "Heart-rate TSS", basis.heartRate],
                [ko ? "시간 추정 TSS" : "Time-estimated TSS", basis.time],
                [ko ? "산출 기준 미상 TSS" : "Unknown-basis TSS", basis.unknown],
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
            <details className="creator-technical-summary mt-3"><summary>{i18n.language.startsWith("ko") ? "내 도구에 연결하는 방법" : "How to connect your tools"}</summary>
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
      <summary>{i18n.language.startsWith("ko") ? "활용 흐름과 데이터 보호 원칙" : "Workflow and data protection"}</summary>
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
  const ko = language.startsWith("ko");
  const terms: Record<string, string> = {
    KPI: ko ? "핵심 성과 지표입니다. 리포트에서 이동거리나 활동시간 같은 주요 값을 요약합니다." : "Key performance indicators: the main summary values in a report, such as distance and activity time.",
    HTML: ko ? "웹브라우저에서 열어 볼 수 있는 문서 형식입니다." : "A document format you can open in a web browser.",
    Swagger: ko ? "API 요청과 응답을 확인하고 시험할 수 있는 설명 도구입니다." : "A tool for reading and trying documented API requests and responses.",
    OpenAPI: ko ? "API의 요청 경로와 입력·응답 형식을 기술하는 표준입니다." : "A standard describing API endpoints and their request and response formats.",
  };
  return children.split(/\b(KPI|HTML|Swagger|OpenAPI)\b/g).map((part, index) => terms[part]
    ? <InfoTip key={index} title={part} content={terms[part]} label={part}>{part}</InfoTip>
    : <Fragment key={index}><GlossaryText>{part}</GlossaryText></Fragment>);
}
