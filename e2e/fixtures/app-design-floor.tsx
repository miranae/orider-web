// 합성 데이터 전용. 실제 Firebase 인증이나 사용자 기록을 읽지 않는다.
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import MobileFitnessPage, { type MobileFitnessData } from "../../src/components/mobile/MobileFitnessPage";
import MobilePlanContent from "../../src/features/training/plan/MobilePlanContent";
import { EmptyState } from "../../src/components/redesign";
import EmbeddedSurfaceState from "../../src/embedded/surfaces/EmbeddedSurfaceState";
import { APP_PARITY_THEME } from "../../src/theme/themes/appParityTheme";
import { COLOR_CSS_VARIABLES } from "../../src/theme/generated";
import type { PlanWeek } from "../../shared/types/goal";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono/400.css";
import "../../src/index.css";
import "../../src/theme/generated.css";
import "../../src/theme/components/components.css";
import "../../src/embedded/embedded.css";

const query = new URLSearchParams(location.search);
const locale = query.get("locale") === "en" ? "en" : "ko";
document.documentElement.lang = locale;
const mode = query.get("theme") === "light" ? "light" : "dark";
const surface = query.get("surface") === "plan" ? "plan" : "fitness";
const state = query.get("state") ?? "loaded";
const resources = import.meta.glob("../../src/i18n/resources/*/*.json", { eager: true, import: "default" });
const namespaces = Object.fromEntries(Object.entries(resources).filter(([path]) => path.includes(`/${locale}/`)).map(([path, value]) => [path.split("/").at(-1)!.replace(".json", ""), value]));
await i18next.init({ lng: locale, resources: { [locale]: namespaces }, interpolation: { escapeValue: false } });
document.documentElement.dataset.theme = mode;
const colors = APP_PARITY_THEME.scheme[mode].colors;
for (const [key, cssVar] of Object.entries(COLOR_CSS_VARIABLES)) document.documentElement.style.setProperty(cssVar, colors[key as keyof typeof colors]);
for (const [key, value] of Object.entries({ bg: colors.background, surface: colors.surface, "text-primary": colors.textPrimary, "text-secondary": colors.textSecondary, accent: colors.accent, "safe-top": "0px", "safe-bottom": "0px" })) document.documentElement.style.setProperty(`--orider-host-${key}`, value);
document.documentElement.style.setProperty("--lime", colors.accent);
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const todayMs = Date.parse(`${today}T00:00:00+09:00`);
const empty = state === "empty";
const data: MobileFitnessData = {
  ctl: empty ? 0 : 35, atl: empty ? 0 : 44.4, tsb: empty ? 0 : -9.4, today,
  pmcHistory: empty ? [] : Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.parse(`${today}T00:00:00Z`) - (59 - i) * 86400000).toISOString().slice(0, 10), ctl: 15 + i / 3, atl: 15 + i / 2, tsb: -i / 6 })),
  weeklyTSS: empty ? [] : [205, 309, 272, 351], thisWeekTSS: empty ? 0 : 351, avgWeekTSS: 284, restDays: 2,
  threshold: empty ? null : { label: "FTP", value: "245", unit: "W", sub: "" }, ftp: empty ? undefined : 245, weightKg: 70,
  hasLoadData: !empty, combinedLoad: null, loadFocus: null, cyclingAbility: null,
  runEvidence: { thresholdPaceSec: null, records: [] }, swimEvidence: { windowDays: 90, cssSecPer100m: null, swolfAvg: null, distancePerStrokeM: null, activityCount: 0 }, zones: [], zoneSource: "none", discipline: "bike",
};
if (state === "loaded-success") {
  data.thresholdDecision = { activeFtpW: 245, automaticCandidateW: 252, cpW: 258, recentTwentyMinuteW: 265, latestMonthlyEstimate: { period: "2026-09", ftpW: 252 }, tteMin: 42, activityCount: 18 };
  data.pdcSummary = { riderType: { type: "AllRounder", confidence: 0.9 }, abilityScore: 72, vo2maxEst: 58, activityCount: 18, weightKgSnapshot: 70, version: 6, provenanceVersion: 2, measuredPower: true };
  data.cyclingAbility = { windowDays: 90, confidence: "high", activityCount: 18, axes: [
    { key: "anaerobic", score: 68, confidence: "high", evidence: [{ duration: "1m", watts: 460, wPerKg: 6.57, percentile: 68 }] },
    { key: "aerobic", score: 76, confidence: "high", evidence: [{ duration: "5m", watts: 310, wPerKg: 4.43, percentile: 76 }] },
    { key: "endurance", score: 72, confidence: "high", evidence: [{ duration: "20m", watts: 265, wPerKg: 3.79, percentile: 72 }] },
  ] };
}
const week: PlanWeek = { id: "fixture-week", weekNumber: 4, phase: "build", startDate: todayMs, plannedTSS: 360,
  days: ["tempo", "rest", "ftp", "z2", "rec", "z2Long", "rest"].map((workout, i) => ({ date: todayMs + i * 86400000, dayOfWeek: ((i % 7) + 1) as 1, workout: workout as "tempo", plannedTSS: workout === "rest" ? 0 : 60, plannedDurationMin: workout === "rest" ? 0 : 75, completed: false, skipped: false })) };
const title = i18next.t(surface === "plan" ? "page.embeddedTitle" : "login.title", { ns: surface === "plan" ? "training" : "fitness" });
createRoot(document.getElementById("root")!).render(<I18nextProvider i18n={i18next}><BrowserRouter><main className={surface === "plan" ? "orider-embedded-surface orider-embedded-surface--plan" : "orider-embedded-surface"}>
  {state === "loading" || state === "error" ? <div className={surface === "plan" ? "orider-embedded-plan-state" : undefined}><EmbeddedSurfaceState title={title} loading={state === "loading"} onRetry={() => location.reload()} /></div> : surface === "fitness" ? <MobileFitnessPage embedded data={data} /> : empty ? <div className="embedded-plan-presentation"><h1 className="orider-embedded-page-title">{title}</h1><EmptyState compact actions={[{ label: i18next.t("button.retry", { ns: "common" }), variant: "primary", onClick: () => location.reload() }]} icon={i18next.t("disciplineIcon.bike", { ns: "training" })} title={i18next.t("page.planEmpty", { ns: "training", sportLabel: i18next.t("discipline.bike", { ns: "training" }) })} description={i18next.t("page.planEmptyEmbeddedDesc", { ns: "training", sportLabel: i18next.t("discipline.bike", { ns: "training" }) })} /></div> : <MobilePlanContent embedded currentWeek={week} weekLabel={locale === "ko" ? "이번 주" : "This week"} goalTitle={empty ? undefined : "2026_비앙키그란폰도춘천_그란폰도_122.91km"} daysLeft={24} progressPct={7} completedTSS={169} totalTSS={2595} projectedCTL={6} />}
</main></BrowserRouter></I18nextProvider>);
