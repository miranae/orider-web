import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import {
  Bell,
  BookOpen,
  Bot,
  Clipboard,
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
import { Button, Card, Chip, Text, buttonClass } from "../theme/components";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useWeeklyStats } from "../hooks/useActivities";
import { creatorRecipes, type CreatorRecipeIcon, type CreatorRecipeKind } from "../data/creatorRecipes";
import { functions } from "../services/firebase";

type CreatorTab = "featured" | "recipes" | "share";

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
  labels: string[];
  shareMode: string;
  deployMode: string;
  status: string;
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

const RECIPE_PR_URL = "https://github.com/miranae/orider-web/compare/main...recipe/my-orider-data?quick_pull=1";
const REQUEST_RECIPE_URL = "https://github.com/miranae/orider-web/issues/new?template=feature_request.md&title=%5BCreator%5D%20Recipe%20request%3A%20";
const recipeActionClass = "w-full justify-center min-[420px]:w-auto";
const metadataCodeClass = "max-w-full break-all rounded-[var(--r-sm)] px-1.5 py-0.5";

function parseCreatorTab(value: string | null): CreatorTab {
  return value === "recipes" || value === "share" ? value : "featured";
}

function buildCopy(language: string) {
  const ko = language.startsWith("ko");
  return {
    title: ko ? "Creator Hub" : "Creator Hub",
    eyebrow: ko ? "내 데이터로 써보고, 필요한 만큼 확장하는 공간" : "Try Orider data ideas, then extend them when needed",
    subtitle: ko
      ? "여기에는 오라이더 안에서 바로 써볼 수 있는 기능과, Personal Data API로 직접 만들어볼 수 있는 레시피가 함께 있습니다. 완성 앱 마켓이 아니라, 라이더의 데이터를 안전하게 활용하는 예시와 시작점입니다."
      : "This hub mixes features you can try inside Orider with recipes you can build using the Personal Data API. It is a safe starting point and showcase, not a finished app marketplace.",
    tabs: {
      featured: ko ? "추천" : "Featured",
      recipes: ko ? "레시피" : "Recipes",
      share: ko ? "자랑 카드" : "Share cards",
    },
    actions: {
      preview: ko ? "공유 카드 보기" : "Preview share card",
      recipe: ko ? "레시피 설명 보기" : "View recipe guide",
      generate: ko ? "AI 일기 생성" : "Generate diary",
      generating: ko ? "AI 일기 생성 중" : "Generating diary",
      post: ko ? "게시글로 공유" : "Share as post",
      copy: ko ? "카드 문구 복사" : "Copy card text",
      copied: ko ? "복사됨" : "Copied",
      loginNeeded: ko ? "로그인 후 생성 가능" : "Sign in to generate",
      submitRecipe: ko ? "레시피 제출" : "Submit recipe",
      requestRecipe: ko ? "활용법 요청" : "Request recipe",
      manageApiKeys: ko ? "API key 만들기" : "Create API key",
      emailRecipe: ko ? "내 이메일로 받기" : "Email me this",
      emailing: ko ? "이메일 발송 중" : "Sending email",
      emailed: ko ? "발송 완료" : "Sent",
      emailFailed: ko ? "이메일을 보내지 못했습니다" : "Could not send email",
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
    pathsTitle: ko ? "무엇부터 하면 될까요?" : "Where should I start?",
    paths: [
      {
        title: ko ? "라이더로 바로 써보기" : "Try as a rider",
        body: ko
          ? "로그인하지 않아도 데모 카드와 주간 차트를 먼저 볼 수 있습니다. 로그인하면 같은 버튼이 내 활동 데이터 기반 생성으로 바뀝니다."
          : "Preview the demo card and weekly chart without signing in. After sign-in, the same actions use your own activity data.",
        action: ko ? "데모 카드 보기" : "View demo card",
        tab: "share" as CreatorTab,
      },
      {
        title: ko ? "자동화로 연결하기" : "Connect automation",
        body: ko
          ? "Developer API에서 key를 만들고 필요한 scope만 선택합니다. Notion, Slack, n8n, 개인 서버에서 같은 데이터를 읽어갑니다."
          : "Create a Developer API key, choose only the needed scopes, and read the same data from Notion, Slack, n8n, or your server.",
        action: ko ? "연결 순서 보기" : "See connection steps",
        tab: "recipes" as CreatorTab,
      },
      {
        title: ko ? "아이디어만 남기기" : "Request an idea",
        body: ko
          ? "개발 지식이 없어도 됩니다. 동호회 리포트, 회복 알림, 월간 배지처럼 실제로 필요한 장면을 요청하면 됩니다."
          : "No development knowledge is required. Request real workflows such as club reports, recovery alerts, or monthly badges.",
        action: ko ? "활용법 요청" : "Request recipe",
        tab: "featured" as CreatorTab,
      },
    ],
    deployTitle: ko ? "레시피는 이렇게 배치합니다" : "How recipes get deployed",
    deployBody: ko
      ? "레시피가 많아져도 실제 사용으로 이어지려면 카드 선택에서 끝나면 안 됩니다. 실행 위치, 권한, 트리거, 중지 방법까지 정해야 배치된 레시피가 됩니다."
      : "As the recipe list grows, picking a card is not enough. A deployed recipe needs a runtime, scopes, trigger, and a clear way to stop it.",
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
      title: ko ? "오라이더 AI 크레딧 예시" : "Orider AI credits example",
      body: ko
        ? "AI 일기는 대표 레시피입니다. API key는 공개하지 않고 오라이더 서버가 Secret Manager의 키로 대신 호출하며, 이 예시는 사용자당 하루 5회까지 제공합니다."
        : "The AI diary is a reference recipe. Provider API keys are never exposed; Orider calls the model server-side with keys in Secret Manager, and this example provides 5 generations per rider per day.",
      quotaUnknown: ko ? "남은 횟수는 생성 후 표시됩니다." : "Remaining credits appear after generation.",
      remaining: ko ? "오늘 남은 생성 {{remaining}}/{{limit}}회" : "{{remaining}}/{{limit}} generations left today",
      cache: ko ? "오늘 이미 만든 초안을 다시 불러왔습니다." : "Loaded today's existing draft.",
      failed: ko
        ? "AI 일기를 생성하지 못했습니다. 활동 데이터가 있는지 확인하거나 일일 제한이 초기화된 뒤 다시 시도해 주세요."
        : "Could not generate the diary. Check that activity data is available, or try again after the daily limit resets.",
    },
    stats: [
      { label: ko ? "바로 써보기" : "Try now", value: ko ? "일부" : "Some" },
      { label: ko ? "확장 방식" : "Build path", value: ko ? "API/레시피" : "API/recipes" },
      { label: ko ? "데이터 접근" : "Data access", value: ko ? "본인만" : "Own data" },
    ],
    card: {
      outcome: ko ? "나오는 결과" : "Output",
      delivery: ko ? "전달 채널" : "Delivery",
      why: ko ? "왜 유용한가" : "Why it helps",
      deploy: ko ? "배치 방식" : "Deployment",
    },
    email: {
      title: ko ? "이메일 알림까지 지원" : "Email delivery included",
      body: ko
        ? "대표 레시피는 본인 계정 이메일로 결과를 보내볼 수 있습니다. 정기 발송은 별도 opt-in이 필요하며, 현재 즉시 발송은 사용자당 하루 5회로 제한됩니다."
        : "Flagship recipes can send a result to your account email. Recurring delivery needs a separate opt-in; instant sends are limited to 5 per rider per day.",
      safety: ko
        ? "임의 주소 입력은 허용하지 않고, 로그인한 본인의 확인된 이메일로만 보냅니다."
        : "No arbitrary recipient entry: Orider sends only to the signed-in rider's verified account email.",
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
      label: ko ? "이번 주 라이딩 일기" : "Weekly ride diary",
      title: ko ? "긴 업힐을 버틴 꾸준한 한 주" : "A steady week that held through the climbs",
      body: ko
        ? "총 182km, 상승고도 2,140m. 수요일 고강도 이후 금요일은 회복주로 전환했고, 주말 롱라이드에서 페이스가 안정적으로 돌아왔습니다."
        : "182 km total with 2,140 m climbed. After a hard Wednesday, Friday shifted to recovery and the weekend long ride settled back into a steady pace.",
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
      },
      {
        title: ko ? "내 도구에 직접 연결하기" : "Connect it to your own tools",
        body: ko
          ? "설정의 Developer API에서 개인 API key를 만들고, 필요한 scope만 골라 Notion, Slack, n8n, 개인 대시보드 같은 도구에서 본인 데이터를 읽어갑니다. 이 단계는 간단한 자동화나 개발 지식이 필요합니다."
          : "Create a personal API key in Developer API settings, choose only the scopes you need, and read your own data from tools like Notion, Slack, n8n, or a personal dashboard. This path needs basic automation or development knowledge.",
      },
      {
        title: ko ? "아이디어만 제안하기" : "Request an idea",
        body: ko
          ? "코드를 몰라도 됩니다. 동호회에서 필요한 리포트, 훈련 알림, 월간 배지, 공유 카드 같은 활용 장면을 요청하면 레시피 후보가 됩니다."
          : "No code is required. Requests for club reports, training alerts, monthly badges, or share cards can become future recipe candidates.",
      },
    ],
    integrationsTitle: ko ? "활용 예시" : "Example integrations",
    integrations: [
      {
        name: "Notion",
        goal: ko ? "월요일 아침마다 훈련 일지가 자동으로 쌓이게 하기" : "Build a training journal automatically every Monday morning",
        steps: ko
          ? ["activities:read와 fitness:read scope로 API key를 만듭니다.", "Notion 데이터베이스에 주간 거리, 시간, 부하, 코멘트 칼럼을 준비합니다.", "n8n이나 개인 스크립트가 매주 월요일 API를 읽고 한 줄 회고까지 적습니다."]
          : ["Create an API key with activities:read and fitness:read scopes.", "Prepare distance, time, load, and note columns in a Notion database.", "Let n8n or a small script read the API every Monday and write a short review."],
        result: ko ? "라이딩을 끝낸 뒤 따로 정리하지 않아도 주간 훈련 로그가 남습니다." : "Weekly training logs appear without manual cleanup after rides.",
      },
      {
        name: "Slack",
        goal: ko ? "무리한 연속 훈련 전에 회복 알림 받기" : "Get a recovery nudge before hard days stack up",
        steps: ko
          ? ["최근 7일 활동 시간과 부하만 읽습니다.", "고강도 운동이 이어지면 개인 DM으로 먼저 보냅니다.", "팀 채널 공유는 거리/시간 같은 집계값만 선택합니다."]
          : ["Read only the last 7 days of duration and load.", "Send the first alert as a private DM when hard sessions stack up.", "Share only aggregate distance/time if posting to a team channel."],
        result: ko ? "코치나 팀원에게 민감한 위치·심박 데이터를 공개하지 않고 회복 신호만 공유할 수 있습니다." : "Recovery signals can be shared without exposing sensitive location or heart-rate data.",
      },
      {
        name: "n8n",
        goal: ko ? "코드 없이 월간 배지와 이메일 요약 만들기" : "Create a monthly badge and email summary without much code",
        steps: ko
          ? ["매월 1일 API에서 지난달 집계 데이터를 가져옵니다.", "거리, 상승고도, 최장 라이딩만 공개 항목으로 고릅니다.", "배지 문구는 이메일로 받고, 공개용 JSON은 개인 사이트에 붙입니다."]
          : ["On the first day of each month, fetch last month's aggregate data.", "Choose only distance, elevation, and longest ride as public fields.", "Email the badge copy and publish a public JSON snippet to a personal site."],
        result: ko ? "정확한 경로 없이도 꾸준함을 자랑할 수 있는 월간 리포트가 생깁니다." : "You get a monthly report that celebrates consistency without exact routes.",
      },
      {
        name: ko ? "개인 웹사이트" : "Personal site",
        goal: ko ? "블로그나 프로필에 라이딩 현황 배지 달기" : "Add a ride-status badge to a blog or profile",
        steps: ko
          ? ["public-safe widget 레시피처럼 월간 집계만 읽습니다.", "출발지, 도착지, 지도 좌표는 응답에서 제외합니다.", "방문자에게는 거리, 상승고도, 활동 수, 최근 갱신일만 보여줍니다."]
          : ["Read only monthly aggregates like the public-safe widget recipe.", "Exclude starts, finishes, and map coordinates from the response.", "Show visitors distance, elevation, activity count, and last updated date."],
        result: ko ? "개인정보 노출 없이 프로필에 라이더 정체성을 보여줄 수 있습니다." : "Your profile shows rider identity without leaking private ride details.",
      },
    ],
    apiPath: {
      title: ko ? "직접 연결해서 쓰는 가장 짧은 경로" : "Shortest path to connect your own tools",
      body: ko
        ? "외부 도구에서 쓰려면 완성 기능을 복사하는 것이 아니라, Personal Data API로 본인 데이터를 읽어 직접 연결합니다. API key는 본인 계정에서 만들고 언제든 폐기할 수 있으며, 배치할 때 필요한 scope와 실행 주기만 선택해야 합니다."
        : "External tools do not copy a finished feature from this page. They connect to your own data through the Personal Data API. Create and revoke keys from your account, then choose only the scopes and schedule each deployment needs.",
      steps: [
        ko ? "1. 설정 → Developer API에서 개인 API key 생성" : "1. Create a personal API key in Settings → Developer API",
        ko ? "2. Notion, Slack, n8n, 개인 서버 등에서 문서화된 API 호출" : "2. Call the documented API from Notion, Slack, n8n, or your own server",
        ko ? "3. 실행 주기 선택: 수동, 매일 1회, 매주 월요일, 라이딩 완료 후" : "3. Choose a trigger: manual, daily, Monday morning, or after a ride",
        ko ? "4. 공유 전 위치·민감 지표를 집계하거나 제거하고, 필요하면 API key를 폐기" : "4. Aggregate or remove sensitive data before sharing, and revoke the key when needed",
      ],
    },
    weekly: {
      title: ko ? "바로 써보기: 주간 부하 차트" : "Try now: weekly load chart",
      body: ko
        ? "오라이더 안에서는 로그인만 하면 최근 주간 활동으로 차트를 바로 볼 수 있습니다. Notion, Slack, n8n 등에 붙여 쓰려면 Personal Data API로 같은 데이터를 읽어 직접 자동화를 만들어야 합니다."
        : "Inside Orider, signed-in riders can view this chart from their recent weekly activity data. To use it in Notion, Slack, n8n, or another tool, connect through the Personal Data API and build the automation yourself.",
      empty: ko ? "아직 차트로 표시할 활동이 없습니다." : "No activities to chart yet.",
      demo: ko ? "데모 데이터" : "Demo data",
      own: ko ? "내 데이터" : "My data",
      distance: ko ? "거리" : "Distance",
      time: ko ? "시간" : "Time",
      rides: ko ? "활동" : "Activities",
      tss: ko ? "부하" : "Load",
      shareTitle: ko ? "이번 주 훈련 부하 카드" : "Weekly training load card",
    },
  };
}

function demoWeeklyStats() {
  return [
    { week: "5/11", distance: 84, time: 3.4, elevation: 620, rides: 2, tss: 132 },
    { week: "5/18", distance: 126, time: 4.9, elevation: 1040, rides: 3, tss: 211 },
    { week: "5/25", distance: 94, time: 3.7, elevation: 760, rides: 2, tss: 158 },
    { week: "6/1", distance: 162, time: 6.2, elevation: 1510, rides: 4, tss: 302 },
    { week: "6/8", distance: 118, time: 4.4, elevation: 870, rides: 3, tss: 196 },
    { week: "6/15", distance: 188, time: 7.1, elevation: 2140, rides: 4, tss: 344 },
  ];
}

export default function CreatorHubPage() {
  const { i18n } = useTranslation();
  const { user, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { weeklyStats } = useWeeklyStats();
  const copy = useMemo(() => buildCopy(i18n.language), [i18n.language]);
  const [tab, setTabState] = useState<CreatorTab>(() => parseCreatorTab(searchParams.get("tab")));
  const [copied, setCopied] = useState(false);
  const [chartCopied, setChartCopied] = useState(false);
  const [reportedItemIds, setReportedItemIds] = useState<Set<string>>(() => new Set());
  const [reportFailedItemIds, setReportFailedItemIds] = useState<Set<string>>(() => new Set());
  const [diary, setDiary] = useState<AiDiaryResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [emailSendingId, setEmailSendingId] = useState<string | null>(null);
  const [emailSentItemIds, setEmailSentItemIds] = useState<Set<string>>(() => new Set());
  const [emailFailedItemIds, setEmailFailedItemIds] = useState<Set<string>>(() => new Set());

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
        labels: localized.labels,
        shareMode: localized.shareMode,
        deployMode: localized.deployMode,
        status: localized.status,
      };
    });
  }, [i18n.language]);

  const visibleItems = items.filter((item) => {
    if (tab === "featured") return true;
    if (tab === "recipes") return item.id !== "ai-diary";
    return item.id === "ai-diary" || item.id === "ride-widget";
  });

  const chartWeeks = useMemo(() => {
    const actual = weeklyStats.filter((week) => week.rides > 0 || week.distance > 0 || week.tss > 0).slice(-6);
    return actual.length > 0 ? actual : demoWeeklyStats();
  }, [weeklyStats]);
  const chartMax = Math.max(1, ...chartWeeks.map((week) => week.tss || week.distance || 0));
  const chartTotal = chartWeeks.reduce(
    (acc, week) => ({
      distance: acc.distance + week.distance,
      time: acc.time + week.time,
      rides: acc.rides + week.rides,
      tss: acc.tss + week.tss,
    }),
    { distance: 0, time: 0, rides: 0, tss: 0 },
  );
  const chartUsesOwnData = Boolean(user && weeklyStats.some((week) => week.rides > 0 || week.distance > 0 || week.tss > 0));
  const shareCard = diary?.shareCard ?? copy.shareCard;
  const shareText = `${shareCard.title}\n${shareCard.body}\n${shareCard.footer}`;
  const weeklyShareText = `${copy.weekly.shareTitle}\n${copy.weekly.distance}: ${Math.round(chartTotal.distance)}km · ${copy.weekly.time}: ${chartTotal.time.toFixed(1)}h · ${copy.weekly.rides}: ${chartTotal.rides} · ${copy.weekly.tss}: ${chartTotal.tss}\n${chartUsesOwnData ? copy.weekly.own : copy.weekly.demo}`;

  const setTab = (nextTab: CreatorTab) => {
    setTabState(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "featured") nextParams.delete("tab");
    else nextParams.set("tab", nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(shareText);
      setCopied(true);
      showToast(copy.actions.copied);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast(copy.actions.copyFailed, "error");
    }
  };

  const handleCopyChart = async () => {
    try {
      await navigator.clipboard?.writeText(weeklyShareText);
      setChartCopied(true);
      showToast(copy.actions.copied);
      window.setTimeout(() => setChartCopied(false), 1600);
    } catch {
      showToast(copy.actions.copyFailed, "error");
    }
  };

  const handleEmailRecipe = async (itemId: string) => {
    if (!user) {
      showToast(copy.actions.emailLogin, "info");
      await signInWithGoogle();
      return;
    }
    setEmailSendingId(itemId);
    try {
      const fn = httpsCallable<{ recipeId: string; lang: string }, { sent: boolean; recipeId: string; email: string }>(
        functions,
        "sendCreatorRecipeEmail",
        { timeout: 60_000 },
      );
      await fn({ recipeId: itemId, lang: i18n.language.startsWith("en") ? "en" : "ko" });
      setEmailFailedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setEmailSentItemIds((prev) => new Set(prev).add(itemId));
      showToast(copy.actions.emailed);
    } catch {
      setEmailFailedItemIds((prev) => new Set(prev).add(itemId));
      showToast(copy.actions.emailFailed, "error");
    } finally {
      setEmailSendingId(null);
    }
  };

  const handleGenerateDiary = async () => {
    if (!user) {
      showToast(copy.actions.loginPrompt, "info");
      await signInWithGoogle();
      return;
    }
    setGenerating(true);
    setDiaryError(null);
    try {
      const fn = httpsCallable<{ lang: string; period: "week" }, AiDiaryResponse>(
        functions,
        "generateAiDiary",
        { timeout: 90_000 },
      );
      const result = await fn({ lang: i18n.language.startsWith("en") ? "en" : "ko", period: "week" });
      setDiary(result.data);
      setTab("share");
      showToast(result.data.source === "cache" ? copy.credit.cache : copy.actions.previewOpened);
    } catch {
      setDiaryError(copy.credit.failed);
      showToast(copy.credit.failed, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleReportItem = async (itemId: string) => {
    if (!user) {
      showToast(copy.actions.reportLogin, "info");
      await signInWithGoogle();
      return;
    }
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
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-[var(--r-lg)] border p-5 md:p-6" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <div className="mb-3 inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--fs-xs)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--lime)" }}>
            <Sparkles size={14} />
            {copy.eyebrow}
          </div>
          <h1 className="text-[length:var(--fs-2xl)] font-bold" style={{ color: "var(--ink-0)" }}>{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-[length:var(--fs-sm)] leading-6" style={{ color: "var(--ink-3)" }}>
            {copy.subtitle}
          </p>
          <div className="mt-5 grid gap-2 min-[420px]:flex min-[420px]:flex-wrap">
            <Link to="/board/write" className={buttonClass({ variant: "primary", size: "sm", className: recipeActionClass })}>
                <MessageSquareText size={15} aria-hidden />
                {copy.actions.post}
            </Link>
            <Button
              className={recipeActionClass}
              size="sm"
              variant="secondary"
              onClick={() => {
                setTab("recipes");
              }}
            >
                <BookOpen size={15} />
                {copy.actions.recipe}
            </Button>
            <Button className={recipeActionClass} size="sm" variant="secondary" onClick={handleGenerateDiary} loading={generating}>
              <Bot size={15} />
              {user ? (generating ? copy.actions.generating : copy.actions.generate) : copy.actions.loginNeeded}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 lg:grid-cols-1">
          {copy.stats.map((stat) => (
            <div key={stat.label} className="rounded-[var(--r-lg)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
              <Text as="div" variant="eyebrow">{stat.label}</Text>
              <div className="mt-1 text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--r-lg)] border p-4 md:p-5" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.pathsTitle}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {copy.paths.map((path) => (
            <div key={path.title} className="flex flex-col rounded-[var(--r-md)] border p-4 md:min-h-44" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{path.title}</div>
              <p className="mt-2 text-[length:var(--fs-xs)] leading-5 md:flex-1" style={{ color: "var(--ink-3)" }}>{path.body}</p>
              {path.action === copy.actions.requestRecipe ? (
                <a href={REQUEST_RECIPE_URL} className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3 w-full justify-center" })}>
                  <MessageSquareText size={15} aria-hidden />
                  {path.action}
                </a>
              ) : (
                <Button
                  className="mt-3 w-full justify-center"
                  size="sm"
                  variant={path.tab === "share" ? "primary" : "secondary"}
                  onClick={() => {
                    setTab(path.tab);
                    if (path.tab === "share") {
                      showToast(copy.actions.previewOpened, "info");
                    }
                  }}
                >
                  {path.tab === "share" ? <ShieldCheck size={15} /> : <BookOpen size={15} />}
                  {path.action}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--r-lg)] border p-4 md:p-5" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.deployTitle}</h2>
            <p className="mt-1 max-w-4xl text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.deployBody}</p>
          </div>
          <Link to="/settings?section=developer" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <KeyRound size={15} aria-hidden />
            {copy.actions.manageApiKeys}
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {copy.deploySteps.map((step) => (
            <div key={step.title} className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{step.title}</div>
              <p className="mt-2 text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[var(--r-lg)] border p-4 md:p-5" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.useModesTitle}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {copy.useModes.map((mode) => (
              <div key={mode.title} className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{mode.title}</div>
                <p className="mt-2 text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>{mode.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] border p-4 md:p-5" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.integrationsTitle}</h2>
          <div className="mt-4 grid gap-3">
            {copy.integrations.map((item) => (
              <div key={item.name} className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <div className="text-[length:var(--fs-xs)] font-semibold" style={{ color: "var(--lime)" }}>{item.name}</div>
                  <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{item.goal}</div>
                </div>
                <ol className="mt-2 space-y-1.5">
                  {item.steps.map((step) => (
                    <li key={step} className="text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>{step}</li>
                  ))}
                </ol>
                <p className="mt-2 text-[length:var(--fs-xs)] font-medium leading-5" style={{ color: "var(--ink-2)" }}>{item.result}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex gap-1 overflow-x-auto rounded-[var(--r-lg)] border p-1" role="tablist" aria-label="Creator Hub views" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        {(["featured", "recipes", "share"] as CreatorTab[]).map((nextTab) => {
          const active = tab === nextTab;
          return (
            <button
              key={nextTab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(nextTab)}
              className="h-9 shrink-0 rounded-[var(--r-md)] px-3 text-[length:var(--fs-sm)] font-medium"
              style={{
                background: active ? "var(--bg-3)" : "transparent",
                color: active ? "var(--ink-0)" : "var(--ink-3)",
              }}
            >
              {copy.tabs[nextTab]}
            </button>
          );
        })}
      </div>

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid items-start gap-3 md:grid-cols-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.id} padding="none" className="self-start p-4!">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]" style={{ background: "var(--bg-2)", color: kindTone[item.kind] }}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 break-words text-[length:var(--fs-base)] font-semibold leading-5" style={{ color: "var(--ink-0)" }}>{item.title}</h2>
                        <Chip>{item.status}</Chip>
                      </div>
                      <p className="mt-1 break-words text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{item.summary}</p>
                    </div>
                </div>

                <div className="mt-4 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.outcome}</Text>
                  <p className="mt-1 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-1)" }}>{item.outcome}</p>
                  <Text as="div" variant="eyebrow" className="mt-3">{copy.card.why}</Text>
                  <p className="mt-1 text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>{item.detail}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.labels.map((label) => (
                    <Chip key={label}>{label}</Chip>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 text-[length:var(--fs-xs)] min-[420px]:grid-cols-2" style={{ color: "var(--ink-3)" }}>
                  <div>
                    <Text as="div" variant="eyebrow">Scopes</Text>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.scopes.map((scope) => <code key={scope} className={metadataCodeClass} style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{scope}</code>)}
                    </div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow">Share</Text>
                    <div className="mt-1 break-words" style={{ color: "var(--ink-2)" }}>{item.shareMode}</div>
                  </div>
                </div>
                <div className="mt-3 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.delivery}</Text>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.channels.map((channel) => (
                      <code key={channel} className={metadataCodeClass} style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{channel}</code>
                    ))}
                  </div>
                </div>
                <div className="mt-3 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.deploy}</Text>
                  <p className="mt-1 text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>{item.deployMode}</p>
                </div>

                <div className="mt-4 grid gap-2 min-[420px]:flex min-[420px]:flex-wrap">
                  <Button
                    className={recipeActionClass}
                    size="sm"
                    variant={item.id === "ai-diary" ? "primary" : "secondary"}
                    onClick={() => {
                      setTab("share");
                      showToast(copy.actions.previewOpened, "info");
                    }}
                  >
                    <ShieldCheck size={15} />
                    {copy.actions.preview}
                  </Button>
                  <Button className={recipeActionClass} size="sm" variant="secondary" loading={emailSendingId === item.id} onClick={() => void handleEmailRecipe(item.id)}>
                    <Send size={15} />
                    {emailSendingId === item.id
                      ? copy.actions.emailing
                      : emailSentItemIds.has(item.id)
                        ? copy.actions.emailed
                        : emailFailedItemIds.has(item.id)
                          ? copy.actions.emailFailed
                          : copy.actions.emailRecipe}
                  </Button>
                  <Button
                    className={recipeActionClass}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTab("recipes");
                    }}
                  >
                      <BookOpen size={15} />
                      {copy.actions.recipe}
                  </Button>
                  <Button
                    className={recipeActionClass}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTab("recipes");
                      showToast(copy.actions.deployOpened, "info");
                    }}
                  >
                    <KeyRound size={15} />
                    {copy.actions.deploy}
                  </Button>
                  <Button className={recipeActionClass} size="sm" variant="ghost" onClick={() => void handleReportItem(item.id)}>
                    <Flag size={15} />
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
              <Bell size={18} style={{ color: "var(--amber)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.email.title}</h2>
            </div>
            <p className="mt-2 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.email.body}</p>
            <div className="mt-3 rounded-[var(--r-md)] border p-3 text-[length:var(--fs-xs)] leading-5" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)", color: "var(--ink-2)" }}>
              {copy.email.safety}
            </div>
          </div>

          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="flex items-center gap-2">
              <Lock size={18} style={{ color: "var(--lime)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.privacyTitle}</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {copy.privacy.map((item) => (
                <li key={item} className="flex gap-2 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-2)" }}>
                  <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: "var(--lime)" }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
            <div className="mb-4 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <div className="flex items-center gap-2">
                <Bot size={16} style={{ color: "var(--lime)" }} />
                <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.credit.title}</div>
              </div>
              <p className="mt-1 text-[length:var(--fs-xs)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.credit.body}</p>
              <div className="mt-2 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>
                {diary?.quota
                  ? copy.credit.remaining.replace("{{remaining}}", String(diary.quota.remaining)).replace("{{limit}}", String(diary.quota.limit))
                  : diary?.source === "cache"
                    ? copy.credit.cache
                    : copy.credit.quotaUnknown}
              </div>
              {diaryError && <div className="mt-2 text-[length:var(--fs-xs)]" style={{ color: "var(--rose)" }}>{diaryError}</div>}
              <div className="mt-3">
                <Button size="sm" variant="primary" onClick={handleGenerateDiary} loading={generating}>
                  <Sparkles size={15} />
                  {user ? (generating ? copy.actions.generating : copy.actions.generate) : copy.actions.loginNeeded}
                </Button>
              </div>
            </div>
            <Text as="div" variant="eyebrow">{copy.shareCard.label}</Text>
            <h2 className="mt-1 text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.shareTitle}</h2>
            <p className="mt-1 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.shareSubtitle}</p>
            <div className="mt-4 rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
              <div className="mb-2 flex items-center gap-2 text-[length:var(--fs-xs)] font-semibold" style={{ color: "var(--lime)" }}>
                <Sparkles size={14} />
                {copy.shareCard.label}
              </div>
              <div className="text-[length:var(--fs-base)] font-semibold leading-6" style={{ color: "var(--ink-0)" }}>{shareCard.title}</div>
              <p className="mt-2 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-2)" }}>{shareCard.body}</p>
              <div className="mt-3 inline-flex items-center gap-1 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--fs-xs)]" style={{ background: "var(--bg-1)", color: "var(--ink-3)" }}>
                <Lock size={13} />
                {shareCard.footer}
              </div>
            </div>
            {diary && (
              <div className="mt-3 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
                <Text as="div" variant="eyebrow">{diary.diary.title}</Text>
                <p className="mt-1 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-2)" }}>{diary.diary.body}</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={handleCopy}>
                <Clipboard size={15} />
                {copied ? copy.actions.copied : copy.actions.copy}
              </Button>
              <Link to="/board/write" className={buttonClass({ variant: "primary", size: "sm" })}>
                  <MessageSquareText size={15} aria-hidden />
                  {copy.actions.post}
              </Link>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--fs-xs)] font-semibold" style={{ background: "var(--bg-2)", color: "var(--aqua)" }}>
                <LineChart size={14} />
                {chartUsesOwnData ? copy.weekly.own : copy.weekly.demo}
              </div>
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.weekly.title}</h2>
              <p className="mt-1 max-w-3xl text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.weekly.body}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleCopyChart}>
              <Clipboard size={15} />
              {chartCopied ? copy.actions.copied : copy.actions.copyChart}
            </Button>
          </div>

          <div className="mt-4 grid h-48 grid-cols-6 items-end gap-2 rounded-[var(--r-md)] border p-3" style={{ background: "var(--bg-2)", borderColor: "var(--line-soft)" }}>
            {chartWeeks.map((week) => {
              const height = Math.max(8, Math.round(((week.tss || week.distance || 0) / chartMax) * 132));
              return (
                <div key={week.week} className="flex h-full min-w-0 flex-col justify-end gap-2">
                  <div className="flex min-h-0 flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-10 rounded-t-[var(--r-sm)]"
                      style={{ height, background: "linear-gradient(180deg, var(--aqua), var(--lime))" }}
                      title={`${week.week}: ${week.tss} TSS, ${week.distance}km`}
                    />
                  </div>
                  <div className="truncate text-center text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{week.week}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: copy.weekly.distance, value: `${Math.round(chartTotal.distance)}km` },
              { label: copy.weekly.time, value: `${chartTotal.time.toFixed(1)}h` },
              { label: copy.weekly.rides, value: String(chartTotal.rides) },
              { label: copy.weekly.tss, value: String(chartTotal.tss) },
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
            <div className="flex items-center gap-2">
              <Send size={18} style={{ color: "var(--lime)" }} />
              <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.apiPath.title}</h2>
            </div>
            <p className="mt-2 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.apiPath.body}</p>
            <ol className="mt-3 space-y-2">
              {copy.apiPath.steps.map((step) => (
                <li key={step} className="text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-2)" }}>{step}</li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/settings?section=developer" className={buttonClass({ variant: "secondary", size: "sm" })}>
                <KeyRound size={15} aria-hidden />
                {copy.actions.manageApiKeys}
              </Link>
              <a href={RECIPE_PR_URL} className={buttonClass({ variant: "primary", size: "sm" })}>
                <GitPullRequest size={15} aria-hidden />
                {copy.actions.submitRecipe}
              </a>
              <a href={REQUEST_RECIPE_URL} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <MessageSquareText size={15} aria-hidden />
                {copy.actions.requestRecipe}
              </a>
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
        <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{copy.builderTitle}</h2>
        <p className="mt-1 max-w-4xl text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{copy.builderBody}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/settings?section=developer" className={buttonClass({ variant: "primary", size: "sm" })}>
            <KeyRound size={15} aria-hidden />
            {copy.actions.manageApiKeys}
          </Link>
          <a href={RECIPE_PR_URL} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <GitPullRequest size={15} aria-hidden />
            {copy.actions.submitRecipe}
          </a>
          <a href={REQUEST_RECIPE_URL} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <MessageSquareText size={15} aria-hidden />
            {copy.actions.requestRecipe}
          </a>
        </div>
      </section>
    </div>
  );
}
