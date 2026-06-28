import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { lazyWithRetry as lazy } from "../utils/lazyWithRetry";
import { LocalizedLink as Link } from "./LocalizedLink";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firestore, storage } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContext";
import { formatDistance, formatSpeed, formatElev } from "../utils/units";
import { resolveDuration, resolveAvgSpeedKph } from "../utils/activityTime";
import type { Activity } from "@shared/types";
import Avatar from "./Avatar";
import { getSportLabelKey } from "../utils/sportType";
import DisciplineBadge from "./redesign/DisciplineBadge";
import { getDiscipline } from "../utils/disciplineFilter";
import { isImplausibleActivity, isImplausibleAvgSpeed } from "../utils/activitySanity";
import { Card } from "../theme/components";
import ActivityAiSummary from "./activity/ActivityAiSummary";
import ActivitySocialFooter from "./activity/ActivitySocialFooter";

/**
 * RouteMap 은 mapbox-gl(1.7MB) 을 정적 import 하므로 lazy 로 분리.
 * 결과: 메인/대시보드 entry chunk 가 vendor-mapbox 의존성 해제 → modulepreload 제거.
 * Card 가 mapImageUrl 없는 경우(소수) 에만 실제로 chunk 다운로드.
 */
const RouteMap = lazy(() => import("./RouteMap"));

interface ActivityCardProps {
  activity: Activity;
  showMap?: boolean;
  /** 작성자 아바타·이름·"오라이더/스트라바" 출처 아이콘 숨김.
   *  본인 프로필 페이지처럼 컨텍스트가 이미 작성자를 명시할 때 중복 노출 제거용. */
  hideAuthor?: boolean;
  /** 피드 첫 카드(above-fold·LCP 후보)에만 true. 지도 썸네일을 eager+fetchpriority=high
   *  로 우선 로드해 LCP discovery 지연을 줄인다. 나머지 카드는 기존대로 lazy. */
  priority?: boolean;
}

/**
 * 지도 이미지가 있으면 img, 없으면 RouteMap 라이브 렌더링 후 캡처 → Storage 업로드.
 *
 * 클라 캡처 (A+ 전략, 2026-05-23): 인증된 모든 viewer 가 mapImageUrl 이 없는 활동을
 * 보면 RouteMap 의 WebGL canvas → toBlob('image/webp') → Storage 업로드 →
 * Firestore mapImageUrl 갱신. 서버 generateMapThumbnail 폐기, 모든 썸네일은 클라
 * 캡처가 채운다. 첫 viewer 가 보는 디바이스 해상도에 따라 품질 결정됨.
 *
 * OG 미리보기 (KakaoTalk-Scrap / facebookexternalhit 등) 는 별도 CF 엔드포인트
 * `og-thumbnail` 이 활동 thumbnailTrack 으로 동적 webp 생성.
 *
 * Storage 규칙: 인증된 누구나 `map_thumbnails/{userId}/{activityId}.webp` 쓰기 허용.
 * Firestore 규칙: 인증된 누구나 mapImageUrl 단일 필드 update 허용.
 */
function CaptureMap({ activityId, userId, polyline, mapImageUrl, priority = false }: {
  activityId: string;
  userId: string;
  polyline: string;
  mapImageUrl?: string | null;
  priority?: boolean;
}) {
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(mapImageUrl ?? null);
  const captured = useRef(false);

  // mapImageUrl prop 변경 시 동기화 (피드 갱신 등)
  useEffect(() => { setImageUrl(mapImageUrl ?? null); }, [mapImageUrl]);

  // 인증된 viewer 이고 클라 캡처 webp 가 아직 없는 경우에 한해 캡처.
  const needsCapture = !!user && !isClientCapturedUrl(imageUrl);

  useEffect(() => {
    if (imageUrl && !needsCapture) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageUrl, needsCapture]);

  // RouteMap idle 후 canvas → webp 캡처 → Storage 업로드 → Firestore mapImageUrl 갱신.
  // Storage/Firestore 규칙은 인증된 누구나 허용 — viewer 가 owner 일 필요 없음.
  const handleMapLoad = useCallback(async () => {
    if (captured.current || !needsCapture) return;
    captured.current = true;

    const el = containerRef.current;
    if (!el) return;
    const canvas = el.querySelector("canvas");
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85)
      );
      if (!blob) return;

      const storageRef = ref(storage, `map_thumbnails/${userId}/${activityId}.webp`);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);

      await updateDoc(doc(firestore, "activities", activityId), { mapImageUrl: url });
      setImageUrl(url);
    } catch (err) {
      logClientError("ActivityCard.captureMap", err, { activityId });
    }
  }, [activityId, userId, needsCapture]);

  // 지도 위 거리/시간/획득고도 뱃지는 카드 stats 와 중복이라 제거.
  // 호버 시 dim 그라데이션만 남겨 액션 가능성(클릭→상세) 시각 단서 유지.
  const hoverDim = (
    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
  );

  // 클라 캡처 webp 가 이미 있고 추가 캡처가 필요 없으면 그대로 표시.
  if (imageUrl && !needsCapture) {
    return (
      <div className="px-4 pb-3">
        <Link to={`/activity/${activityId}`} className="block relative group rounded-[var(--r-md)] overflow-hidden w-full aspect-[var(--feed-thumb-aspect)]" style={{ background: "var(--bg-2)" }}>
          {/* 박스 비율은 토큰 --feed-thumb-aspect(현재 2.8:1, index.css 단일 진실원) + object-cover.
              썸네일/캡처가 2:1 이라 더 납작한 박스에선 상하가 크롭되고(좌우 보존) 경로는 프레임을
              채운다. 데스크톱·모바일·캡처가 모두 같은 토큰을 참조해 프레임이 일치한다. */}
          <img
            src={imageUrl}
            alt={t("card.routeMapAlt")}
            className="w-full h-full object-cover"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
          />
          {hoverDim}
        </Link>
      </div>
    );
  }

  // mapImageUrl 없거나 비인증 / 서버 webp 잔존 — RouteMap 라이브 렌더링.
  // needsCapture 면 onLoad 콜백에서 canvas → webp → upload 실행.
  return (
    <div ref={containerRef} className="px-4 pb-3">
      <Link to={`/activity/${activityId}`} className="block relative group rounded-[var(--r-md)] overflow-hidden">
        {visible ? (
          <Suspense fallback={<div className="w-full aspect-[var(--feed-thumb-aspect)]" style={{ background: 'var(--bg-2)' }} />}>
            {/* 캡처/렌더도 디스플레이와 같은 토큰 비율 프레임 → 카드 높이 일관 + cover 시 비율 일치.
                fitPadding 16 으로 경로를 프레임 가까이 키운다. */}
            <RouteMap
              polyline={polyline}
              height="w-full aspect-[var(--feed-thumb-aspect)]"
              fitPadding={16}
              rounded={false}
              preserveDrawingBuffer={needsCapture}
              pixelRatio={needsCapture ? 2 : undefined}
              onLoad={needsCapture ? handleMapLoad : undefined}
            />
          </Suspense>
        ) : (
          <div className="w-full aspect-[var(--feed-thumb-aspect)]" style={{ background: 'var(--bg-2)' }} />
        )}
        {hoverDim}
      </Link>
    </div>
  );
}

/**
 * mapImageUrl 이 클라 캡처(Firebase Storage download URL) 인지 식별.
 * 클라 캡처: `firebasestorage.googleapis.com/v0/b/...?alt=media&token=...`
 * 서버 webp (PR #85 이전): `storage.googleapis.com/...?v=...` (현재는 더 이상 생성 안 함)
 */
function isClientCapturedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("firebasestorage.googleapis.com");
}

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
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[10px] font-bold border" style={badgeStyle}>
      {icons[type]}
    </span>
  );
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

export default function ActivityCard({
  activity,
  showMap = true,
  hideAuthor = false,
  priority = false,
}: ActivityCardProps) {
  const { t } = useTranslation("activity");
  const { t: tCommon } = useTranslation("common");
  const timeAgo = useTimeAgo();
  const s = activity.summary;
  const isStrava = (activity as Activity & { source?: string }).source === "strava";
  const { units } = useLocale();

  // 서버가 사전 집계한 topAchievements 사용 (segment-match 후 활동 doc에 기록)
  const achievements = activity.topAchievements ?? [];
  const prCount = achievements.filter(a => a.type === "PR").length;
  const komCount = achievements.filter(a => a.type === "KOM").length;

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
                    <img src="/favicon.svg" alt="O-Rider" className="w-3.5 h-3.5" />
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
              discipline: getDiscipline(activity.type),
            }) && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[10px] font-semibold border"
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
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[10px] font-bold border" style={{ background: 'var(--bg-3)', color: 'var(--lime)', borderColor: 'var(--lime)' }}>
                    👑 KOM
                  </span>
                )}
                {prCount > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--r-sm)] text-[10px] font-bold border" style={{ background: 'var(--bg-3)', color: 'var(--lime)', borderColor: 'var(--line-soft)' }}>
                    🥇 PR {prCount}
                  </span>
                )}
              </div>
            )}
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
              const d = resolveDuration(s);
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
              const sd = resolveDuration(s);
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
            {s.averageHeartRate != null && s.averageHeartRate > 0 && (
              <StatBlock label={t("stat.avgHrShort")} value={`${s.averageHeartRate} bpm`} />
            )}
          </div>
        </div>

        {/* Right: Segment Achievements — 모바일 상단 구분선, 데스크톱 좌측 구분선 */}
        <div className="min-w-0 md:pl-4 pt-3 md:pt-0 border-t md:border-t-0 md:border-l" style={{ borderColor: 'var(--line-soft)' }}>
          {achievements.length > 0 ? (
            <div className="space-y-0.5">
              {achievements.map((ach, idx) => (
                <div key={idx} className="flex items-center justify-between text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-2)' }}>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <AchievementBadge type={ach.type} />
                    <span className="truncate">{ach.segmentName}</span>
                  </div>
                  <span className="font-mono opacity-80">{ach.time}</span>
                </div>
              ))}
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
        <CaptureMap activityId={activity.id} userId={activity.userId} polyline={activity.thumbnailTrack} mapImageUrl={activity.mapImageUrl} priority={priority} />
      )}

      {/* 스트라바형 소셜 푸터 — 좋아요(아바타 스택)+댓글. 작성자 컨텍스트(hideAuthor)에선 생략.
       *  recentKudos 비정규화로 카드당 추가 read 없음. */}
      {!hideAuthor && <ActivitySocialFooter activity={activity} />}
    </Card>
  );
}
