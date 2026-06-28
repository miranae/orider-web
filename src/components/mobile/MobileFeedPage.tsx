import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import type { Activity } from "@shared/types";
import Avatar from "../Avatar";
import ActivityAiSummary from "../activity/ActivityAiSummary";
import ActivitySocialFooter from "../activity/ActivitySocialFooter";
import WeekBars from "./WeekBars";
import { timeAgo } from "../../utils/timeAgo";
import { getDiscipline, getDisciplineColor, getDisciplineIcon, getDisciplineTag } from "../../utils/disciplineFilter";
import SportFilterTabs from "./SportFilterTabs";
import TodaysWorkoutCard from "../training/TodaysWorkoutCard";
import { Button, Card, Text } from "../../theme/components";
import { useAuth } from "../../contexts/AuthContext";
import { isTrivialActivity } from "../../utils/activityFilter";
import { resolveDuration, resolveAvgSpeedKph } from "../../utils/activityTime";
import { isImplausibleAvgSpeed, isImplausibleActivity } from "../../utils/activitySanity";

interface WeekEntry {
  label: string;
  distance: number;
}

interface MobileFeedPageProps {
  activities: Activity[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  recentWeeks: WeekEntry[];
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

/** 시안과 일치하는 컴팩트 모바일 활동 카드 */
function CompactActivityCard({ activity }: { activity: Activity }) {
  const navigate = useNavigate();
  const { t } = useTranslation("dashboard");
  const s = activity.summary;

  const distKm = (s.distance / 1000).toFixed(1);
  // #236: 정지 큰 활동은 이동시간 우선 (상세·데스크톱 카드와 동일 정책 — resolveDuration 공유).
  const sd = resolveDuration(s);
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
            className="text-[10px]"
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
      {activity.mapImageUrl && (
        <div style={{ aspectRatio: "var(--feed-thumb-aspect)", margin: "0 -16px 10px", overflow: "hidden" }}>
          <img
            src={activity.mapImageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

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
  activities, loading, hasMore, loadingMore, onLoadMore, recentWeeks,
}: MobileFeedPageProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const [sportFilter, setSportFilter] = useState("all");

  const sportBreakdown = useMemo(() => {
    const bike = activities.filter(a => getDiscipline(a.type) === "bike");
    const run = activities.filter(a => getDiscipline(a.type) === "run");
    const swim = activities.filter(a => getDiscipline(a.type) === "swim");
    return [
      { icon: "🚴", label: "RIDE", value: Math.round(bike.reduce((s, a) => s + a.summary.distance / 1000, 0)).toLocaleString(), unit: "km", color: "var(--aqua)" },
      { icon: "🏃", label: "RUN", value: Math.round(run.reduce((s, a) => s + a.summary.distance / 1000, 0)).toLocaleString(), unit: "km", color: "var(--amber)" },
      { icon: "🏊", label: "SWIM", value: Math.round(swim.reduce((s, a) => s + a.summary.distance, 0)).toLocaleString(), unit: "m", color: "var(--lime)" },
    ];
  }, [activities]);

  // 측정 오류 trivial 활동(거리<100m 또는 시간<60s) 항상 숨김.
  const visibleActivities = activities.filter((a) => !isTrivialActivity(a));
  const filteredBySprt = sportFilter === "all" ? visibleActivities
    : visibleActivities.filter(a => getDiscipline(a.type) === sportFilter);

  return (
    <div>
      {/* 주간 요약 — 로그인 사용자만 (비로그인은 개인 통계 컨텍스트 없음) */}
      {user && (
        <div style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 16px" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)' }}>
            <Text variant="eyebrow">{t("mobileFeed.weekSummary")}</Text>
            <Link to="/my" style={{ fontSize: "var(--fs-xs)", color: "var(--lime)", fontWeight: 500, textDecoration: "none" }}>
              {t("mobileFeed.viewAll")}
            </Link>
          </div>

          {/* 전폭 카드: 대시보드 래퍼는 모바일 px 없음 → 부모 padding(16px) 음수마진으로 상쇄 */}
          <Card padding="none" className="grid grid-cols-3 overflow-hidden" style={{ margin: "0 -16px var(--space-3)", padding: 0, borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
            {sportBreakdown.map((s, i) => (
              <div key={s.label} style={{ padding: "10px 0", textAlign: "center", borderRight: i < 2 ? "1px solid var(--line-soft)" : "none" }}>
                <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-4)", marginBottom: 'var(--space-1)', display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)" }}>
                  <span>{s.icon}</span> {s.label}
                </div>
                <Text as="div" variant="num" style={{ fontSize: "var(--fs-lg)", color: s.color, lineHeight: 1 }}>
                  {s.value}<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: "var(--space-0-5)" }}>{s.unit}</span>
                </Text>
              </div>
            ))}
          </Card>

          <Card padding="none" style={{ margin: "0 -16px", padding: "var(--space-3)", borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
            <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{t("mobileFeed.weeklyDistance")}</Text>
            <WeekBars weeks={recentWeeks} />
          </Card>
        </div>
      )}

      {/* 오늘의 워크아웃 — 로그인 사용자만 (비로그인은 훈련 컨텍스트 없음) */}
      {user && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <TodaysWorkoutCard />
        </div>
      )}

      {/* 종목 필터 */}
      <div style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <SportFilterTabs value={sportFilter} onChange={setSportFilter} />
      </div>

      {/* 활동 피드 */}
      {loading && (
        <MobileFeedSkeleton />
      )}

      {!loading && filteredBySprt.length === 0 && (
        <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center" }}>
          <div style={{ fontSize: "var(--fs-4xl)", marginBottom: 'var(--space-3)' }}>🚴</div>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("mobileFeed.emptyTitle")}</div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{t("mobileFeed.emptyDesc")}</div>
        </div>
      )}

      {!loading && filteredBySprt.length > 0 && (
        <div>
          {filteredBySprt.map((activity) => (
            <CompactActivityCard key={activity.id} activity={activity} />
          ))}
          {hasMore && (
            <div style={{ padding: "var(--space-3) var(--space-4)" }}>
              <Button variant="secondary"
                onClick={onLoadMore}
                disabled={loadingMore}
                style={{ width: "100%" }}
              >
                {loadingMore ? t("mobileFeed.loadingMore") : t("mobileFeed.loadMore")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}
