import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

function buildCopy(language: string) {
  const ko = language.startsWith("ko");
  return {
    title: ko ? "Creator Hub" : "Creator Hub",
    eyebrow: ko ? "내 데이터로 만드는 오라이더 활용 사례" : "Build with your own Orider data",
    subtitle: ko
      ? "라이더가 본인 데이터로 만든 차트, AI 일기, 알림, 리포트, 위젯을 발견하고 개인정보를 보호한 결과 카드로 공유하는 공간입니다."
      : "Discover charts, AI diaries, alerts, reports, and widgets built from a rider's own data, then share privacy-safe result cards.",
    tabs: {
      featured: ko ? "추천" : "Featured",
      recipes: ko ? "레시피" : "Recipes",
      share: ko ? "자랑 카드" : "Share cards",
    },
    actions: {
      preview: ko ? "공유 카드 보기" : "Preview share card",
      recipe: ko ? "레시피 보기" : "View recipe",
      generate: ko ? "AI 일기 생성" : "Generate diary",
      generating: ko ? "생성 중" : "Generating",
      post: ko ? "게시글로 공유" : "Share as post",
      copy: ko ? "카드 문구 복사" : "Copy card text",
      copied: ko ? "복사됨" : "Copied",
      loginNeeded: ko ? "로그인 후 생성 가능" : "Sign in to generate",
      submitRecipe: ko ? "레시피 제출" : "Submit recipe",
      requestRecipe: ko ? "활용법 요청" : "Request recipe",
      manageApiKeys: ko ? "API key 만들기" : "Create API key",
      emailRecipe: ko ? "내 이메일로 받기" : "Email me this",
      emailing: ko ? "발송 중" : "Sending",
      emailed: ko ? "발송 완료" : "Sent",
      emailFailed: ko ? "이메일 발송 실패" : "Email failed",
      copyChart: ko ? "차트 카드 복사" : "Copy chart card",
      report: ko ? "신고" : "Report",
      reported: ko ? "검토 대기" : "Under review",
      reportFailed: ko ? "신고 접수 실패" : "Report failed",
    },
    credit: {
      title: ko ? "오라이더 AI 크레딧 예시" : "Orider AI credits example",
      body: ko
        ? "AI 일기는 대표 레시피입니다. API key는 공개하지 않고 오라이더 서버가 Secret Manager의 키로 대신 호출하며, 이 예시는 사용자당 하루 5회까지 제공합니다."
        : "The AI diary is a reference recipe. Provider API keys are never exposed; Orider calls the model server-side with keys in Secret Manager, and this example provides 5 generations per rider per day.",
      quotaUnknown: ko ? "남은 횟수는 생성 후 표시됩니다." : "Remaining credits appear after generation.",
      remaining: ko ? "오늘 남은 생성 {{remaining}}/{{limit}}회" : "{{remaining}}/{{limit}} generations left today",
      cache: ko ? "오늘 이미 만든 초안을 다시 불러왔습니다." : "Loaded today's existing draft.",
      failed: ko ? "AI 일기 생성에 실패했습니다. 활동 데이터 또는 일일 제한을 확인해 주세요." : "Failed to generate the diary. Check activity data or daily quota.",
    },
    stats: [
      { label: ko ? "대표 레시피" : "Flagship recipes", value: "5" },
      { label: ko ? "기본 공개범위" : "Default visibility", value: ko ? "비공개" : "Private" },
      { label: ko ? "데이터 접근" : "Data access", value: ko ? "본인만" : "Own data" },
    ],
    card: {
      outcome: ko ? "나오는 결과" : "Output",
      delivery: ko ? "전달 채널" : "Delivery",
      why: ko ? "왜 유용한가" : "Why it helps",
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
      ? "개발자는 레시피를 PR로 제출하고, 일반 사용자는 기능 제안으로 활용 사례를 남길 수 있습니다. 오라이더 안에서는 검토된 레시피와 결과 카드가 Creator Hub에 노출됩니다."
      : "Developers can submit recipes by PR, while riders can propose use cases. Reviewed recipes and result cards surface here in Orider.",
    apiPath: {
      title: ko ? "개발자가 시작하는 가장 짧은 경로" : "Shortest path for builders",
      body: ko
        ? "현재는 본인 데이터 읽기용 최소 Personal Data API가 열려 있습니다. 먼저 레시피를 만들고, 필요한 scope와 공개 안전 출력을 Creator Hub에 제안하세요. 승인된 레시피는 오라이더 안에서 발견되고, 서버-side AI credit 같은 보호된 실행 경로를 붙일 수 있습니다."
        : "The minimum owner-only Personal Data API is live. Start with a recipe, required scopes, and public-safe output. Reviewed recipes can surface inside Orider and receive protected execution paths such as server-side AI credits.",
      steps: [
        ko ? "1. API key 또는 샘플 데이터로 결과물을 정의" : "1. Define the output using an API key or sample data",
        ko ? "2. 필요한 scope와 공개 안전 출력을 명시" : "2. Declare required scopes and public-safe output",
        ko ? "3. PR 또는 요청으로 Creator Hub에 제안" : "3. Submit a PR or request it for Creator Hub",
      ],
    },
    weekly: {
      title: ko ? "실제 예시: 주간 부하 차트" : "Live example: weekly load chart",
      body: ko
        ? "로그인하면 최근 12주 활동으로 실제 차트를 계산합니다. 비로그인 상태에서는 데모 데이터로 레시피 결과물을 미리 봅니다."
        : "When signed in, this chart uses your latest 12 weeks of activities. Signed-out riders see demo data that shows the recipe output.",
      empty: ko ? "아직 표시할 활동이 없습니다." : "No activities to chart yet.",
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
  const { weeklyStats } = useWeeklyStats();
  const copy = useMemo(() => buildCopy(i18n.language), [i18n.language]);
  const [tab, setTab] = useState<CreatorTab>("featured");
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
        status: localized.status,
      };
    });
  }, [i18n.language]);

  const visibleItems = items.filter((item) => {
    if (tab === "featured") return true;
    if (tab === "recipes") return true;
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

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(shareText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleCopyChart = async () => {
    await navigator.clipboard?.writeText(weeklyShareText);
    setChartCopied(true);
    window.setTimeout(() => setChartCopied(false), 1600);
  };

  const handleEmailRecipe = async (itemId: string) => {
    if (!user) {
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
    } catch {
      setEmailFailedItemIds((prev) => new Set(prev).add(itemId));
    } finally {
      setEmailSendingId(null);
    }
  };

  const handleGenerateDiary = async () => {
    if (!user) {
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
    } catch {
      setDiaryError(copy.credit.failed);
    } finally {
      setGenerating(false);
    }
  };

  const handleReportItem = async (itemId: string) => {
    if (!user) {
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
    } catch {
      setReportFailedItemIds((prev) => new Set(prev).add(itemId));
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
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/board/write" className={buttonClass({ variant: "primary", size: "sm" })}>
                <MessageSquareText size={15} aria-hidden />
                {copy.actions.post}
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setTab("recipes")}>
                <BookOpen size={15} />
                {copy.actions.recipe}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleGenerateDiary} loading={generating}>
              <Bot size={15} />
              {user ? (generating ? copy.actions.generating : copy.actions.generate) : copy.actions.loginNeeded}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {copy.stats.map((stat) => (
            <div key={stat.label} className="rounded-[var(--r-lg)] border p-3" style={{ background: "var(--bg-1)", borderColor: "var(--line)" }}>
              <Text as="div" variant="eyebrow">{stat.label}</Text>
              <div className="mt-1 text-[length:var(--fs-lg)] font-semibold" style={{ color: "var(--ink-0)" }}>{stat.value}</div>
            </div>
          ))}
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-md)]" style={{ background: "var(--bg-2)", color: kindTone[item.kind] }}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)" }}>{item.title}</h2>
                        <Chip>{item.status}</Chip>
                      </div>
                      <p className="mt-1 text-[length:var(--fs-sm)] leading-5" style={{ color: "var(--ink-3)" }}>{item.summary}</p>
                    </div>
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

                <div className="mt-4 grid gap-3 text-[length:var(--fs-xs)] sm:grid-cols-2" style={{ color: "var(--ink-3)" }}>
                  <div>
                    <Text as="div" variant="eyebrow">Scopes</Text>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.scopes.map((scope) => <code key={scope} className="rounded-[var(--r-sm)] px-1.5 py-0.5" style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{scope}</code>)}
                    </div>
                  </div>
                  <div>
                    <Text as="div" variant="eyebrow">Share</Text>
                    <div className="mt-1" style={{ color: "var(--ink-2)" }}>{item.shareMode}</div>
                  </div>
                </div>
                <div className="mt-3 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
                  <Text as="div" variant="eyebrow">{copy.card.delivery}</Text>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.channels.map((channel) => (
                      <code key={channel} className="rounded-[var(--r-sm)] px-1.5 py-0.5" style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>{channel}</code>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant={item.id === "ai-diary" ? "primary" : "secondary"} onClick={() => setTab("share")}>
                    <ShieldCheck size={15} />
                    {copy.actions.preview}
                  </Button>
                  <Button size="sm" variant="secondary" loading={emailSendingId === item.id} onClick={() => void handleEmailRecipe(item.id)}>
                    <Send size={15} />
                    {emailSendingId === item.id
                      ? copy.actions.emailing
                      : emailSentItemIds.has(item.id)
                        ? copy.actions.emailed
                        : emailFailedItemIds.has(item.id)
                          ? copy.actions.emailFailed
                          : copy.actions.emailRecipe}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTab("recipes")}>
                      <BookOpen size={15} />
                      {copy.actions.recipe}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleReportItem(item.id)}>
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
