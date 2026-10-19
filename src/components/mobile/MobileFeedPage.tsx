import SportIcon from "../common/SportIcon";
import HomeActivitySportIcon from "../common/HomeActivitySportIcon";
import { getHomeActivitySport } from "../../utils/homeActivitySport";
import GlossaryText from "../common/GlossaryText";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../../constants/appStoreLinks";
import { useEffect, useId, useRef, useState, useMemo, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useActivityAuthor } from "../../hooks/useActivityAuthor";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { Activity } from "@shared/types";
import Avatar from "../Avatar";
import ActivityAiSummary from "../activity/ActivityAiSummary";
import ActivitySocialFooter from "../activity/ActivitySocialFooter";
import { activityTimestampParts, toLocalDate } from "../../utils/dateUtils";
import { getDiscipline, getDisciplineIcon, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { Button, Card, IconButton, Input, Select, Text, buttonClass } from "../../theme/components";
import { useAuth } from "../../contexts/AuthContext";
import { isTrivialActivity } from "../../utils/activityFilter";
import { resolveDuration, resolveAvgSpeedKph, durationLabelBasis } from "../../utils/activityTime";
import { isImplausibleAvgSpeed, isImplausibleActivity } from "../../utils/activitySanity";
import type { ActivityFeedScope, useActivitySearch } from "../../hooks/useActivities";
import ActivityRouteThumbnail from "../activity/ActivityRouteThumbnail";
import type { DashboardDatePreset, DashboardSportFilter } from "../../hooks/useDashboardPreferences";
import { useLocale } from "../../contexts/LocaleContext";
import { formatDistance, formatElev, formatPace, formatSpeed } from "../../utils/units";
import { isImplausibleActivityHeartRate } from "../../utils/activitySanity";
import { isSignInCancelled } from "../../utils/signInCancelled";
import { useToast } from "../../contexts/ToastContext";
import "./MobileFeedPage.css";

const MOBILE_FEED_RENDER_STEP = 40;
const MOBILE_FEED_RENDER_INITIAL = 60;
type SportFilter = DashboardSportFilter;

interface SportBreakdownItem {
  key: SportFilter;
  label: string;
}

interface MobileFeedPageProps {
  activities: Activity[];
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  activitySearch?: ReturnType<typeof useActivitySearch>;
  showYearRecapBanner?: boolean;
  currentUserId?: string | null;
  friendIds?: string[];
  feedScope: ActivityFeedScope;
  onFeedScopeChange: (scope: ActivityFeedScope) => void;
  sportFilter?: SportFilter;
  onSportFilterChange?: (sportFilter: SportFilter) => void;
  datePreset?: DashboardDatePreset;
  onDatePresetChange?: (datePreset: DashboardDatePreset) => void;
  runningJourney?: ReactNode;
  notices?: ReactNode;
}

function formatDur(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function MobileFeedSkeleton() {
  return (
    <div aria-hidden="true" className="mobile-feed-skeleton">
      {[0, 1, 2].map((idx) => (
        <div key={idx} style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 16px" }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: "var(--space-3)" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--bg-3)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: 92, height: 12, borderRadius: "var(--r-sm)", background: "var(--bg-3)", marginBottom: "var(--space-1-5)" }} />
              <div style={{ width: 54, height: 10, borderRadius: "var(--r-sm)", background: "var(--bg-2)" }} />
            </div>
            <div style={{ width: 52, height: 22, borderRadius: "var(--r-sm)", background: "var(--bg-2)" }} />
          </div>
          <div style={{ width: "68%", height: 16, borderRadius: "var(--r-sm)", background: "var(--bg-3)", marginBottom: "var(--space-3)" }} />
          <div style={{ aspectRatio: "var(--feed-thumb-aspect)", margin: "0 -16px 12px", background: "var(--bg-2)" }} />
          <div className="mobile-feed-stats">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div style={{ width: 36, height: 9, borderRadius: "var(--r-sm)", background: "var(--bg-2)", marginBottom: "var(--space-1-5)" }} />
                <div style={{ width: 44, height: 14, borderRadius: "var(--r-sm)", background: "var(--bg-3)" }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileRouteThumbnail({ activity, priority = false }: { activity: Activity; priority?: boolean }) {
  if (!activity.thumbnailTrack) return null;

  return (
    <ActivityRouteThumbnail
      activityId={activity.id}
      userId={activity.userId}
      polyline={activity.thumbnailTrack}
      mapImageUrl={activity.mapImageUrl}
      visibility={activity.visibility}
      contentRevision={activity.contentRevision}
      contentSelectedRevision={activity.contentSelectedRevision}
      priority={priority}
      layout="mobile"
    />
  );
}

/** 시안과 일치하는 컴팩트 모바일 활동 카드 */
export function CompactActivityCard({ activity, priority = false }: { activity: Activity; priority?: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const localDay = toLocalDate(Date.now());
  const timestamp = useMemo(() => activityTimestampParts(activity.startTime, i18n.language, new Date(`${localDay}T12:00:00`).getTime()), [activity.startTime, i18n.language, localDay]);
  const occurredAt = timestamp ? timestamp.day === "date" ? `${timestamp.date} ${timestamp.time}` : t(`mobileFeed.occurred.${timestamp.day}`, { time: timestamp.time }) : t("mobileFeed.occurred.unknown");
  const device = activity.sourceMeta?.deviceModel?.trim();
  const s = activity.summary;
  const { units } = useLocale();
  const { t: tActivity } = useTranslation("activity");

  const distance = formatDistance(s.distance, units);
  // #236: 정지 큰 활동은 이동시간 우선 (상세·데스크톱 카드와 동일 정책 — resolveDuration 공유).
  const sd = resolveDuration({ ...s, startTime: activity.startTime, endTime: activity.endTime });
  const dur = formatDur(sd.displayMs);
  const elev = formatElev(s.elevationGain, units);
  // 평균 속도도 시간 기준과 일치 — 전환 시 거리/이동시간, 아니면 거리/경과 (#236 후속).
  const elapsedSpd = s.distance > 0 && s.ridingTimeMillis > 0
    ? (s.distance / 1000) / (s.ridingTimeMillis / 3600000)
    : 0;
  const spdNum = resolveAvgSpeedKph(s.distance, sd, elapsedSpd);
  const nickname = useActivityAuthor(activity).nickname ?? t("mobileFeed.defaultRider");
  const discipline = getDiscipline(activity.type);
  const activitySport = getHomeActivitySport(activity);
  const activitySportLabel = activitySport === "mtb" ? t("common:sport.mtb")
    : activitySport === "trekking" ? t("common:sport.hike")
    : activitySport === "indoor-bike" ? `${t("common:sport.indoor")} ${t(getDisciplineLabelKey("bike"))}`
    : t(getDisciplineLabelKey(discipline));
  // 비현실 속도(GPS noise/오등록) 가드 — 광고 유입자 첫인상 신뢰성 보호.
  const spdImplausible = isImplausibleAvgSpeed(spdNum, discipline ?? undefined);
  const spd = spdNum > 0 && !spdImplausible ? formatSpeed(spdNum / 3.6, units, "bike") : "—";
  const pace = spdNum > 0 && !spdImplausible ? formatPace(3600 / spdNum, units) : "—";
  const heartRate = s.averageHeartRate;
  const hasHr = heartRate != null && heartRate > 0 && !isImplausibleActivityHeartRate(heartRate);
  const showDataWarning = isImplausibleActivity({
    distanceM: s.distance,
    durationMs: s.ridingTimeMillis,
    avgKph: spdNum,
    maxKph: s.maxSpeed,
    discipline: discipline ?? undefined,
  });

  return (
    <div data-testid="H1-2-1" className="mobile-feed-card" style={{ borderBottom: "1px solid var(--line-soft)", padding: "var(--space-3) var(--space-4)", position: "relative" }}>
      <Link
        to={`/activity/${activity.id}`}
        aria-label={activity.description || t("mobileFeed.defaultActivity")}
        className="absolute inset-0 rounded-[var(--r-md)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lime)]"
        style={{ zIndex: 1 }}
      />
      {/* 작성자와 활동 제목은 같은 시작선, 종목은 아바타 아래에 표시한다. */}
      <div className="mobile-feed-card-header">
        <span className="mobile-feed-card-avatar"><Avatar userId={activity.userId} name={nickname} imageUrl={activity.profileImage} size={40} /></span>
        <div className="mobile-feed-card-identity">
          <Text as="div" variant="bodySmall" weight={600} tone="primary" style={{ overflowWrap: "anywhere" }}>{nickname}</Text>
          <Text as="div" variant="caption" tone="tertiary" className="mobile-feed-activity-metadata"><time dateTime={timestamp?.iso}>{occurredAt}</time>{device && <span>{`·\u00a0${device}`}</span>}</Text>
        </div>
        <span className="mobile-feed-card-sport" role="img" aria-label={activitySportLabel}>
          {activitySport ? <HomeActivitySportIcon sport={activitySport} size={40} /> : getDisciplineIcon(null)}
        </span>
        <Text as="h3" variant="subtitle" weight={600} tone="primary" className="mobile-feed-activity-title">
          {activity.description || t("mobileFeed.defaultActivity")}
        </Text>
        {showDataWarning && (
          <span
            title={t("mobileFeed.dataWarningTooltip")}
            className="mobile-feed-card-warning text-[length:var(--fs-xs)]"
            style={{
              padding: "3px 6px", borderRadius: "var(--r-sm)",
              fontWeight: 600, color: "var(--ink-1)",
              background: "var(--bg-3)", border: "1px solid var(--amber)",
            }}
          >
            {t("mobileFeed.dataWarningBadge")}
          </span>
        )}
      </div>

      {/* AI 요약 — 생성된 활동에만 (비정규화 aiSummaryPreview ko/en). 카드 자체 패딩(16) 안이라 inset=false */}
      {(activity.aiSummaryPreview || activity.aiSummaryPreview_en) &&
        <ActivityAiSummary summary={activity.aiSummaryPreview} summaryEn={activity.aiSummaryPreview_en} inset={false} />}

      {/* Map thumbnail — 카드 콘텐츠 padding(16) 음수마진으로 상쇄해 화면 전폭.
          비율은 데스크톱(ActivityCard)과 동일하게 토큰 --feed-thumb-aspect(index.css 단일
          진실원, 현재 2.8:1) 사용 — 옛 고정높이(156px)는 기기 폭에 따라 비율이 들쭉날쭉
          (2.3~3:1)했다. aspectRatio 로 모든 기기에서 데스크톱과 동일 프레임 보장. */}
      <MobileRouteThumbnail activity={activity} priority={priority} />

      {/* 지표의 의미는 유지하고 좁은 화면에서 두 열로 읽는다. */}
      <div className={`mobile-feed-stats${discipline === "run" ? " mobile-feed-stats--run" : ""}`} data-testid={discipline === "run" ? "run-card-primary" : undefined}>
        {(discipline === "run" ? [
          { v: distance, u: "", l: t("mobileFeed.statDistance") },
          { v: pace, u: "", l: tActivity("stat.avgPace") },
          { v: dur, u: "", l: t(`homeMetrics.${durationLabelBasis({ ...s, startTime: activity.startTime, endTime: activity.endTime }, sd.usingMoving)}`) },
        ] : [
          { v: distance, u: "", l: t("mobileFeed.statDistance") },
          { v: dur, u: "", l: t(`homeMetrics.${durationLabelBasis({ ...s, startTime: activity.startTime, endTime: activity.endTime }, sd.usingMoving)}`) },
          { v: elev, u: "", l: t("mobileFeed.statElev") },
          { v: spd, u: "", l: t("mobileFeed.statSpeed") },
        ]).map((stat) => (
          <div key={stat.l} className="mobile-feed-stat">
            <Text as="div" variant="caption" tone="tertiary" style={{ position: "relative", zIndex: 2 }}><GlossaryText>{stat.l}</GlossaryText></Text>
            <Text as="div" variant="dataSmall" mono tone="primary">{stat.v}{stat.u && ` ${stat.u}`}</Text>
          </div>
        ))}
      </div>

      {discipline === "run" && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }} data-testid="run-card-secondary">
          {hasHr && <span style={{ position: "relative", zIndex: 2 }}>{t("homeMetrics.avgHeartRate")} · {Math.round(heartRate)} <GlossaryText>{"bpm"}</GlossaryText></span>}
          <span style={{ position: "relative", zIndex: 2 }}><GlossaryText>{t("mobileFeed.statElev")}</GlossaryText> · {elev}</span>
          {(s.averagePower ?? activity.avgPower ?? 0) > 0 && <span style={{ position: "relative", zIndex: 2 }}><GlossaryText>{tActivity("stat.runningPower")}</GlossaryText> · {Math.round(s.averagePower ?? activity.avgPower ?? 0)} <GlossaryText>{"W"}</GlossaryText></span>}
        </div>
      )}

      {/* 스트라바형 소셜 푸터 — 좋아요(아바타 스택)+댓글. 카드 패딩(16) 음수마진으로 상쇄해
          전폭 상단 구분선, 내부는 footer 자체 px-4 로 콘텐츠와 정렬 (지도 썸네일과 동일 기법). */}
      <div style={{ margin: "10px -16px 0", position: "relative", zIndex: 2 }}>
        <ActivitySocialFooter activity={activity} />
      </div>
    </div>
  );
}

export default function MobileFeedPage({
  activities, loading, error = false, onRetry, hasMore, loadingMore, onLoadMore, showYearRecapBanner = false, currentUserId = null, friendIds = [],
  activitySearch,
  feedScope, onFeedScopeChange,
  sportFilter: controlledSportFilter,
  onSportFilterChange,
  datePreset: controlledDatePreset,
  onDatePresetChange,
  runningJourney,
  notices,
}: MobileFeedPageProps) {
  const { t } = useTranslation("dashboard");
  const { user, signIn } = useAuth();
  const { showToast } = useToast();
  const [signInPending, setSignInPending] = useState(false);
  const [localSportFilter, setLocalSportFilter] = useState<SportFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const searchActive = activitySearch?.active ?? false;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const searchId = useId();
  useEffect(() => { if (filtersOpen) searchInput.current?.focus(); }, [filtersOpen]);
  const closeFilters = () => {
    setFiltersOpen(false);
    filterTrigger.current?.focus();
  };
  const [localDatePreset, setLocalDatePreset] = useState<DashboardDatePreset>("all");
  const sportFilter = controlledSportFilter ?? localSportFilter;
  const datePreset = controlledDatePreset ?? localDatePreset;
  const setSportFilter = onSportFilterChange ?? setLocalSportFilter;
  const setDatePreset = onDatePresetChange ?? setLocalDatePreset;
  const [renderLimit, setRenderLimit] = useState(MOBILE_FEED_RENDER_INITIAL);
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const signedIn = !!user && !user.isAnonymous;
  const effectiveFeedScope = signedIn ? feedScope : "all";
  const activeFilterCount = Number(effectiveFeedScope !== "all") + Number(datePreset !== "all");
  const hasActiveSearchFilters = effectiveFeedScope !== "all" || datePreset !== "all";
  const activeFilterDescription = [
    searchActive ? t("mobileFeed.searchContext", { query: activitySearch!.searchedKeyword }) : null,
    sportFilter !== "all" ? t(getDisciplineLabelKey(sportFilter)) : null,
    effectiveFeedScope !== "all" ? t(`feed.filter.${effectiveFeedScope}`) : null,
    datePreset !== "all" ? t(`feed.datePreset.${datePreset}`) : null,
  ].filter(Boolean).join(" · ");

  const feedSportOptions: SportBreakdownItem[] = [
    { key: "all", label: t("common:label.all") },
    { key: "bike", label: t(getDisciplineLabelKey("bike")) },
    { key: "run", label: t(getDisciplineLabelKey("run")) },
    { key: "swim", label: t(getDisciplineLabelKey("swim")) },
  ];

  // 측정 오류 trivial 활동(거리<100m 또는 시간<60s) 항상 숨김.
  const sourceActivities = searchActive ? (() => {
    const keyword = activitySearch!.searchedKeyword.toLowerCase();
    const merged = new Map(activitySearch!.allResults.map((activity) => [activity.id, activity]));
    for (const activity of activities) {
      if (`${activity.description ?? ""} ${activity.nickname ?? ""} ${activity.type ?? ""}`.toLowerCase().includes(keyword)) {
        merged.set(activity.id, activity);
      }
    }
    return [...merged.values()].sort((a, b) => b.startTime - a.startTime);
  })() : activities;
  const visibleActivities = sourceActivities.filter((a) => !isTrivialActivity(a));
  const filteredBySport = sportFilter === "all" ? visibleActivities : visibleActivities.filter(a => getDiscipline(a.type) === sportFilter);
  const filteredByScope = filteredBySport.filter((a) => {
    if (effectiveFeedScope === "friends") return a.userId === currentUserId || friendIdSet.has(a.userId);
    if (effectiveFeedScope === "self") return currentUserId != null && a.userId === currentUserId;
    return true;
  });
  const cutoff = datePreset === "all"
    ? 0
    : Date.now() - (datePreset === "7d" ? 7 : datePreset === "30d" ? 30 : 90) * 86400000;
  const filteredByDate = cutoff > 0 ? filteredByScope.filter((a) => a.startTime >= cutoff) : filteredByScope;
  const filteredActivities = filteredByDate;
  const renderedActivities = filteredActivities.slice(0, renderLimit);
  const hasHiddenLocalItems = filteredActivities.length > renderedActivities.length;
  const supportingCards = (
    <>
      {notices && <div className="mobile-feed-notices">{notices}</div>}
      {showYearRecapBanner && (
        <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}>
          <Card padding="none" style={{ padding: "var(--space-4)", borderColor: "var(--lime)" }}>
            <Text variant="eyebrow" tone="secondary">{t("yearRecap.eyebrow")}</Text>
            <Text as="h2" variant="subtitle" weight={700} style={{ display: "block", marginTop: "var(--space-1)", color: "var(--ink-0)" }}>{t("yearRecap.title")}</Text>
            <Text variant="bodySmall" tone="tertiary" style={{ display: "block", marginTop: "var(--space-1)", marginBottom: "var(--space-3)" }}><GlossaryText>{t("yearRecap.desc")}</GlossaryText></Text>
            <Link to="/athlete/me/records" className={buttonClass({ variant: "primary", size: "sm", block: true })} style={{ textDecoration: "none" }}>{t("yearRecap.cta")}</Link>
          </Card>
        </div>
      )}
    </>
  );

  return (
    <div className="dashboard-home" data-testid="H1-2" style={{ overscrollBehavior: "contain" }}>
      <Text as="h1" className="sr-only">{t("mobileFeed.homeTitle")}</Text>
      {!signedIn && <header className="mobile-feed-heading">
        <div className="mobile-feed-guest-context">
          <Text as="p" variant="bodySmall" tone="tertiary">{t("mobileFeed.publicDescription")}</Text>
          <Button variant="secondary" loading={signInPending} onClick={async () => {
            if (signInPending) return;
            setSignInPending(true);
            try { await signIn(); }
            catch (error) { if (!isSignInCancelled(error)) showToast(t("common:auth.loginFailed"), "error"); }
            finally { setSignInPending(false); }
          }}>{t("common:button.login")}</Button>
        </div>
      </header>}
      <div className="mobile-feed-feed-heading">
        <Text as="h2" variant="subtitle" tone="primary">{t(signedIn ? "mobileFeed.feedTitle" : "mobileFeed.publicTitle")}</Text>
          <IconButton ref={filterTrigger}
            variant={activeFilterCount > 0 ? "primary" : "secondary"}
            size="lg"
            aria-expanded={filtersOpen}
            aria-controls={filtersOpen ? searchId : undefined}
            aria-label={`${t("mobileFeed.filterToggle")}${activeFilterDescription ? `: ${activeFilterDescription}` : ""}`}
            onClick={() => { if (filtersOpen) closeFilters(); else setFiltersOpen(true); }}
            icon={<SlidersHorizontal size={18} />}
          />
      </div>

      {(filtersOpen || activeFilterDescription) && <div style={{ borderBottom: "1px solid var(--line-soft)", padding: "var(--space-2) var(--space-4)" }}>
        {filtersOpen && <div id={searchId} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeFilters(); } }}>
          <form className={`mobile-feed-filter-row${!signedIn ? " mobile-feed-filter-row--public" : ""}${!activitySearch ? " mobile-feed-filter-row--no-search" : ""}`} onSubmit={event => {
            event.preventDefault();
            const keyword = String(new FormData(event.currentTarget).get("query") ?? searchQuery).trim();
            if (!keyword || !activitySearch) return;
            setDatePreset("all");
            activitySearch.search(keyword);
            setRenderLimit(MOBILE_FEED_RENDER_INITIAL);
          }}>
            {activitySearch && <Input id={`${searchId}-query`} ref={searchInput} name="query" enterKeyHint="search" value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                onCompositionEnd={event => setSearchQuery(event.currentTarget.value)}
                placeholder={t("feed.search.placeholder")} aria-label={t("feed.search.placeholder")}
                endAction={<IconButton type="submit" variant="ghost" aria-label={t("feed.search.submit")} disabled={!searchQuery.trim()} icon={<Search size={18} />} />} />}
          {signedIn && <Select variant="filter" id="mobile-feed-scope"
              data-testid="H1-1-1" value={feedScope}
              onChange={(event) => onFeedScopeChange(event.target.value as ActivityFeedScope)}
              aria-label={t("feed.filter.label")}
            >
              <option value="all">{t("mobileFeed.inlineFilters.scopeAll")}</option>
              <option value="friends">{t("mobileFeed.inlineFilters.scopeFriends")}</option>
              <option value="self">{t("mobileFeed.inlineFilters.scopeSelf")}</option>
            </Select>}

            <Select variant="filter" id="mobile-feed-date"
              value={datePreset}
              onChange={(event) => {
                const nextPreset = event.target.value as DashboardDatePreset;
                setDatePreset(nextPreset);
                if (searchActive) activitySearch?.setDatePreset(nextPreset);
              }}
              aria-label={t("feed.datePreset.label")}
            >
              <option value="all">{t("mobileFeed.inlineFilters.dateAll")}</option>
              <option value="7d">{t("mobileFeed.inlineFilters.date7d")}</option>
              <option value="30d">{t("mobileFeed.inlineFilters.date30d")}</option>
              <option value="90d">{t("mobileFeed.inlineFilters.date90d")}</option>
            </Select>
            <Select variant="filter" id={`${searchId}-sport`} value={sportFilter} onChange={event => setSportFilter(event.target.value as SportFilter)} aria-label={t("mobileFeed.sportFilterLabel")}>
                {feedSportOptions.map(option => <option key={option.key} value={option.key}>{t(`mobileFeed.inlineFilters.sport.${option.key}`)}</option>)}
            </Select>
          </form>
          {searchActive && <Button variant="ghost" size="sm" onClick={() => {
            setSearchQuery("");
            activitySearch!.reset();
            setRenderLimit(MOBILE_FEED_RENDER_INITIAL);
          }}>{t("feed.search.reset")}</Button>}
        </div>}
        {activeFilterDescription && <Text as="p" variant="caption" tone="tertiary" className="mobile-feed-active-filters">{activeFilterDescription}</Text>}
      </div>}

      {signedIn && sportFilter === "run" && runningJourney && (
        <div data-testid="mobile-owner-running-journey" className="space-y-3">{runningJourney}</div>
      )}

      {/* 활동 피드 */}
      {(searchActive ? activitySearch!.loading : loading) && (
        <MobileFeedSkeleton />
      )}

      {!searchActive && !loading && error && (
        <div role="alert" style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: "var(--space-2)" }}>{t(activities.length > 0 ? "feed.partialError.title" : "feed.error.title")}</div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)", marginBottom: "var(--space-4)" }}>{t(activities.length > 0 ? "feed.partialError.description" : "feed.error.description")}</div>
          {onRetry && <Button variant="primary" onClick={onRetry}>{t(activities.length > 0 ? "feed.partialError.retry" : "feed.error.retry")}</Button>}
        </div>
      )}

      {searchActive && !activitySearch!.loading && activitySearch!.error && (
        <div role="alert" style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <div style={{ fontSize: "var(--fs-sm)", marginBottom: "var(--space-4)" }}>{t(filteredActivities.length > 0 ? "feed.partialError.title" : "feed.error.title")}</div>
          <Button variant="primary" onClick={activitySearch!.retry}>{t("feed.error.retry")}</Button>
        </div>
      )}

      {!(searchActive ? activitySearch!.loading || activitySearch!.error : loading || error) && filteredActivities.length === 0 && (
        <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <div aria-hidden="true" style={{ fontSize: "var(--fs-4xl)", marginBottom: 'var(--space-3)' }}>{sportFilter === "all" ? getDisciplineIcon(null) : <SportIcon sport={sportFilter} size={32} style={{ margin: "0 auto" }} />}</div>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{searchActive && activitySearch!.hasMoreServerResults ? t("feed.search.morePossibleTitle") : searchActive ? t("feed.search.emptyTitle") : activities.length > 0 ? t("feed.noMatches.title") : t("mobileFeed.emptyTitle")}</div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>{searchActive && activitySearch!.hasMoreServerResults ? t("feed.search.morePossibleDescription") : searchActive ? t("feed.search.emptyDescription") : activities.length > 0 ? t("feed.noMatches.description") : t("mobileFeed.emptyDesc")}</div>
          {signedIn && !searchActive && activities.length === 0 && <div className="flex gap-3 mt-3"><a href={ORIDER_PLAY_STORE_URL}>Google Play</a><a href={ORIDER_APP_STORE_URL}>App Store</a><Link to="/athlete/me/activities?import=1">{t("todayStrip.importHistory")}</Link></div>}
          {!searchActive && activities.length > 0 && <Button variant="secondary" onClick={() => setFiltersOpen(true)} style={{ marginTop: "var(--space-3)" }}>{t("mobileFeed.filterToggle")}</Button>}
          {searchActive && hasActiveSearchFilters && <Button variant="secondary" onClick={() => {
            onFeedScopeChange("all");
            setDatePreset("all");
            activitySearch!.setDatePreset("all");
          }} style={{ marginTop: "var(--space-3)" }}>{t("feed.search.resetScopeDates")}</Button>}
        </div>
      )}
      <div>
        {!(searchActive ? activitySearch!.loading : loading) && renderedActivities[0] && <CompactActivityCard key={renderedActivities[0].id} activity={renderedActivities[0]} priority />}
        <div hidden={searchActive ? activitySearch!.loading : loading}>{supportingCards}</div>
        {!(searchActive ? activitySearch!.loading : loading) && renderedActivities.slice(1).map((activity, index) => <CompactActivityCard key={activity.id} activity={activity} priority={index < 1} />)}
      </div>

      {!(searchActive ? activitySearch!.loading || activitySearch!.error : loading || error) && (hasHiddenLocalItems || (searchActive ? activitySearch!.hasMoreServerResults : hasMore)) && (
        <div style={{ padding: "var(--space-3) var(--space-4)" }}>
          <Button data-testid="H1-2-3" variant="secondary" size="lg"
            onClick={() => {
              if (hasHiddenLocalItems) {
                setRenderLimit((value) => value + MOBILE_FEED_RENDER_STEP);
              } else if (searchActive) {
                activitySearch!.loadMoreServer();
              } else {
                onLoadMore();
              }
            }}
            disabled={!searchActive && loadingMore}
            style={{ width: "100%" }}
          >
            {!searchActive && loadingMore ? t("mobileFeed.loadingMore") : t("mobileFeed.loadMore")}
          </Button>
        </div>
      )}

    </div>
  );
}
