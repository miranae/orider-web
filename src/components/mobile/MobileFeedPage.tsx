import { lazy, Suspense, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import type { Activity } from "@shared/types";
import Avatar from "../Avatar";
import ActivityAiSummary from "../activity/ActivityAiSummary";
import ActivitySocialFooter from "../activity/ActivitySocialFooter";
import { timeAgo } from "../../utils/timeAgo";
import { getDiscipline, getDisciplineColor, getDisciplineIcon, getDisciplineTag } from "../../utils/disciplineFilter";
import { Button, Card, Text } from "../../theme/components";
import { useAuth } from "../../contexts/AuthContext";
import { isTrivialActivity } from "../../utils/activityFilter";
import { resolveDuration, resolveAvgSpeedKph } from "../../utils/activityTime";
import { isImplausibleAvgSpeed, isImplausibleActivity } from "../../utils/activitySanity";
import type { ConsistencyStreakSummary } from "../../utils/consistencyStreak";
import type { ActivityFeedScope } from "../../hooks/useActivities";

const TodaysWorkoutCard = lazy(() => import("../training/TodaysWorkoutCard"));
const ConsistencyStreakCard = lazy(() => import("../training/ConsistencyStreakCard"));
const RouteMap = lazy(() => import("../RouteMap"));
const MOBILE_FEED_RENDER_STEP = 40;
const MOBILE_FEED_RENDER_INITIAL = 60;
type SportFilter = "all" | "bike" | "run" | "swim";

interface SportBreakdownItem {
  key: SportFilter;
  label: string;
  value: string;
  unit: string;
  color: string;
}

interface MobileFeedPageProps {
  activities: Activity[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  showYearRecapBanner?: boolean;
  consistencyStreak?: ConsistencyStreakSummary | null;
  currentUserId?: string | null;
  friendIds?: string[];
  feedScope: ActivityFeedScope;
  onFeedScopeChange: (scope: ActivityFeedScope) => void;
}

function SportSummaryFilter({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: SportBreakdownItem[];
  value: SportFilter;
  onChange: (value: SportFilter) => void;
  ariaLabel: string;
}) {
  return (
    <Card
      padding="none"
      role="group"
      aria-label={ariaLabel}
      className="grid grid-cols-4 overflow-hidden"
      style={{ margin: "0 -16px", padding: 0, borderRadius: 0, borderLeft: "none", borderRight: "none" }}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          aria-label={item.label}
          aria-pressed={value === item.key}
          onClick={() => onChange(item.key)}
          style={{
            minWidth: 0,
            minHeight: 64,
            padding: "10px 2px",
            textAlign: "center",
            border: "none",
            borderRight: index < items.length - 1 ? "1px solid var(--line-soft)" : "none",
            background: value === item.key ? "var(--bg-3)" : "transparent",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: value === item.key ? item.color : "var(--ink-4)", marginBottom: 'var(--space-1)', overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </div>
          <Text as="div" variant="num" style={{ fontSize: "var(--fs-lg)", color: item.color, lineHeight: 1 }}>
            {item.value}<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: "var(--space-0-5)" }}>{item.unit}</span>
          </Text>
        </button>
      ))}
    </Card>
  );
}

function formatDur(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function MobileFeedSkeleton() {
  return (
    <div aria-hidden="true">
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
          <div className="grid grid-cols-4 gap-3">
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
  if (activity.mapImageUrl) {
    return (
      <div style={{ aspectRatio: "var(--feed-thumb-aspect)", margin: "0 -16px 10px", overflow: "hidden" }}>
        <img
          src={activity.mapImageUrl}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  if (!activity.thumbnailTrack) return null;

  return (
    <div style={{ aspectRatio: "var(--feed-thumb-aspect)", margin: "0 -16px 10px", overflow: "hidden", background: "var(--bg-2)" }}>
      <Suspense fallback={<div style={{ width: "100%", height: "100%", background: "var(--bg-2)" }} />}>
        <RouteMap
          polyline={activity.thumbnailTrack}
          height="w-full h-full"
          interactive={false}
          rounded={false}
          fitPadding={16}
        />
      </Suspense>
    </div>
  );
}

/** 시안과 일치하는 컴팩트 모바일 활동 카드 */
function CompactActivityCard({ activity, priority = false }: { activity: Activity; priority?: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation("dashboard");
  const s = activity.summary;

  const distKm = (s.distance / 1000).toFixed(1);
  // #236: 정지 큰 활동은 이동시간 우선 (상세·데스크톱 카드와 동일 정책 — resolveDuration 공유).
  const sd = resolveDuration({ ...s, startTime: activity.startTime, endTime: activity.endTime });
  const dur = formatDur(sd.displayMs);
  const elev = Math.round(s.elevationGain).toLocaleString();
  // 평균 속도도 시간 기준과 일치 — 전환 시 거리/이동시간, 아니면 거리/경과 (#236 후속).
  const elapsedSpd = s.distance > 0 && s.ridingTimeMillis > 0
    ? (s.distance / 1000) / (s.ridingTimeMillis / 3600000)
    : 0;
  const spdNum = resolveAvgSpeedKph(s.distance, sd, elapsedSpd);
  const nickname = activity.nickname || t("mobileFeed.defaultRider");
  const discipline = getDiscipline(activity.type);
  // 비현실 속도(GPS noise/오등록) 가드 — 광고 유입자 첫인상 신뢰성 보호.
  const spdImplausible = isImplausibleAvgSpeed(spdNum, discipline);
  const spd = spdNum > 0 ? (spdImplausible ? "—" : spdNum.toFixed(1)) : "0";
  const showDataWarning = isImplausibleActivity({
    distanceM: s.distance,
    durationMs: s.ridingTimeMillis,
    avgKph: spdNum,
    maxKph: s.maxSpeed,
    discipline,
  });
  const sColor = getDisciplineColor(discipline);
  const sIcon = getDisciplineIcon(discipline);
  const sTag = getDisciplineTag(discipline);

  return (
    <div
      onClick={() => navigate(`/activity/${activity.id}`)}
      style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 16px", cursor: "pointer" }}
    >
      {/* Header: avatar + name/time + sport badge */}
      <div className="flex items-center gap-2.5" style={{ marginBottom: "var(--space-2)" }}>
        <Avatar userId={activity.userId} name={nickname} imageUrl={activity.profileImage} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{nickname}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 1 }}>{timeAgo(activity.startTime, t)}</div>
        </div>
        <span style={{
          padding: "3px 7px", borderRadius: "var(--r-sm)", fontSize: "var(--fs-xs)",
          fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
          display: "flex", alignItems: "center", gap: "var(--space-1)",
          background: `color-mix(in oklch, ${sColor} 14%, var(--bg-2))`,
          color: sColor,
          border: `1px solid color-mix(in oklch, ${sColor} 30%, transparent)`,
        }}>
          {sIcon} {sTag}
        </span>
        {showDataWarning && (
          <span
            title={t("mobileFeed.dataWarningTooltip")}
            className="text-[length:var(--fs-xs)]"
            style={{
              padding: "3px 6px", borderRadius: "var(--r-sm)",
              fontWeight: 600, color: "var(--amber)",
              background: "var(--bg-3)", border: "1px solid var(--amber)",
            }}
          >
            {t("mobileFeed.dataWarningBadge")}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: "var(--space-2)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
        {activity.description || t("mobileFeed.defaultActivity")}
      </div>

      {/* AI 요약 — 생성된 활동에만 (비정규화 aiSummaryPreview ko/en). 카드 자체 패딩(16) 안이라 inset=false */}
      {(activity.aiSummaryPreview || activity.aiSummaryPreview_en) &&
        <ActivityAiSummary summary={activity.aiSummaryPreview} summaryEn={activity.aiSummaryPreview_en} inset={false} />}

      {/* Map thumbnail — 카드 콘텐츠 padding(16) 음수마진으로 상쇄해 화면 전폭.
          비율은 데스크톱(ActivityCard)과 동일하게 토큰 --feed-thumb-aspect(index.css 단일
          진실원, 현재 2.8:1) 사용 — 옛 고정높이(156px)는 기기 폭에 따라 비율이 들쭉날쭉
          (2.3~3:1)했다. aspectRatio 로 모든 기기에서 데스크톱과 동일 프레임 보장. */}
      <MobileRouteThumbnail activity={activity} priority={priority} />

      {/* 4-col stats */}
      <div className="flex">
        {[
          { v: distKm, u: "km", l: t("mobileFeed.statDistance") },
          { v: dur, u: "", l: t("mobileFeed.statTime") },
          { v: elev, u: "m", l: t("mobileFeed.statElev") },
          { v: spd, u: "km/h", l: t("mobileFeed.statSpeed") },
        ].map((stat, i) => (
          <div key={stat.l} style={{ flex: 1, borderLeft: i > 0 ? "1px solid var(--line-soft)" : "none", paddingLeft: i > 0 ? 12 : 0 }}>
            {/* 라벨 위 / 값 아래 — ActivityCard 와 동일 세로 스택 (가독성) */}
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: "var(--space-0-5)" }}>{stat.l}</div>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.02em", lineHeight: 1 }}>{stat.v}</span>
              {stat.u && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}> {stat.u}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 스트라바형 소셜 푸터 — 좋아요(아바타 스택)+댓글. 카드 패딩(16) 음수마진으로 상쇄해
          전폭 상단 구분선, 내부는 footer 자체 px-4 로 콘텐츠와 정렬 (지도 썸네일과 동일 기법). */}
      <div style={{ margin: "10px -16px 0" }}>
        <ActivitySocialFooter activity={activity} />
      </div>
    </div>
  );
}

export default function MobileFeedPage({
  activities, loading, hasMore, loadingMore, onLoadMore, showYearRecapBanner = false, consistencyStreak = null, currentUserId = null, friendIds = [],
  feedScope, onFeedScopeChange,
}: MobileFeedPageProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<"all" | "7d" | "30d" | "90d">("all");
  const [renderLimit, setRenderLimit] = useState(MOBILE_FEED_RENDER_INITIAL);
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);

  const sportBreakdown = useMemo<SportBreakdownItem[]>(() => {
    const bike = activities.filter(a => getDiscipline(a.type) === "bike");
    const run = activities.filter(a => getDiscipline(a.type) === "run");
    const swim = activities.filter(a => getDiscipline(a.type) === "swim");
    return [
      { key: "all" as const, label: t("common:label.all"), value: t("feed.countSuffix", { value: activities.length }), unit: "", color: "var(--ink-0)" },
      { key: "bike" as const, label: t("common:sportFilter.bike"), value: Math.round(bike.reduce((s, a) => s + a.summary.distance / 1000, 0)).toLocaleString(), unit: "km", color: "var(--aqua)" },
      { key: "run" as const, label: t("common:sportFilter.run"), value: Math.round(run.reduce((s, a) => s + a.summary.distance / 1000, 0)).toLocaleString(), unit: "km", color: "var(--amber)" },
      { key: "swim" as const, label: t("common:sportFilter.swim"), value: Math.round(swim.reduce((s, a) => s + a.summary.distance, 0)).toLocaleString(), unit: "m", color: "var(--lime)" },
    ];
  }, [activities, t]);

  // 측정 오류 trivial 활동(거리<100m 또는 시간<60s) 항상 숨김.
  const visibleActivities = activities.filter((a) => !isTrivialActivity(a));
  const filteredBySport = sportFilter === "all" ? visibleActivities
    : visibleActivities.filter(a => getDiscipline(a.type) === sportFilter);
  const filteredByScope = filteredBySport.filter((a) => {
    if (feedScope === "friends") return friendIdSet.has(a.userId);
    if (feedScope === "self") return currentUserId != null && a.userId === currentUserId;
    return true;
  });
  const cutoff = datePreset === "all"
    ? 0
    : Date.now() - (datePreset === "7d" ? 7 : datePreset === "30d" ? 30 : 90) * 86400000;
  const filteredByDate = cutoff > 0 ? filteredByScope.filter((a) => a.startTime >= cutoff) : filteredByScope;
  const q = searchQuery.trim().toLowerCase();
  const filteredActivities = q
    ? filteredByDate.filter((a) => `${a.description ?? ""} ${a.nickname ?? ""} ${a.type ?? ""}`.toLowerCase().includes(q))
    : filteredByDate;
  const renderedActivities = filteredActivities.slice(0, renderLimit);
  const hasHiddenLocalItems = filteredActivities.length > renderedActivities.length;

  return (
    <div style={{ overscrollBehavior: "contain" }}>
      {/* 오늘의 워크아웃 — 첫 화면 최상단: 오늘 행동 → 핵심 수치 → 추이 → 피드 순서.
          모바일은 '오늘의 결론 + CTA' 압축형 (#401). 상세 해설은 /fitness·/plan 에서. */}
      {user && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <Suspense fallback={null}>
            <TodaysWorkoutCard variant="compact" />
          </Suspense>
        </div>
      )}

      {!user && (
        <div style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 16px" }}>
          <SportSummaryFilter
            items={sportBreakdown}
            value={sportFilter}
            onChange={setSportFilter}
            ariaLabel={t("mobileFeed.sportFilterLabel")}
          />
        </div>
      )}

      {/* 주간 요약 — 로그인 사용자만 (비로그인은 개인 통계 컨텍스트 없음) */}
      {user && (
        <div style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 16px" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)' }}>
            <Text variant="eyebrow">{t("mobileFeed.weekSummary")}</Text>
            <Link to="/my" className="ds-tap-target" style={{ fontSize: "var(--fs-xs)", color: "var(--lime)", fontWeight: 500, textDecoration: "none" }}>
              {t("mobileFeed.viewAll")}
            </Link>
          </div>

          {/* 전폭 카드: 대시보드 래퍼는 모바일 px 없음 → 부모 padding(16px) 음수마진으로 상쇄 */}
          <SportSummaryFilter
            items={sportBreakdown}
            value={sportFilter}
            onChange={setSportFilter}
            ariaLabel={t("mobileFeed.sportFilterLabel")}
          />
        </div>
      )}

      {consistencyStreak && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <Suspense fallback={null}>
            <ConsistencyStreakCard summary={consistencyStreak} compact />
          </Suspense>
        </div>
      )}

      {showYearRecapBanner && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <Card padding="none" style={{ padding: "var(--space-4)", borderColor: "var(--lime)" }}>
            <Text variant="eyebrow" tone="secondary">{t("yearRecap.eyebrow")}</Text>
            <Text as="h2" variant="subtitle" weight={700} style={{ display: "block", marginTop: "var(--space-1)", color: "var(--ink-0)" }}>
              {t("yearRecap.title")}
            </Text>
            <Text variant="bodySmall" tone="tertiary" style={{ display: "block", marginTop: "var(--space-1)", marginBottom: "var(--space-3)" }}>
              {t("yearRecap.desc")}
            </Text>
            <Link to="/year-recap" className="ds-btn ds-btn--primary ds-btn--sm" style={{ textDecoration: "none", width: "100%" }}>
              <span className="ds-btn__label">{t("yearRecap.cta")}</span>
            </Link>
          </Card>
        </div>
      )}

      <div style={{ borderBottom: "1px solid var(--line-soft)", padding: "10px 16px", display: "grid", gap: "var(--space-2)" }}>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t("feed.search.placeholder")}
          aria-label={t("feed.search.placeholder")}
          style={{
            width: "100%",
            minWidth: 0,
            minHeight: 44,
            borderRadius: "var(--r-md)",
            border: "1px solid var(--line-soft)",
            background: "var(--bg-2)",
            color: "var(--ink-0)",
            padding: "0 12px",
            fontSize: "var(--fs-sm)",
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2)" }}>
          <select
            value={feedScope}
            onChange={(event) => onFeedScopeChange(event.target.value as ActivityFeedScope)}
            aria-label={t("feed.filter.label")}
            style={{
              width: "100%",
              minWidth: 0,
              minHeight: 44,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line-soft)",
              background: "var(--bg-2)",
              color: "var(--ink-0)",
              padding: "0 10px",
              fontSize: "var(--fs-xs)",
            }}
          >
            <option value="all">{t("feed.filter.all")}</option>
            <option value="friends">{t("feed.filter.friends")}</option>
            <option value="self">{t("feed.filter.self")}</option>
          </select>
          <select
            value={datePreset}
            onChange={(event) => setDatePreset(event.target.value as "all" | "7d" | "30d" | "90d")}
            aria-label={t("feed.datePreset.label")}
            style={{
              width: "100%",
              minWidth: 0,
              minHeight: 44,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--line-soft)",
              background: "var(--bg-2)",
              color: "var(--ink-0)",
              padding: "0 10px",
              fontSize: "var(--fs-xs)",
            }}
          >
            <option value="all">{t("feed.datePreset.all")}</option>
            <option value="7d">{t("feed.datePreset.7d")}</option>
            <option value="30d">{t("feed.datePreset.30d")}</option>
            <option value="90d">{t("feed.datePreset.90d")}</option>
          </select>
        </div>
      </div>

      {/* 활동 피드 */}
      {loading && (
        <MobileFeedSkeleton />
      )}

      {!loading && filteredActivities.length === 0 && (
        <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <div style={{ fontSize: "var(--fs-4xl)", marginBottom: 'var(--space-3)' }}>🚴</div>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("mobileFeed.emptyTitle")}</div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("mobileFeed.emptyDesc")}</div>
        </div>
      )}

      {!loading && filteredActivities.length > 0 && (
        <div>
          {renderedActivities.map((activity, i) => (
            <CompactActivityCard key={activity.id} activity={activity} priority={i === 0} />
          ))}
        </div>
      )}

      {!loading && (hasHiddenLocalItems || hasMore) && (
        <div style={{ padding: "var(--space-3) var(--space-4)" }}>
          <Button variant="secondary" size="lg"
            onClick={() => {
              if (hasHiddenLocalItems) {
                setRenderLimit((value) => value + MOBILE_FEED_RENDER_STEP);
              } else {
                onLoadMore();
              }
            }}
            disabled={loadingMore}
            style={{ width: "100%" }}
          >
            {loadingMore ? t("mobileFeed.loadingMore") : t("mobileFeed.loadMore")}
          </Button>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}
