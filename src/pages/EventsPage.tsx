import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { collection, doc, getDoc, getDocs, collectionGroup, query, where } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { EmptyState, LoadingSkeleton, PageHeader } from "../components/redesign";
import { decodePolyline, encodePolyline } from "../utils/polyline";
import { MAPBOX_TOKEN } from "../utils/mapbox";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { Chip, Text, buttonClass } from "../theme/components";

type EventStatus = "OPEN" | "LIVE" | "FINISHED" | "CANCELLED" | "DRAFT" | "UNKNOWN";

interface EventInfo {
  id: string;
  name: string;
  type: string;
  status: EventStatus;
  startTime: number;
  creatorId: string;
  groupId?: string | null;
  registered?: number;
  maxParticipants?: number;
  region?: string;
  distance?: number;
  elevationGain?: number;
  courseId?: string;
  /** info.courseGpx 인라인 GPX에서 파싱한 encoded polyline */
  inlinePolyline?: string;
}

const STATUS_TAB_KEYS: Array<{ k: "ALL" | EventStatus; labelKey: string }> = [
  { k: "ALL", labelKey: "filter.all" },
  { k: "OPEN", labelKey: "status.open" },
  { k: "LIVE", labelKey: "status.live" },
  { k: "FINISHED", labelKey: "status.finished" },
];

const STATUS_META_KEYS: Record<EventStatus, { labelKey: string; color: string; chip: "lime" | "aqua" | null }> = {
  LIVE: { labelKey: "status.live", color: "var(--lime)", chip: "lime" },
  OPEN: { labelKey: "status.open", color: "var(--aqua)", chip: "aqua" },
  FINISHED: { labelKey: "status.finished", color: "var(--ink-3)", chip: null },
  CANCELLED: { labelKey: "status.cancelled", color: "var(--rose)", chip: null },
  DRAFT: { labelKey: "status.draft", color: "var(--ink-3)", chip: null },
  UNKNOWN: { labelKey: "status.unknown", color: "var(--ink-3)", chip: null },
};

const TYPE_FILTER_KEYS: Array<{ k: string; labelKey: string; icon: string }> = [
  { k: "ALL", labelKey: "type.all", icon: "" },
  { k: "GRANFONDO", labelKey: "type.granfondo", icon: "🏔️" },
  { k: "TOUR", labelKey: "type.tour", icon: "🚴" },
];

function typeLabelKey(t: string): string {
  if (t === "GRANFONDO") return "type.granfondo";
  if (t === "TOUR") return "type.tour";
  if (t === "GROUP_RIDE") return "type.groupRide";
  return t;
}

function typeIcon(t: string): string {
  if (t === "GRANFONDO") return "🏔️";
  if (t === "TOUR") return "🚴";
  if (t === "GROUP_RIDE") return "👥";
  return "🗓️";
}

function formatDateTime(ts: number): { date: string; time: string } {
  if (!ts) return { date: "-", time: "" };
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString(localeTag(), { year: "numeric", month: "long", day: "numeric", weekday: "short" }),
    time: d.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function dDay(ts: number): string {
  if (!ts) return "";
  const diff = ts - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${-days}`;
}

/** courseGpx 값이 URL이면 fetch 후 polyline 변환 */
async function gpxSourceToPolyline(src: string): Promise<string | null> {
  if (!src) return null;
  try {
    if (/^https?:\/\//i.test(src.trim())) {
      // storage.googleapis.com 는 CORS 미설정 시 fetch 실패 가능 →
      // Firebase Storage SDK 로 토큰화된 URL을 우선 시도, 실패 시 원본 fetch.
      let fetchUrl = src;
      const m = src.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/i);
      if (m && m[1]) {
        try {
          const path = decodeURIComponent(m[1]);
          fetchUrl = await getDownloadURL(ref(getStorage(), path));
        } catch {
          fetchUrl = src;
        }
      }
      const res = await fetch(fetchUrl);
      if (!res.ok) return null;
      const xml = await res.text();
      return gpxToPolyline(xml);
    }
    return gpxToPolyline(src);
  } catch {
    return null;
  }
}

/** 인라인 GPX XML → 등간격 sampled encoded polyline */
function gpxToPolyline(gpxXml: string, maxPoints = 200): string | null {
  if (!gpxXml || typeof gpxXml !== "string") return null;
  try {
    const xmlDoc = new DOMParser().parseFromString(gpxXml, "text/xml");
    const trkpts = xmlDoc.querySelectorAll("trkpt");
    if (trkpts.length < 2) return null;
    const points: [number, number][] = [];
    trkpts.forEach((pt) => {
      const lat = parseFloat(pt.getAttribute("lat") || "");
      const lng = parseFloat(pt.getAttribute("lon") || "");
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push([lat, lng]);
    });
    if (points.length < 2) return null;
    const step = points.length > maxPoints ? Math.ceil(points.length / maxPoints) : 1;
    const sampled: [number, number][] = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]!);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]!);
    }
    return encodePolyline(sampled);
  } catch {
    return null;
  }
}

function toMillis(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const anyV = v as { _seconds?: number; seconds?: number; toMillis?: () => number };
    if (typeof anyV.toMillis === "function") return anyV.toMillis();
    if (typeof anyV._seconds === "number") return anyV._seconds * 1000;
    if (typeof anyV.seconds === "number") return anyV.seconds * 1000;
  }
  return 0;
}

export default function EventsPage() {
  const { t } = useTranslation("event");
  const STATUS_TABS = STATUS_TAB_KEYS.map(({ k, labelKey }) => ({ k, label: t(labelKey) }));
  const TYPE_FILTERS = TYPE_FILTER_KEYS.map(({ k, labelKey, icon }) => ({ k, label: t(labelKey), icon }));
  const { user } = useAuth();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [coursePolylines, setCoursePolylines] = useState<Record<string, string>>({});
  const [courseThumbs, setCourseThumbs] = useState<Record<string, string>>({});
  const [myEventIds, setMyEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | EventStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(firestore, "events"));
        const list: EventInfo[] = [];
        snap.forEach((doc) => {
          const d = doc.data();
          const info = d.info || {};
          // soft-deleted 이벤트는 목록에서 제외한다.
          if (info.deletedAt) return;
          list.push({
            id: doc.id,
            name: info.name || t("noName"),
            type: info.type || "TOUR",
            status: (info.status as EventStatus) || "UNKNOWN",
            startTime: toMillis(info.startTime),
            creatorId: info.creatorId || "",
            groupId: info.groupId || null,
            region: info.region || undefined,
            registered: d.counters?.totalRegistered,
            maxParticipants: info.settings?.maxParticipants || info.maxParticipants,
            distance: typeof info.distance === "number" ? info.distance : undefined,
            elevationGain: typeof info.elevationGain === "number" ? info.elevationGain : undefined,
            courseId: Array.isArray(info.courseIds) && info.courseIds.length > 0 ? info.courseIds[0] : undefined,
            // courseIds가 없고 인라인 GPX만 있는 시드 이벤트 — 클라에서 파싱해 폴리라인 추출
            inlinePolyline:
              (!Array.isArray(info.courseIds) || info.courseIds.length === 0) &&
              typeof info.courseGpx === "string" &&
              info.courseGpx.length > 0
                ? gpxToPolyline(info.courseGpx) ?? undefined
                : undefined,
          });
        });
        setEvents(list);

        // courseGpx가 URL인 이벤트 — 비동기 fetch 후 inlinePolyline 채워 setEvents 업데이트
        const urlGpxEvents = snap.docs.filter((d) => {
          const info = d.data().info || {};
          const cg: string = typeof info.courseGpx === "string" ? info.courseGpx : "";
          const noCourseIds = !Array.isArray(info.courseIds) || info.courseIds.length === 0;
          return noCourseIds && cg && /^https?:\/\//i.test(cg.trim());
        });
        if (urlGpxEvents.length > 0) {
          (async () => {
            const updates = await Promise.all(
              urlGpxEvents.map(async (d) => {
                const url: string = d.data().info?.courseGpx ?? "";
                const poly = await gpxSourceToPolyline(url);
                return { id: d.id, polyline: poly };
              })
            );
            const polyMap = new Map(updates.filter((u) => u.polyline).map((u) => [u.id, u.polyline as string]));
            if (polyMap.size > 0) {
              setEvents((prev) =>
                prev.map((e) => (polyMap.has(e.id) ? { ...e, inlinePolyline: polyMap.get(e.id) } : e))
              );
            }
          })();
        }

        // 코스 polyline 일괄 fetch — 카드 썸네일용
        const distinctCourseIds = Array.from(
          new Set(list.map((e) => e.courseId).filter((id): id is string => !!id))
        );
        if (distinctCourseIds.length > 0) {
          const polyMap: Record<string, string> = {};
          const thumbMap: Record<string, string> = {};
          await Promise.all(
            distinctCourseIds.map(async (cid) => {
              try {
                const cs = await getDoc(doc(firestore, "courses", cid));
                if (cs.exists()) {
                  const data = cs.data();
                  // CF가 생성한 mapImageUrl 우선
                  if (typeof data.mapImageUrl === "string" && data.mapImageUrl) {
                    thumbMap[cid] = data.mapImageUrl;
                  }
                  // 폴백용 polyline도 같이 저장
                  if (typeof data.polyline === "string" && data.polyline) {
                    polyMap[cid] = data.polyline;
                  } else if (typeof data.thumbnailTrack === "string" && data.thumbnailTrack) {
                    polyMap[cid] = data.thumbnailTrack;
                  }
                }
              } catch {
                // ignore
              }
            })
          );
          setCoursePolylines(polyMap);
          setCourseThumbs(thumbMap);
        }

        if (user) {
          try {
            const mySnap = await getDocs(
              query(collectionGroup(firestore, "participants"), where("userId", "==", user.uid))
            );
            const ids = new Set<string>();
            mySnap.forEach((d) => {
              const parent = d.ref.parent.parent;
              if (parent) ids.add(parent.id);
            });
            setMyEventIds(ids);
          } catch (err) {
            logClientError("EventsPage.loadMyEvents", err);
          }
        }
      } catch (err) {
        logClientError("EventsPage.loadEvents", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const filtered = useMemo(() => {
    return events
      .filter((e) => statusFilter === "ALL" || e.status === statusFilter)
      .filter((e) => typeFilter === "ALL" || e.type === typeFilter)
      .sort((a, b) => {
        // LIVE/OPEN 먼저, 종료는 뒤로 — 같은 상태 내 가까운 시작일 우선 (종료는 최근순)
        const bucket = (s: EventStatus) => (s === "LIVE" ? 0 : s === "OPEN" ? 1 : 2);
        const ba = bucket(a.status);
        const bb = bucket(b.status);
        if (ba !== bb) return ba - bb;
        if (a.status === "FINISHED") return b.startTime - a.startTime;
        return a.startTime - b.startTime;
      });
  }, [events, statusFilter, typeFilter]);

  const liveCount = useMemo(() => events.filter((e) => e.status === "LIVE").length, [events]);
  const openCount = useMemo(() => events.filter((e) => e.status === "OPEN").length, [events]);
  const myCount = myEventIds.size;

  if (loading) {
    return (
      <div className="py-4">
        <LoadingSkeleton kind="list" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 40px" }}>
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("title")}
        subtitle={t("page.subtitle")}
        right={
          user ? (
            <Link to="/event/create" className={`${buttonClass({ variant: 'primary', size: 'sm' })}`}>
              + {t("button.create")}
            </Link>
          ) : undefined
        }
      />

      {/* 요약 strip — 3컬럼 (진행중/모집중/내 참가) */}
      {events.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: "var(--line-soft)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
          }}
        >
          {[
            { lbl: t("status.live"), val: liveCount, sub: t("summary.liveNow"), dot: "var(--lime)" },
            { lbl: t("status.open"), val: openCount, sub: t("summary.canRegister"), dot: "var(--aqua)" },
            { lbl: t("summary.myEvents"), val: myCount, sub: t("summary.thisSeason"), dot: "var(--ink-2)" },
          ].map((s) => (
            <div
              key={s.lbl}
              style={{
                padding: "var(--space-4) var(--space-5)",
                background: "var(--bg-1)",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{s.lbl}</Text>
                <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-2)' }}>
                  <Text variant="dataMedium" style={{ color: "var(--ink-0)" }}>{s.val}</Text>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{s.sub}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 필터 행 */}
      <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-5)', paddingTop: 'var(--space-1)' }}>
        {/* 상태 탭 — lime 하단 보더 */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line-soft)" }}>
          {STATUS_TABS.map((t) => {
            const active = statusFilter === t.k;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setStatusFilter(t.k)}
                aria-pressed={active}
                style={{
                  padding: "6px 12px 10px",
                  fontSize: "var(--fs-xs)",
                  fontWeight: 500,
                  background: "transparent",
                  border: "none",
                  color: active ? "var(--ink-0)" : "var(--ink-3)",
                  borderBottom: active ? "2px solid var(--lime)" : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 18, background: "var(--line-soft)" }} />

        {/* 유형 칩 */}
        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_FILTERS.map((t) => {
            const active = typeFilter === t.k;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setTypeFilter(t.k)}
                aria-pressed={active}
                className="ds-chip"
                style={{
                  fontSize: "var(--fs-xs)",
                  cursor: "pointer",
                  color: active ? "var(--ink-0)" : "var(--ink-3)",
                  background: active ? "color-mix(in oklch, var(--lime) 8%, var(--bg-2))" : "var(--bg-2)",
                  borderColor: active ? "var(--lime)" : "var(--line-soft)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {t.icon && <span aria-hidden="true">{t.icon}</span>} {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
          {filtered.length} / {events.length}
        </div>
      </div>

      {/* 리스트 — 2컬럼 그리드 */}
      {events.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title={t("empty.noEvents")}
          description={user ? t("empty.createFirst") : undefined}
          actions={user ? [{ label: t("button.create"), variant: "primary", href: "/event/create" }] : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🚲"
          title={t("empty.noMatch")}
          description={t("empty.adjustFilters")}
          actions={[
            { label: t("button.create"), variant: "primary", href: "/event/create" },
            { label: t("button.resetFilters"), variant: "secondary", onClick: () => { setStatusFilter("ALL"); setTypeFilter("ALL"); } },
          ]}
        />
      ) : (
        <div
          className="event-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 14,
          }}
        >
          {filtered.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              isMine={myEventIds.has(e.id)}
              mapImageUrl={e.courseId ? courseThumbs[e.courseId] : undefined}
              polyline={(e.courseId ? coursePolylines[e.courseId] : undefined) ?? e.inlinePolyline}
              t={t}
            />
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .event-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const COVER_BG: Record<EventStatus | "DEFAULT", string> = {
  LIVE: "linear-gradient(135deg, color-mix(in oklch, var(--lime) 35%, var(--bg-2)), color-mix(in oklch, var(--lime) 8%, var(--bg-2)))",
  OPEN: "linear-gradient(135deg, color-mix(in oklch, var(--aqua) 35%, var(--bg-2)), color-mix(in oklch, var(--aqua) 8%, var(--bg-2)))",
  FINISHED: "linear-gradient(135deg, color-mix(in oklch, var(--ink-3) 25%, var(--bg-2)), color-mix(in oklch, var(--ink-3) 6%, var(--bg-2)))",
  CANCELLED: "linear-gradient(135deg, color-mix(in oklch, var(--rose) 25%, var(--bg-2)), color-mix(in oklch, var(--rose) 6%, var(--bg-2)))",
  DRAFT: "linear-gradient(135deg, color-mix(in oklch, var(--amber) 25%, var(--bg-2)), color-mix(in oklch, var(--amber) 6%, var(--bg-2)))",
  UNKNOWN: "var(--bg-2)",
  DEFAULT: "var(--bg-2)",
};

/** Mapbox Static Images API URL — CF가 생성하는 mapImageUrl과 동일 스타일 */
function buildMapboxStaticUrl(polyline: string): string | null {
  if (!MAPBOX_TOKEN || !polyline) return null;
  try {
    const encoded = encodeURIComponent(polyline);
    return (
      `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/` +
      `path-3+FC5200-0.8(${encoded})/auto/400x288@2x` +
      `?access_token=${MAPBOX_TOKEN}&padding=40`
    );
  } catch {
    return null;
  }
}

function MapThumbnail({ polyline, accent }: { polyline: string; accent: string }) {
  // viewBox 200x144에 polyline 정규화
  const points = decodePolyline(polyline);
  if (points.length < 2) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const W = 200;
  const H = 144;
  const PAD = 14;
  const dLat = Math.max(1e-6, maxLat - minLat);
  const dLng = Math.max(1e-6, maxLng - minLng);
  // 위도 1도 ≈ 111km, 경도 1도 ≈ 111km × cos(lat) — 한국 중부 ≈ cos(37°) ≈ 0.8
  const aspect = (dLng * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)) / dLat;
  const targetAspect = (W - PAD * 2) / (H - PAD * 2);
  let scaleX: number, scaleY: number;
  if (aspect > targetAspect) {
    scaleX = (W - PAD * 2) / dLng;
    scaleY = scaleX / Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  } else {
    scaleY = (H - PAD * 2) / dLat;
    scaleX = scaleY * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  }
  const offsetX = (W - dLng * scaleX) / 2;
  const offsetY = (H - dLat * scaleY) / 2;
  const project = ([lat, lng]: [number, number]): [number, number] => [
    offsetX + (lng - minLng) * scaleX,
    H - (offsetY + (lat - minLat) * scaleY),
  ];
  // 샘플링 — 200pt 이상이면 등간격 down-sample
  const step = points.length > 200 ? Math.ceil(points.length / 200) : 1;
  const sampled: [number, number][] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(project(points[i]!));
  if (sampled[sampled.length - 1] !== project(points[points.length - 1]!)) {
    sampled.push(project(points[points.length - 1]!));
  }
  const d = sampled.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const start = sampled[0]!;
  const end = sampled[sampled.length - 1]!;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      preserveAspectRatio="none"
    >
      {/* 그리드 패턴 */}
      <defs>
        <pattern id="gridPat" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--grid-soft)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#gridPat)" />
      {/* 케이싱 */}
      <path d={d} stroke="rgba(0,0,0,0.6)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* 메인 */}
      <path d={d} stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Start/End */}
      <circle cx={start[0]} cy={start[1]} r="3" fill={accent} stroke="var(--primary-fg)" strokeWidth="1" />
      <circle cx={end[0]} cy={end[1]} r="3" fill="#fff" stroke="var(--primary-fg)" strokeWidth="1" />
    </svg>
  );
}

function CoverIllustration() {
  return (
    <svg
      aria-hidden="true"
      role="presentation"
      viewBox="0 0 200 144"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.42 }}
      preserveAspectRatio="none"
    >
      <path d="M0 110 Q 30 95, 60 100 T 120 82 T 180 62 L 200 52 L 200 144 L 0 144 Z" fill="#000" opacity="0.22" />
      <path d="M0 88 Q 30 78, 60 80 T 130 58 T 200 42" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" fill="none" strokeDasharray="2,3" />
      <circle cx="30" cy="88" r="3" fill="#fff" />
      <circle cx="170" cy="50" r="3" fill="#fff" />
    </svg>
  );
}

function EventCard({
  event,
  isMine,
  polyline,
  mapImageUrl,
  t,
}: {
  event: EventInfo;
  isMine?: boolean;
  polyline?: string;
  mapImageUrl?: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const metaRaw = STATUS_META_KEYS[event.status] ?? STATUS_META_KEYS.UNKNOWN;
  const meta = { label: t(metaRaw.labelKey), color: metaRaw.color, chip: metaRaw.chip };
  const { date, time } = formatDateTime(event.startTime);
  const dDayLabel = (event.status === "OPEN" || event.status === "LIVE") ? dDay(event.startTime) : "";
  const fillPct =
    event.maxParticipants && event.registered != null
      ? Math.round((event.registered / event.maxParticipants) * 100)
      : null;
  const isFinished = event.status === "FINISHED";
  const isLive = event.status === "LIVE";

  return (
    <Link
      to={`/event/${event.id}`}
      className="ds-card ds-card--bare block"
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 0,
        opacity: isFinished ? 0.72 : 1,
        transition: "opacity .15s",
        borderColor: isMine ? "color-mix(in oklch, var(--lime) 30%, var(--line-soft))" : undefined,
      }}
    >
      {/* 커버: 1) CF mapImageUrl 2) Mapbox Static API (실시간) 3) SVG 폴백 4) 일러스트 */}
      <div style={{ position: "relative", background: COVER_BG[event.status] ?? COVER_BG.DEFAULT, minHeight: 144 }}>
        {(() => {
          const staticUrl = !mapImageUrl && polyline ? buildMapboxStaticUrl(polyline) : null;
          const imgSrc = mapImageUrl || staticUrl;
          if (imgSrc) {
            return (
              <img
                src={imgSrc}
                alt=""
                loading="lazy"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: 0.92,
                }}
              />
            );
          }
          if (polyline) {
            return (
              <MapThumbnail
                polyline={polyline}
                accent={
                  event.status === "LIVE"
                    ? "var(--lime)"
                    : event.status === "OPEN"
                      ? "var(--aqua)"
                      : event.status === "FINISHED"
                        ? "var(--ink-3)"
                        : "var(--lime)"
                }
              />
            );
          }
          return <CoverIllustration />;
        })()}
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6 }}>
          <span
            style={{
              fontSize: "var(--fs-xs)",
              fontFamily: "var(--font-mono)",
              padding: "3px 7px",
              background: "rgba(0,0,0,0.55)",
              color: "var(--ink-0)",
              borderRadius: "var(--r-xs)",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 'var(--space-1)',
            }}
          >
            <span aria-hidden="true">{typeIcon(event.type)}</span> {t(typeLabelKey(event.type))}
          </span>
        </div>
        {isLive && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "var(--lime)",
              color: "var(--primary-fg)",
              padding: "3px 7px",
              borderRadius: "var(--r-xs)",
              fontSize: "var(--fs-xs)",
              fontWeight: 700,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary-fg)", animation: "rd-pulse 1s infinite" }} />
            LIVE
          </div>
        )}
        {event.region && (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              fontSize: "var(--fs-xs)",
              color: "var(--ink-0)",
              background: "rgba(0,0,0,0.55)",
              padding: "3px 7px",
              borderRadius: "var(--r-xs)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {event.region}
          </div>
        )}
      </div>

      {/* 콘텐츠 */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="truncate"
              style={{ fontSize: "var(--fs-base)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.01em", marginBottom: 'var(--space-1)' }}
            >
              {event.name}
            </div>
            <div
              className="flex items-center"
              style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", gap: 6 }}
            >
              <span aria-hidden="true">📅</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {date}
                {time && ` · ${time}`}
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <Chip
              style={{
                fontSize: "var(--fs-xs)",
                color: meta.color,
                borderColor: meta.chip ? `color-mix(in oklch, ${meta.color} 40%, var(--line-soft))` : "var(--line-soft)",
                whiteSpace: "nowrap",
              }}
            >
              {meta.label}
            </Chip>
            {dDayLabel && (
              <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-2)", marginTop: 'var(--space-1)' }}>
                {dDayLabel}
              </div>
            )}
          </div>
        </div>

        {/* 메트릭 행 — 데이터 있을 때만 */}
        {(event.distance != null || event.elevationGain != null || event.maxParticipants != null) && (
          <div style={{ display: "flex", gap: 'var(--space-6)', fontSize: "var(--fs-xs)", color: "var(--ink-2)", flexWrap: "wrap" }}>
            {event.distance != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true">🚴</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{event.distance.toFixed(1)} km</span>
              </div>
            )}
            {event.elevationGain != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true">🏔️</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>↑ {event.elevationGain}m</span>
              </div>
            )}
            {event.maxParticipants != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true">👥</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {event.registered ?? 0}
                  <span style={{ color: "var(--ink-3)" }}>/{event.maxParticipants}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {fillPct != null && event.status === "OPEN" && (
          <div>
            <div style={{ height: 3, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(fillPct, 100)}%`,
                  height: "100%",
                  background: fillPct > 80 ? "var(--amber)" : "var(--lime)",
                }}
              />
            </div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 'var(--space-1)', fontFamily: "var(--font-mono)" }}>
              {t("fillRate", { pct: fillPct })}{fillPct > 80 ? ` · ${t("closingSoon")}` : ""}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
