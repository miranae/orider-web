import SportIcon from "../common/SportIcon";
import HomeActivitySportIcon from "../common/HomeActivitySportIcon";
import { getHomeActivitySport } from "../../utils/homeActivitySport";
import GlossaryText from "../common/GlossaryText";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../../constants/appStoreLinks";
import { useEffect, useState, useMemo, useRef, type ReactNode } from "react";
import { Camera, Medal } from "lucide-react";
import { useActivityAuthor } from "../../hooks/useActivityAuthor";
import { useActivityOverview } from "../../hooks/useActivityOverview";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { Activity } from "@shared/types";
import type { ActivityFeedContent, ActivityFeedContentProjection } from "@shared/types/activity-feed-content";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { activityFeedContentPreviewUrl, activityFeedSourceRevision, boundedFeedContent, loadLocalActivityFeedContent, loadActivityFeedComments } from "../../services/activityFeedContent";
import { logClientError } from "../../services/errorLogger";
import Avatar from "../Avatar";
import ActivityAiSummary from "../activity/ActivityAiSummary";
import ActivitySocialFooter from "../activity/ActivitySocialFooter";
import { activityTimestampParts, toLocalDate } from "../../utils/dateUtils";
import { getDiscipline, getDisciplineIcon, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import { Button, Card, Text, buttonClass } from "../../theme/components";
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
import "./MobileFeedPage.css";

const MOBILE_FEED_RENDER_STEP = 20;
const MOBILE_FEED_RENDER_INITIAL = 20;
type SportFilter = DashboardSportFilter;

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
  sportFilter?: SportFilter;
  datePreset?: DashboardDatePreset;
  runningJourney?: ReactNode;
}

function formatDur(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h\u00a0${m}m` : `${m}m`;
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

export function MobileRouteThumbnail({ activity, priority = false, content }: { activity: Activity; priority?: boolean; content: ActivityFeedContentProjection | null }) {
  const { t } = useTranslation("activity");
  const hasMap = !!activity.thumbnailTrack;
  const photos = (content?.photos ?? []).slice(0, hasMap ? 5 : 4);
  const photoCount = Math.max(photos.length, content?.totalPhotoCount ?? activity.photoCount);
  const squareMap = hasMap && (photos.length === 1 || photos.length === 4);
  if (!hasMap && photoCount === 0) return null;
  const map = hasMap && <div className="mobile-feed-map">
    <ActivityRouteThumbnail activityId={activity.id} userId={activity.userId} polyline={activity.thumbnailTrack}
      mapImageUrl={activity.mapImageUrl} visibility={activity.visibility} contentRevision={activity.contentRevision}
      contentSelectedRevision={activity.contentSelectedRevision} priority={priority} layout="mobile" mobileFullBleed={false}
      shape={squareMap ? "square" : "wide"} />
  </div>;
  const photoTiles = photos.map((photo, index) => <Link key={photo.id} to={`/activity/${activity.id}?tab=overview`} className="mobile-feed-photo" aria-label={t("card.openPhoto", { index: index + 1, count: photoCount })}>
    <img src={photo.url} alt={photo.caption ?? ""} loading="lazy" />
    {index === photos.length - 1 && photoCount > photos.length && <span className="mobile-feed-photo-remaining">+{photoCount - photos.length}</span>}
  </Link>);
  return <div className={`mobile-feed-route${!hasMap ? " mobile-feed-route--photos-only" : ""}`}>
    {squareMap ? <div className={`mobile-feed-media mobile-feed-media--${photos.length}`}>{map}{photoTiles}</div> : <>
      {map}
      {photos.length > 0 && <div className={`mobile-feed-photos mobile-feed-photos--${photos.length}${!hasMap ? " mobile-feed-photos--no-map" : ""}`}>{photoTiles}</div>}
    </>}
    {photoCount > 0 && photos.length === 0 && <div className="mobile-feed-photo-entry">
      <Link to={`/activity/${activity.id}?tab=overview`} className={buttonClass({ variant: "neutral", size: "sm" })}>
        <Camera size={16} aria-hidden="true" /> {t("page.photos")} {photoCount}
      </Link>
    </div>}
  </div>;
}

function ActivityMemo({ memo, memoTruncated = false, activityId }: { memo: string; memoTruncated?: boolean; activityId: string }) {
  const { t } = useTranslation("activity");
  const [expanded, setExpanded] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    if (expanded) return;
    const paragraph = paragraphRef.current;
    if (!paragraph) return;
    const measure = () => setOverflowing(paragraph.scrollHeight > paragraph.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [expanded, memo]);
  if (!memo.trim()) return null;
  return <div className="mobile-feed-memo">
    <p ref={paragraphRef} className={!expanded ? "mobile-feed-memo-collapsed" : undefined}>{memo}</p>
    {overflowing && <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? "card.memoLess" : "card.memoMore")}</Button>}
    {memoTruncated && <Link to={`/activity/${activityId}`}>{t("card.memoMore")}</Link>}
  </div>;
}

/** 시안과 일치하는 컴팩트 모바일 활동 카드 */
export function CompactActivityCard({ activity, priority = false }: { activity: Activity; priority?: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const services = useFirebaseServices();
  const { user } = useAuth();
  const cardRef = useRef<HTMLElement>(null);
  const [localContent, setLocalContent] = useState<(ActivityFeedContent & { viewerId: string | null }) | null>(null);
  const [localFailure, setLocalFailure] = useState<{ viewerId: string | null; sourceRevision: string; kind: "content" | "comments" } | null>(null);
  const [contentRetry, setContentRetry] = useState(0);
  const [commentPreview, setCommentPreview] = useState<{ comments: ActivityFeedContent["comments"]; viewerId: string; sourceRevision: string } | null>(null);
  const sourceRevision = activityFeedSourceRevision(activity);
  const embedded = activity.feedContentV1?.sourceRevision === sourceRevision ? boundedFeedContent(activity.feedContentV1) : null;
  const localContentVisible = localContent?.viewerId === (user?.uid ?? null) && localContent?.sourceRevision === sourceRevision ? localContent : null;
  const content = localContentVisible ?? embedded;
  const needsDefaultMemo = activity.source === "orider" && !content?.memo?.trim();
  const [visibleActivityId, setVisibleActivityId] = useState<string | null>(null);
  useEffect(() => {
    if (!needsDefaultMemo || visibleActivityId === activity.id) return;
    if (typeof IntersectionObserver === "undefined") { setVisibleActivityId(activity.id); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        setVisibleActivityId(activity.id);
      }
    });
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [activity.id, needsDefaultMemo, visibleActivityId]);
  const overviewActivity = activity as Activity & { metadataRevision?: unknown; updatedAt?: unknown };
  const overview = useActivityOverview(activity.id, needsDefaultMemo && visibleActivityId === activity.id, JSON.stringify([
    sourceRevision, activity.source, activity.sourceMeta, activity.visibility,
    activity.isVirtualPower, activity.virtualPowerParams, overviewActivity.metadataRevision, overviewActivity.updatedAt,
  ]));
  const defaultMemo = needsDefaultMemo && overview.response?.status === "available" && overview.response.activityId === activity.id
    ? overview.response.defaultMemo : null;
  const memo = content?.memo?.trim() ? content.memo : defaultMemo;

  useEffect(() => {
    setLocalContent(null);
    setLocalFailure(null);
    setCommentPreview(null);
    const localPreview = !!activityFeedContentPreviewUrl();
    const readComments = !localPreview && !!user && !user.isAnonymous && activity.commentCount > 0;
    if (!localPreview && !readComments) return;
    const controller = new AbortController();
    const load = () => {
      const request = localPreview
        ? loadLocalActivityFeedContent(services, activity.id, controller.signal).then(data => {
          if (!controller.signal.aborted) setLocalContent(data ? { ...data, viewerId: user?.uid ?? null } : null);
        })
        : loadActivityFeedComments(services, user!.uid, activity.id, controller.signal).then(comments => {
          if (!controller.signal.aborted) setCommentPreview({ comments, viewerId: user!.uid, sourceRevision });
        });
      void request.catch(error => {
        if (!controller.signal.aborted && !(error instanceof Error && error.message === "account_changed")) {
          setLocalFailure({ viewerId: user?.uid ?? null, sourceRevision, kind: localPreview ? "content" : "comments" });
          logClientError("MobileFeedPage.feedContent", error, { activityId: activity.id });
        }
      });
    };
    if (typeof IntersectionObserver === "undefined") load();
    else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
      });
      if (cardRef.current) observer.observe(cardRef.current);
      return () => { observer.disconnect(); controller.abort(); };
    }
    return () => controller.abort();
  }, [activity.id, activity.commentCount, services, user, sourceRevision, contentRetry]);
  const localDay = toLocalDate(Date.now());
  const timestamp = useMemo(() => activityTimestampParts(activity.startTime, i18n.language, new Date(`${localDay}T12:00:00`).getTime()), [activity.startTime, i18n.language, localDay]);
  const occurredAt = timestamp ? timestamp.day === "date" ? `${timestamp.date} ${timestamp.time}` : t(`mobileFeed.occurred.${timestamp.day}`, { time: timestamp.time }) : t("mobileFeed.occurred.unknown");
  const device = activity.sourceMeta?.deviceModel?.trim();
  const region = activity.regionName?.trim();
  const s = activity.summary;
  const { units } = useLocale();
  const { t: tActivity } = useTranslation("activity");
  const previewError = localFailure?.viewerId === (user?.uid ?? null) && localFailure.sourceRevision === sourceRevision
    ? <div className="mobile-feed-content-error" role="alert">
      <span>{tActivity(localFailure.kind === "content" ? "card.contentLoadError" : "card.commentsLoadError")}</span>
      <Button variant="ghost" size="sm" onClick={() => setContentRetry(value => value + 1)}>{tActivity("card.contentRetry")}</Button>
    </div> : null;

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
  const achievements = activity.topAchievements?.slice(0, 3) ?? [];
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
    <article ref={cardRef} data-testid="H1-2-1" className="mobile-feed-card">
      <Link
        to={`/activity/${activity.id}`}
        aria-label={activity.description || t("mobileFeed.defaultActivity")}
        className="absolute inset-0 rounded-[var(--r-md)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--lime)]"
        style={{ zIndex: 1 }}
      />
      {/* 작성자 아래에 종목과 제목을 배치해 활동의 맥락부터 읽는다. */}
      <div className="mobile-feed-card-header">
        <span className="mobile-feed-card-avatar"><Avatar userId={activity.userId} name={nickname} imageUrl={activity.profileImage} size={40} className="mobile-feed-author-avatar" /></span>
        <div className="mobile-feed-card-identity">
          <Text as="div" variant="bodySmall" size="md" weight={600} tone="primary" className="mobile-feed-author-name">{nickname}</Text>
          <Text as="div" variant="caption" tone="tertiary" className="mobile-feed-activity-metadata"><time dateTime={timestamp?.iso}>{occurredAt}</time>{device && <span>{`·\u00a0${device}`}</span>}{region && <span>{`·\u00a0${region}`}</span>}</Text>
        </div>
        <span className="mobile-feed-card-sport" role="img" aria-label={activitySportLabel}>
          {activitySport ? <HomeActivitySportIcon sport={activitySport} size={28} /> : getDisciplineIcon(null)}
        </span>
        <Text as="h3" variant="title" size="xl" weight={600} tone="primary" className="mobile-feed-activity-title">
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

      {localFailure?.kind === "content" && previewError}
      {memo && <ActivityMemo memo={memo} memoTruncated={!!content?.memo?.trim() && content.memoTruncated} activityId={activity.id} />}

      {/* 저장된 AI 요약이 있는 활동에만 표시한다. */}
      {(activity.aiSummaryPreview || activity.aiSummaryPreview_en) && <div className="mobile-feed-summary">
        <ActivityAiSummary summary={activity.aiSummaryPreview} summaryEn={activity.aiSummaryPreview_en} inset={false} />
      </div>}

      {/* 핵심 세 지표는 가로로, 추가 측정값은 보조 행에 표시한다. */}
      <div className={`mobile-feed-stats${discipline === "run" ? " mobile-feed-stats--run" : ""}`} data-testid={discipline === "run" ? "run-card-primary" : undefined}>
        {(discipline === "run" ? [
          { v: distance, u: "", l: t("mobileFeed.statDistance") },
          { v: pace, u: "", l: tActivity("stat.avgPace") },
          { v: dur, u: "", time: true, l: t(`homeMetrics.${durationLabelBasis({ ...s, startTime: activity.startTime, endTime: activity.endTime }, sd.usingMoving)}`) },
        ] : [
          { v: distance, u: "", l: t("mobileFeed.statDistance") },
          { v: elev, u: "", l: t("mobileFeed.statElev") },
          { v: dur, u: "", time: true, l: t(`homeMetrics.${durationLabelBasis({ ...s, startTime: activity.startTime, endTime: activity.endTime }, sd.usingMoving)}`) },
        ]).map(stat => {
          const measurement = !stat.time && /^(.*?)(\/km|\/mi|km\/h|mph|km|mi|ft|m)$/.exec(stat.v);
          return <div key={stat.l} className="mobile-feed-stat">
            <div className="mobile-feed-stat-label"><GlossaryText>{stat.l}</GlossaryText></div>
            <div className="mobile-feed-stat-value">{measurement ? <>{measurement[1]}{"\u00a0"}<span className="mobile-feed-stat-unit">{measurement[2]}</span></> : stat.v}</div>
          </div>;
        })}
        {achievements.length > 0 && <Link to={`/activity/${activity.id}?tab=segments`} className="mobile-feed-achievement-count" aria-label={tActivity("card.achievementHighlights", { count: achievements.length })}>
          <span className="mobile-feed-achievement-label">{tActivity("card.achievementHighlightsLabel")}</span>
          <span className="mobile-feed-achievement-number"><Medal size={18} aria-hidden="true" /><span>{achievements.length}</span></span>
        </Link>}
      </div>



      <div className="mobile-feed-secondary-stats" data-testid={discipline === "run" ? "run-card-secondary" : undefined}>
        {[
          ...(discipline !== "run" ? [{ label: t("mobileFeed.statSpeed"), value: spd }] : []),
          ...(hasHr ? [{ label: t("homeMetrics.avgHeartRate"), value: `${Math.round(heartRate)}bpm` }] : []),
          ...(discipline === "run" ? [{ label: t("mobileFeed.statElev"), value: elev }] : []),
          ...(discipline === "run" && (s.averagePower ?? activity.avgPower ?? 0) > 0
            ? [{ label: tActivity("stat.runningPower"), value: `${Math.round(s.averagePower ?? activity.avgPower ?? 0)}W` }] : []),
        ].map(stat => {
          const measurement = /^(.*?)(km\/h|mph|bpm|ft|m|W)$/.exec(stat.value);
          return <span key={stat.label} className="mobile-feed-secondary-stat">
            <span className="mobile-feed-secondary-label"><GlossaryText>{stat.label}</GlossaryText></span>
            <span aria-hidden="true">·</span>
            <span className="mobile-feed-secondary-value">{measurement ? measurement[1] : stat.value}</span>
            {measurement && <> <span className="mobile-feed-secondary-unit"><GlossaryText>{measurement[2]}</GlossaryText></span></>}
          </span>;
        })}
      </div>

      {achievements.length > 0 && <div className="mobile-feed-achievements">
        {achievements.map((achievement, index) => <Link key={`${achievement.segmentId}-${index}`} to={`/activity/${activity.id}?tab=segments`} className="mobile-feed-achievement">
          <span className="mobile-feed-achievement-name">{achievement.segmentName}</span>{" "}
          <strong className="mobile-feed-achievement-type">{achievement.type}</strong>{" "}
          <span className="mobile-feed-achievement-time">({achievement.time})</span>
        </Link>)}
      </div>}

      {/* 원본 경로 전체를 유지한 가로형 지도. */}
      <MobileRouteThumbnail activity={activity} priority={priority} content={content} />

      {/* 좋아요의 실제 합계와 상호작용을 같은 행에 둔다. */}
      <div className="mobile-feed-social">
        <ActivitySocialFooter activity={activity} presentation="feed" commentsPreview={localContentVisible?.comments ?? (commentPreview?.viewerId === user?.uid && commentPreview?.sourceRevision === sourceRevision ? commentPreview.comments : undefined)} />
        {localFailure?.kind === "comments" && previewError}
      </div>
    </article>
  );
}

export default function MobileFeedPage({
  activities, loading, error = false, onRetry, hasMore, loadingMore, onLoadMore, showYearRecapBanner = false, currentUserId = null, friendIds = [],
  activitySearch,
  feedScope,
  sportFilter: controlledSportFilter,
  datePreset: controlledDatePreset,
  runningJourney,
}: MobileFeedPageProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const searchActive = activitySearch?.active ?? false;
  const sportFilter = controlledSportFilter ?? "all";
  const datePreset = controlledDatePreset ?? "all";
  const [renderLimit, setRenderLimit] = useState(MOBILE_FEED_RENDER_INITIAL);
  useEffect(() => { setRenderLimit(MOBILE_FEED_RENDER_INITIAL); }, [activitySearch?.searchedKeyword, sportFilter, datePreset, feedScope]);
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const signedIn = !!user && !user.isAnonymous;
  const effectiveFeedScope = signedIn ? feedScope : "all";
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
      <Text as="h2" className="sr-only">{t(signedIn ? "mobileFeed.feedTitle" : "mobileFeed.publicTitle")}</Text>

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
                setRenderLimit((value) => value + MOBILE_FEED_RENDER_STEP);
                activitySearch!.loadMoreServer();
              } else {
                onLoadMore();
              }
            }}
            disabled={searchActive ? activitySearch!.loadingMore : loadingMore}
            style={{ width: "100%" }}
          >
            {(searchActive ? activitySearch!.loadingMore : loadingMore) ? t("mobileFeed.loadingMore") : t("mobileFeed.loadMore")}
          </Button>
        </div>
      )}

    </div>
  );
}
