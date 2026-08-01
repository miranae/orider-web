import { useState, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "./LocalizedLink";
import { logClientError } from "../services/errorLogger";
import { useLocale } from "../contexts/LocaleContext";
import { useStrava } from "../hooks/useStrava";
import { formatDistance, formatSpeed, formatElev } from "../utils/units";
import { resolveDuration, resolveAvgSpeedKph } from "../utils/activityTime";
import { getStravaActivityId } from "../utils/stravaActivity";
import type { Activity } from "@shared/types";
import type { PdcDoc } from "@shared/types/pdc";
import Avatar from "./Avatar";
import { getSportLabelKey } from "../utils/sportType";
import DisciplineBadge from "./redesign/DisciplineBadge";
import { getDiscipline } from "../utils/disciplineFilter";
import {
  isImplausibleActivity,
  isImplausibleActivityHeartRate,
  isImplausibleAvgSpeed,
} from "../utils/activitySanity";
import { Card, Chip } from "../theme/components";
import ActivityAiSummary from "./activity/ActivityAiSummary";
import ActivitySocialFooter from "./activity/ActivitySocialFooter";
import ActivityRouteThumbnail, { shouldReportMapCaptureError } from "./activity/ActivityRouteThumbnail";
import { hasDefinitiveRiderProfile } from "@shared/training/pdcRiderGate";

export { shouldReportMapCaptureError };

interface ActivityCardProps {
  activity: Activity;
  showMap?: boolean;
  /** 작성자 아바타·이름·"오라이더/스트라바" 출처 아이콘 숨김.
   *  본인 프로필 페이지처럼 컨텍스트가 이미 작성자를 명시할 때 중복 노출 제거용. */
  hideAuthor?: boolean;
  /** 피드 첫 카드(above-fold·LCP 후보)에만 true. 지도 썸네일을 eager+fetchpriority=high
   *  로 우선 로드해 LCP discovery 지연을 줄인다. 나머지 카드는 기존대로 lazy. */
  priority?: boolean;
  identityPdc?: PdcDoc | null;
}

const EMPTY_ACTIVITY_SUMMARY: Activity["summary"] = {
  distance: 0,
  ridingTimeMillis: 0,
  averageSpeed: 0,
  maxSpeed: 0,
  averageCadence: null,
  maxCadence: null,
  averageHeartRate: null,
  maxHeartRate: null,
  averagePower: null,
  maxPower: null,
  normalizedPower: null,
  elevationGain: 0,
  calories: null,
  relativeEffort: null,
  tss: null,
  swolf: null,
};

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function useTimeAgo() {
  const { t, i18n } = useTranslation("activity");
  return (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return t("card.timeAgo.justNow");
    if (hours < 24) return t("card.timeAgo.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    if (days === 1) return t("card.timeAgo.yesterday");
    if (days < 7) return t("card.timeAgo.daysAgo", { count: days });
    return new Date(timestamp).toLocaleDateString(i18n.language === "en" ? "en-US" : "ko-KR");
  };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Achievement Types — 서버에서 사전 집계된 activity.topAchievements를 그대로 사용
type AchievementType = "PR" | "KOM" | "2nd" | "3rd";
type ActivityCardAchievement = NonNullable<Activity["topAchievements"]>[number];

interface StreamSegmentEffortForCard {
  id?: number | string;
  name?: string;
  elapsedTime?: number;
  prRank?: number | null;
  komRank?: number | null;
  segment?: {
    id?: number | string;
    name?: string;
  };
}

function AchievementBadge({ type }: { type: AchievementType }) {
  const icons = {
    PR: "🥇 PR",
    KOM: "👑 KOM",
    "2nd": "🥈 2nd",
    "3rd": "🥉 3rd",
  };

  const badgeStyle: React.CSSProperties =
    type === "KOM"
      ? { background: 'var(--bg-3)', color: 'var(--lime)', borderColor: 'var(--lime)' }
      : type === "PR"
      ? { background: 'var(--bg-3)', color: 'var(--lime)', borderColor: 'var(--line-soft)' }
      : { background: 'var(--bg-3)', color: 'var(--ink-2)', borderColor: 'var(--line-soft)' };

  return (
    <span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-bold border" style={badgeStyle}>
      {icons[type]}
    </span>
  );
}

function formatAchievementTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function buildTopAchievementsFromStreams(streams: unknown): ActivityCardAchievement[] {
  const raw = (streams as { segment_efforts?: unknown } | null)?.segment_efforts;
  if (!Array.isArray(raw)) return [];

  return (raw as StreamSegmentEffortForCard[])
    .map((effort) => {
      const prRank = effort.prRank ?? null;
      const komRank = effort.komRank ?? null;
      const elapsedTime = effort.elapsedTime ?? 0;
      if (elapsedTime <= 0) return null;

      let type: AchievementType | null = null;
      if (komRank != null && komRank >= 1 && komRank <= 10) type = "KOM";
      else if (prRank === 1) type = "PR";
      else if (prRank === 2) type = "2nd";
      else if (prRank === 3) type = "3rd";
      if (!type) return null;

      const segmentId = effort.segment?.id ?? effort.id;
      const segmentName = effort.name ?? effort.segment?.name;
      if (segmentId == null || !segmentName) return null;

      return {
        type,
        segmentId: String(segmentId),
        segmentName,
        time: formatAchievementTime(elapsedTime),
        sortRank: type === "KOM" ? 0 : type === "PR" ? 1 : type === "2nd" ? 2 : 3,
      };
    })
    .filter((achievement): achievement is ActivityCardAchievement & { sortRank: number } => achievement != null)
    .sort((a, b) => a.sortRank - b.sortRank)
    .slice(0, 3)
    .map(({ sortRank: _sortRank, ...achievement }) => achievement);
}

/**
 * Stat block — 라벨 위 / 값 아래 vertical block. 모바일·데스크톱 동일 (가독성 우선,
 * 모바일웹 스타일). 라벨은 ink-2 소형, 값은 ink-0 semibold.
 */
function StatBlock({ label, value, title }: { label: string; value: string; title?: string }) {
  // title 이 있으면 값 위로 hover 시 네이티브 툴팁(설명). 데이터 이상 시 원본값 노출에 사용.
  return (
    <div className="flex flex-col items-start">
      <span
        className="text-[length:var(--fs-xs)]"
        style={{ color: 'var(--ink-2)' }}
      >
        {label}
      </span>
      <span
        className="font-semibold text-[length:var(--fs-sm)]"
        style={{ color: 'var(--ink-0)' }}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}

function GearMaintenanceChip({ gear }: { gear?: Activity["gear"] }) {
  const { t } = useTranslation("activity");
  if (!gear?.name || !gear.maxDistanceKm) return null;
  const remaining = Math.round(gear.maxDistanceKm - gear.totalDistanceKm);
  const distance = Math.abs(remaining).toLocaleString();
  return (
    <Chip variant={remaining <= 0 ? "warning" : "default"} dot>
      {remaining <= 0
        ? t("card.gearOverdue", { name: gear.name, distance })
        : t("card.gearRemaining", { name: gear.name, distance })}
    </Chip>
  );
}

function IdentityDataChips({ pdc }: { pdc?: PdcDoc | null }) {
  const { t: tFitness } = useTranslation("fitness");
  const chips: ReactNode[] = [];
  if (hasDefinitiveRiderProfile(pdc)) {
    chips.push(
      <Chip key="riderType" variant="accent" dot>
        {tFitness(`riderType.type.${pdc.riderType.type}.label`)}
      </Chip>,
    );
  }
  return chips;
}

export default function ActivityCard({
  activity,
  showMap = true,
  hideAuthor = false,
  priority = false,
  identityPdc = null,
}: ActivityCardProps) {
  const { t } = useTranslation("activity");
  const { t: tCommon } = useTranslation("common");
  const timeAgo = useTimeAgo();
  const s = activity.summary ?? EMPTY_ACTIVITY_SUMMARY;
  const isStrava = (activity as Activity & { source?: string }).source === "strava";
  const { units } = useLocale();
  const { getStreams } = useStrava();
  const [streamAchievements, setStreamAchievements] = useState<ActivityCardAchievement[]>([]);

  // 서버가 사전 집계한 topAchievements 사용 (segment-match 후 활동 doc에 기록)
  const achievements = (activity.topAchievements?.length ? activity.topAchievements : streamAchievements) ?? [];
  const prCount = achievements.filter(a => a.type === "PR").length;
  const komCount = achievements.filter(a => a.type === "KOM").length;
  const segmentEffortCount = Math.max(activity.segmentEffortCount ?? 0, achievements.length);

  useEffect(() => {
    setStreamAchievements([]);
    if (activity.topAchievements?.length) return;
    // 공개 피드 첫 화면에서 카드마다 Strava stream Callable 을 자동 호출하면 LCP 이후
    // Sentry/Functions 청크까지 깨운다. 서버 집계가 없는 레거시 fallback 은 본인 컨텍스트
    // 카드에서만 보수적으로 허용한다.
    if (!hideAuthor) return;
    if (!activity.segmentEffortCount || activity.segmentEffortCount <= 0) return;
    if ((activity as Activity & { source?: string }).source !== "strava") return;
    const stravaActivityId = getStravaActivityId(activity);
    if (!stravaActivityId) return;

    let cancelled = false;
    getStreams(stravaActivityId)
      .then((streams) => {
        if (cancelled) return;
        setStreamAchievements(buildTopAchievementsFromStreams(streams));
      })
      .catch((err) => {
        logClientError("ActivityCard.streamAchievements", err, { activityId: activity.id });
      });
    return () => { cancelled = true; };
  }, [activity, getStreams, hideAuthor]);

  return (
    <Card padding="none" className="overflow-hidden">
      {/* 모바일: 1컬럼 stack (헤더 → stats → achievements 세로 배치)
       *  데스크톱(md+): 3컬럼 30:40:30 가로 배치, 컬럼 간 세로 중앙 정렬
       *  3컬럼을 모바일에 그대로 적용하면 가운데 stats 폭이 ~155px 로 좁아져 한국어 라벨이
       *  한 글자씩 세로 줄바꿈됨 (획/득/고/도). 모바일은 stack 이 안전. */}
      <div className="p-4 grid gap-4 md:items-center grid-cols-1 md:grid-cols-[3fr_4fr_3fr]">
        {/* Left: 작성자/스포츠/시간/제목/뱃지 */}
        <div className="min-w-0">
          {hideAuthor ? (
            /* 본인 프로필 컨텍스트 — 작성자 아바타/이름 생략, 시간·종목·날짜만 컴팩트하게.
             *  DisciplineBadge 가 [Bike 아이콘 + "사이클"] 을 자체 포함하므로 옆에 🚴 emoji 추가하면
             *  같은 정보 중복 — emoji 생략. */
            <div className="flex items-center gap-2 flex-wrap text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
              <DisciplineBadge discipline={getDiscipline(activity.type)} />
              <span>{timeAgo(activity.startTime)}</span>
              <span>·</span>
              <span>{formatDate(activity.startTime)}</span>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Avatar
                name={activity.nickname}
                imageUrl={activity.profileImage}
                size="md"
                userId={activity.userId}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/athlete/${activity.userId}`}
                    className="font-semibold text-[length:var(--fs-sm)] transition-colors hover:opacity-80"
                    style={{ color: 'var(--ink-0)' }}
                  >
                    {activity.nickname}
                  </Link>
                  {isStrava ? (
                    <svg className="w-3.5 h-3.5 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                    </svg>
                  ) : (
                    <img src="/favicon.svg" alt="Orider" className="w-3.5 h-3.5" />
                  )}
                  {/* DisciplineBadge 가 [Bike 아이콘 + "사이클"] 자체 포함 → 옆에 🚴 emoji 추가
                   *  하면 중복이라 생략. */}
                  <DisciplineBadge discipline={getDiscipline(activity.type)} />
                  <span className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>{timeAgo(activity.startTime)}</span>
                </div>
                <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: 'var(--ink-3)' }}>{formatDate(activity.startTime)}</div>
              </div>
            </div>
          )}
          {/* Title & Badges — 가운데 정렬 */}
          <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
            {isImplausibleActivity({
              distanceM: s.distance,
              durationMs: s.ridingTimeMillis,
              avgKph: s.averageSpeed,
              maxKph: s.maxSpeed,
              averageHeartRate: s.averageHeartRate,
              discipline: getDiscipline(activity.type),
            }) && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-semibold border"
                style={{ background: 'var(--bg-3)', color: 'var(--amber)', borderColor: 'var(--amber)' }}
                title={t("stat.dataWarningTooltip")}
              >
                {t("stat.dataWarning")}
              </span>
            )}
            <Link
              to={`/activity/${activity.id}`}
              className="text-[length:var(--fs-base)] font-bold transition-colors hover:opacity-80"
              style={{ color: 'var(--ink-0)' }}
            >
              {activity.description || tCommon(getSportLabelKey(activity.type))}
            </Link>
            {(prCount > 0 || komCount > 0) && (
              /* 모바일은 achievements 리스트(우측 컬럼이 모바일에선 카드 하단으로 stack)가
               *  같은 정보를 상세히 노출하므로 제목 옆 요약 뱃지 숨김 — 카드당 KOM/PR 표시
               *  4-5회 중복 정리. 데스크톱 3컬럼 레이아웃에선 컬럼 간 정보 분리 명확해 유지. */
              <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                {komCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-bold border" style={{ background: 'var(--bg-3)', color: 'var(--lime)', borderColor: 'var(--lime)' }}>
                    👑 KOM
                  </span>
                )}
                {prCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-bold border" style={{ background: 'var(--bg-3)', color: 'var(--lime)', borderColor: 'var(--line-soft)' }}>
                    🥇 PR {prCount}
                  </span>
                )}
              </div>
            )}
            <IdentityDataChips pdc={identityPdc} />
            <GearMaintenanceChip gear={activity.gear} />
          </div>
        </div>

        {/* Middle: Stats — 3컬럼 stat-block (라벨 위 / 값 아래), 모바일·데스크톱 동일.
         *  값이 라벨 아래로 내려가 가독성 향상 (모바일웹 스타일). 6개 stat → 3열 2행. */}
        <div className="min-w-0 md:pl-4 pt-3 md:pt-0 border-t md:border-t-0 md:border-l" style={{ borderColor: 'var(--line-soft)' }}>
          <div
            className="grid gap-x-3 gap-y-2 text-[length:var(--fs-sm)] grid-cols-3"
          >
            <StatBlock label={t("stat.distance")} value={formatDistance(s.distance, units)} />
            <StatBlock label={t("stat.elevShort")} value={formatElev(s.elevationGain, units)} />
            {(() => {
              // #236: 정지 큰 활동은 이동시간 우선 표시 (상세 페이지와 동일 정책). 전환 시
              //  경과 시간은 hover title 로 부연 — 카드엔 "전체/정지" 풀 sub 넣을 공간이 없음.
              const d = resolveDuration({ ...s, startTime: activity.startTime, endTime: activity.endTime });
              return (
                <StatBlock
                  label={t("stat.time")}
                  value={formatDuration(d.displayMs)}
                  title={d.usingMoving ? t("stat.movingTimeTotalSimple", { elapsed: formatDuration(d.elapsedMs) }) : undefined}
                />
              );
            })()}
            {(() => {
              // #236 후속: 이동시간으로 전환된 활동은 평균 속도도 거리/이동시간 기준 (시간 표시와 일관).
              //  전환 시 경과 기준 원본값은 hover title 로 부연.
              const sd = resolveDuration({ ...s, startTime: activity.startTime, endTime: activity.endTime });
              const avgKph = resolveAvgSpeedKph(s.distance, sd, s.averageSpeed);
              const implausible = isImplausibleAvgSpeed(avgKph, getDiscipline(activity.type));
              return (
                <StatBlock
                  label={t("stat.avgSpeed")}
                  value={implausible ? "—" : formatSpeed(avgKph / 3.6, units, 'bike')}
                  title={implausible
                    ? t("stat.dataWarningRaw", { value: avgKph.toFixed(1) })
                    : (sd.usingMoving ? t("stat.movingAvgTotal", { total: s.averageSpeed.toFixed(1) }) : undefined)}
                />
              );
            })()}
            {/* 센서 미연결 (0 W / 0 bpm) 케이스는 stat 숨김 — 광고 유입자에게
             *  "데이터 없음" 인상보다 stat 카드가 일관성 있게 노출되는 게 낫다. */}
            {(() => {
              const pw = s.averagePower ?? activity.avgPower;
              return pw != null && pw > 0 ? (
                <StatBlock label={t("stat.powerShort")} value={`${Math.round(pw)} W`} />
              ) : null;
            })()}
            {s.averageHeartRate != null &&
              s.averageHeartRate > 0 &&
              !isImplausibleActivityHeartRate(s.averageHeartRate) && (
              <StatBlock label={t("stat.avgHrShort")} value={`${s.averageHeartRate} bpm`} />
            )}
          </div>
        </div>

        {/* Right: Segment Achievements — 모바일 상단 구분선, 데스크톱 좌측 구분선 */}
        <div className="min-w-0 md:pl-4 pt-3 md:pt-0 border-t md:border-t-0 md:border-l" style={{ borderColor: 'var(--line-soft)' }}>
          {achievements.length > 0 ? (
            <div className="space-y-0.5">
              {achievements.map((ach, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 text-[length:var(--fs-xs)]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  <AchievementBadge type={ach.type} />
                  <span className="min-w-0 truncate">{ach.segmentName}</span>
                  <span className="font-mono opacity-80 whitespace-nowrap">{ach.time}</span>
                </div>
              ))}
            </div>
          ) : segmentEffortCount > 0 ? (
            <div className="text-[length:var(--fs-xs)] text-center font-medium" style={{ color: 'var(--ink-2)' }}>
              {t("card.segmentCount", { count: segmentEffortCount })}
            </div>
          ) : (
            <div className="text-[length:var(--fs-xs)] text-center" style={{ color: 'var(--ink-4)' }}>
              {t("card.noAchievements")}
            </div>
          )}
        </div>
      </div>

      {/* AI 요약 — 생성된 활동에만 노출 (비정규화 aiSummaryPreview ko/en, read 0). 로케일별 슬롯 선택은 컴포넌트 내부 */}
      {(activity.aiSummaryPreview || activity.aiSummaryPreview_en) &&
        <ActivityAiSummary summary={activity.aiSummaryPreview} summaryEn={activity.aiSummaryPreview_en} />}

      {/* Route map — static image to avoid WebGL overflow + reduce Mapbox costs */}
      {showMap && activity.thumbnailTrack && (
        <ActivityRouteThumbnail activityId={activity.id} userId={activity.userId} polyline={activity.thumbnailTrack} mapImageUrl={activity.mapImageUrl} visibility={activity.visibility} priority={priority} />
      )}

      {/* 스트라바형 소셜 푸터 — 좋아요(아바타 스택)+댓글. 작성자 컨텍스트(hideAuthor)에선 생략.
       *  recentKudos 비정규화로 카드당 추가 read 없음. */}
      {!hideAuthor && <ActivitySocialFooter activity={activity} />}
    </Card>
  );
}
