import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { firestore, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { Course } from "@shared/types";
import RouteMap, { type WaypointMarker } from "../../components/RouteMap";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import { normalizeStartTime } from "../../utils/event-time";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Button, Card, Chip, Text } from "../../theme/components";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ── Types ────────────────────────────────────────────────────────────────────

interface CourseInfo {
  name: string;
  gpxUrl: string;
  storagePath: string;
}

interface EventDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  startTime: number;
  creatorId: string;
  groupId?: string;
  maxParticipants?: number;
  courseGpx?: string;
  courses?: CourseInfo[];
  courseIds?: string[];  // courses 컬렉션 참조
  description?: string;
  region?: string;
  creatorName?: string;
  categories?: Array<{ id: string; name: string; capacity?: number }>;
  entryFee?: number;
  cutoffMs?: number;
  bibStartTime?: string;
}

interface RecentParticipant {
  uid: string;
  nickname: string;
  category: string | null;
  joinedAt: number;
}

interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

interface GpxWaypoint {
  lat: number;
  lon: number;
  ele: number;
  name: string;
  type: string;
}

interface CourseData {
  points: GpxPoint[];
  waypoints: GpxWaypoint[];
  latlng: [number, number][];
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
}

// ── GPX Parsing ──────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpxFull(gpxXml: string): CourseData {
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(gpxXml, "text/xml");

  // querySelector는 XML 네임스페이스 처리에서 일관되지 않을 수 있어 getElementsByTagName 사용
  const childText = (parent: Element, tag: string): string | null => {
    const els = parent.getElementsByTagName(tag);
    if (!els.length) return null;
    return els[0]?.textContent?.trim() ?? null;
  };

  const points: GpxPoint[] = [];
  const trkpts = gpxDoc.getElementsByTagName("trkpt");
  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i]!;
    const lat = parseFloat(pt.getAttribute("lat") || "");
    const lon = parseFloat(pt.getAttribute("lon") || "");
    const eleStr = childText(pt, "ele");
    const ele = eleStr != null ? parseFloat(eleStr) : 0;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0 });
    }
  }

  const waypoints: GpxWaypoint[] = [];
  const wpts = gpxDoc.getElementsByTagName("wpt");
  for (let i = 0; i < wpts.length; i++) {
    const wpt = wpts[i]!;
    const lat = parseFloat(wpt.getAttribute("lat") || "");
    const lon = parseFloat(wpt.getAttribute("lon") || "");
    const eleStr = childText(wpt, "ele");
    const ele = eleStr != null ? parseFloat(eleStr) : 0;
    const name = childText(wpt, "name") || "";
    const type = childText(wpt, "type") || "GENERIC";
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      waypoints.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0, name, type });
    }
  }

  let distance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.ele > maxElevation) maxElevation = p.ele;
    if (p.ele < minElevation) minElevation = p.ele;
    if (i > 0) {
      const prev = points[i - 1]!;
      distance += haversine(prev.lat, prev.lon, p.lat, p.lon);
      const diff = p.ele - prev.ele;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
  }

  return {
    points,
    waypoints,
    latlng: points.map((p) => [p.lat, p.lon]),
    distance,
    elevationGain,
    elevationLoss,
    maxElevation: maxElevation === -Infinity ? 0 : maxElevation,
    minElevation: minElevation === Infinity ? 0 : minElevation,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type WpLane = "KOM" | "AID" | "CUT" | "SEG";

const LANE_DEFS: Record<WpLane, { labelKey: string; color: string; icon: string }> = {
  KOM: { labelKey: "detail.lane.kom",    color: "var(--lime)",  icon: "⛰️" },
  AID: { labelKey: "detail.lane.aid",    color: "var(--aqua)",  icon: "🍌" },
  CUT: { labelKey: "detail.lane.cut",    color: "var(--rose)",  icon: "⏱️" },
  SEG: { labelKey: "detail.lane.seg",    color: "var(--amber)", icon: "🏁" },
};

const LANE_ORDER: WpLane[] = ["KOM", "AID", "CUT", "SEG"];

function classifyLane(wp: { type: string; name: string }): WpLane {
  const t = (wp.type || "").toUpperCase();
  if (t === "FOOD" || wp.name.includes("보급")) return "AID";
  if (wp.name.includes("정상") || wp.name.includes("KOM") || t === "KOM") return "KOM";
  if (wp.name.includes("컷") || wp.name.includes("CUT") || t === "CUT") return "CUT";
  return "SEG";
}


// ── Component ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { t } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const LANE_META: Record<WpLane, { label: string; color: string; icon: string }> = {
    KOM: { label: t(LANE_DEFS.KOM.labelKey), color: LANE_DEFS.KOM.color, icon: LANE_DEFS.KOM.icon },
    AID: { label: t(LANE_DEFS.AID.labelKey), color: LANE_DEFS.AID.color, icon: LANE_DEFS.AID.icon },
    CUT: { label: t(LANE_DEFS.CUT.labelKey), color: LANE_DEFS.CUT.color, icon: LANE_DEFS.CUT.icon },
    SEG: { label: t(LANE_DEFS.SEG.labelKey), color: LANE_DEFS.SEG.color, icon: LANE_DEFS.SEG.icon },
  };
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [recentParticipants, setRecentParticipants] = useState<RecentParticipant[]>([]);

  const handleStartEvent = useCallback(async () => {
    if (!eventId || !event) return;
    setShowStartConfirm(false);
    setStarting(true);
    try {
      const startEvent = httpsCallable(functions, "startEvent");
      await startEvent({ eventId });
      navigate(`/event/${eventId}/dashboard`);
    } catch (err: unknown) {
      console.error("이벤트 시작 실패:", err);
      const fbErr = err as { code?: string };
      const msg = fbErr?.code === "functions/failed-precondition"
        ? t("detail.error.alreadyStarted")
        : t("detail.error.startFailed");
      alert(msg);
      setStarting(false);
    }
  }, [eventId, event, navigate]);
  const [linkedCourses, setLinkedCourses] = useState<Course[]>([]);
  const [selectedCourseIdx, setSelectedCourseIdx] = useState(0);
  const [courseDataMap, setCourseDataMap] = useState<Record<number, CourseData>>({});
  const [hoveredWpIdx, setHoveredWpIdx] = useState<number | null>(null);
  const [selectedWpIdx, setSelectedWpIdx] = useState<number | null>(null);
  const [flyToPos, setFlyToPos] = useState<[number, number] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
   
  const chartRef = useRef<any>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartPad, setChartPad] = useState({ left: 0, right: 0, width: 1 });

  // Fetch event data
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const docRef = doc(firestore, "events", eventId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const d = docSnap.data();
          const info = d.info || {};
          const creatorId = info.creatorId || "";
          let creatorName = "";
          if (creatorId) {
            try {
              const cu = await getDoc(doc(firestore, "users", creatorId));
              creatorName = cu.exists() ? (cu.data().nickname || cu.data().displayName || "") : "";
            } catch {
              creatorName = "";
            }
          }
          setEvent({
            id: docSnap.id,
            name: info.name || t("noName"),
            type: info.type || "TOUR",
            status: info.status || "UNKNOWN",
            startTime: normalizeStartTime(info.startTime),
            creatorId,
            creatorName,
            groupId: info.groupId || "",
            maxParticipants: info.settings?.maxParticipants || info.maxParticipants || 0,
            courseGpx: info.courseGpx || "",
            courses: info.courses || [],
            courseIds: info.courseIds || [],
            description: info.description || "",
            region: info.region || "",
            categories: Array.isArray(info.categories) ? info.categories : [],
            entryFee: typeof info.entryFee === "number" ? info.entryFee : undefined,
            cutoffMs: typeof info.cutoffMs === "number" ? info.cutoffMs : undefined,
            bibStartTime: typeof info.bibStartTime === "string" ? info.bibStartTime : undefined,
          });
        }
        const participantsSnap = await getDocs(collection(firestore, `events/${eventId}/participants`));
        setParticipantCount(participantsSnap.size);
        if (user) {
          const myDoc = participantsSnap.docs.find((d) => d.id === user.uid);
          setIsParticipant(!!myDoc);
          setIsLeader(myDoc?.data()?.role === "LEADER");
        }
      } catch (err) {
        console.error("이벤트 상세 조회 실패:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId, user]);

  // Fetch GPX and parse course data
  const fetchCourse = useCallback(async (url: string, idx: number) => {
    if (courseDataMap[idx]) return;
    try {
      let gpxXml: string;
      if (url.startsWith("http")) {
        // storage.googleapis.com 는 CORS 미설정 시 직접 fetch 실패 가능 →
        // Firebase Storage SDK로 토큰화된 URL을 받아 fetch.
        const m = url.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/(.+)$/i);
        let fetchUrl = url;
        if (m && m[1]) {
          try {
            const path = decodeURIComponent(m[1]);
            fetchUrl = await getDownloadURL(ref(getStorage(), path));
          } catch {
            // SDK 실패 시 원본 URL로 폴백
            fetchUrl = url;
          }
        }
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`GPX fetch failed: ${res.status}`);
        gpxXml = await res.text();
      } else {
        gpxXml = url;
      }
      const data = parseGpxFull(gpxXml);
      setCourseDataMap((prev) => ({ ...prev, [idx]: data }));
    } catch (err) {
      console.error("GPX 로드 실패:", err);
    }
  }, [courseDataMap]);

  useEffect(() => {
    if (!event) return;
    if (event.courses && event.courses.length > 0) {
      const c = event.courses[selectedCourseIdx];
      if (c) fetchCourse(c.gpxUrl, selectedCourseIdx);
    } else if (event.courseGpx) {
      fetchCourse(event.courseGpx, 0);
    }
  }, [event, selectedCourseIdx, fetchCourse]);

  // Fetch linked courses from courses collection
  useEffect(() => {
    if (!event?.courseIds?.length) return;
    const fetchLinkedCourses = async () => {
      const courseDocs = await Promise.all(
        event.courseIds!.map(id => getDoc(doc(firestore, "courses", id)))
      );
      setLinkedCourses(
        courseDocs
          .filter(d => d.exists())
          .map(d => ({ id: d.id, ...d.data() } as Course))
      );
    };
    fetchLinkedCourses();
  }, [event?.courseIds]);

  // Fetch top 5 recent participants with denormalized nicknames
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(firestore, `events/${eventId}/participants`),
          orderBy("joinedAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(q);
        const items: RecentParticipant[] = [];
        for (const d of snap.docs) {
          const data = d.data() as { userId?: string; category?: string | null; joinedAt?: { _seconds?: number; seconds?: number } | number };
          const uid = data.userId || d.id;
          const ts = data.joinedAt;
          const joinedAt =
            typeof ts === "number"
              ? ts
              : ts && typeof ts === "object"
                ? ((ts as { _seconds?: number; seconds?: number })._seconds ?? (ts as { _seconds?: number; seconds?: number }).seconds ?? 0) * 1000
                : 0;
          let nickname = t("detail.defaultNickname");
          try {
            const us = await getDoc(doc(firestore, "users", uid));
            if (us.exists()) nickname = us.data().nickname || us.data().displayName || t("detail.defaultNickname");
          } catch {
            // ignore
          }
          items.push({ uid, nickname, category: data.category ?? null, joinedAt });
        }
        if (!cancelled) setRecentParticipants(items);
      } catch (err) {
        // 인덱스 미생성 또는 권한 문제 시 무시
        console.warn("최근 참가자 조회 실패:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSendCourseToParticipants = async (course: Course) => {
    if (!user || sending) return;
    if (!window.confirm(t("detail.confirm.sendCourse", { name: course.name }))) return;
    setSending(true);
    try {
      const fn = httpsCallable(functions, "sendCourseToApp");
      await fn({ courseId: course.id, eventId: event?.id });
      showToast(t("detail.toast.courseSent"));
    } catch (err) {
      console.error("[sendCourseToApp]", err);
      showToast(t("detail.toast.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const courseData = courseDataMap[selectedCourseIdx] || null;

  // 웨이포인트 거리 계산 — 조기 반환 위에서 호출해야 hooks 순서 유지
  const waypointRows = useMemo(() => {
    if (!courseData || courseData.waypoints.length === 0) return [];
    const rows = courseData.waypoints.map((w) => {
      let minD = Infinity;
      let minIdx = 0;
      for (let pi = 0; pi < courseData.points.length; pi++) {
        const p = courseData.points[pi]!;
        const d = haversine(w.lat, w.lon, p.lat, p.lon);
        if (d < minD) {
          minD = d;
          minIdx = pi;
        }
      }
      let cum = 0;
      for (let j = 1; j <= minIdx; j++) {
        const a = courseData.points[j - 1]!;
        const b = courseData.points[j]!;
        cum += haversine(a.lat, a.lon, b.lat, b.lon);
      }
      return { name: w.name, km: cum / 1000, ele: Math.round(w.ele), lane: classifyLane(w) };
    });
    rows.sort((a, b) => a.km - b.km);
    return rows;
  }, [courseData]);

  // ── Elevation chart ──
  const elevationChart = courseData
    ? (() => {
        const step = Math.max(1, Math.floor(courseData.points.length / 300));
        const sampled = courseData.points.filter((_, i) => i % step === 0);
        let cumDist = 0;
        const distances: number[] = [0];
        for (let i = 1; i < sampled.length; i++) {
          const prev = sampled[i - 1]!;
          const cur = sampled[i]!;
          cumDist += haversine(prev.lat, prev.lon, cur.lat, cur.lon);
          distances.push(cumDist);
        }
        const totalDist = cumDist;

        // Calculate waypoint positions on the chart
        // Find nearest sampled point index for each important waypoint
        const importantWps = courseData.waypoints.filter(
          (w) => w.type.toUpperCase() === "FOOD" || w.name.includes("정상") || w.name.includes("컷") || w.name.includes("콤")
        );
        const wpData: (number | null)[] = new Array(sampled.length).fill(null);
        const wpLabels: (string | null)[] = new Array(sampled.length).fill(null);
        const wpShowLabel: boolean[] = new Array(sampled.length).fill(false);
        const wpColors: (string | null)[] = new Array(sampled.length).fill(null);
        const wpSymbols: string[] = new Array(sampled.length).fill("circle");

        // Collected waypoint info for the legend below the chart
        const wpLegendItems: { icon: string; name: string; distKm: string; ele: number; color: string; lat: number; lon: number; chartIdx: number }[] = [];

        const usedIndices = new Set<number>();
        for (const wp of importantWps) {
          let minDist = Infinity;
          let minIdx = 0;
          for (let i = 0; i < sampled.length; i++) {
            const s = sampled[i]!;
            const d = haversine(wp.lat, wp.lon, s.lat, s.lon);
            if (d < minDist) { minDist = d; minIdx = i; }
          }
          if (minDist >= 2000) continue;
          // Avoid overlapping: shift to adjacent unused index
          let idx = minIdx;
          while (usedIndices.has(idx) && idx < sampled.length - 1) idx++;
          if (usedIndices.has(idx)) { idx = minIdx; while (usedIndices.has(idx) && idx > 0) idx--; }
          usedIndices.add(idx);

          wpData[idx] = sampled[idx]!.ele;
          const isFoodWp = wp.type.toUpperCase() === "FOOD";
          const isSummit = wp.name.includes("정상");
          const isCutoff = wp.name.includes("컷");
          const isKom = wp.name.includes("콤");
          const icon = isFoodWp ? "🍌" : isSummit ? "⛰️" : isCutoff ? "⏱️" : isKom ? "🏔️" : "📍";
          const color = isFoodWp ? "#eab308" : isSummit ? "#16a34a" : isCutoff ? "#ef4444" : "#6366f1";
          const symbol = isSummit ? "triangle" : isCutoff ? "rectRot" : isKom ? "star" : "circle";
          wpLabels[idx] = `${icon} ${wp.name}`;
          wpShowLabel[idx] = isCutoff || isKom || isSummit;
          wpColors[idx] = color;
          wpSymbols[idx] = symbol;
          wpLegendItems.push({
            icon,
            name: wp.name,
            distKm: (distances[idx]! / 1000).toFixed(1),
            ele: Math.round(wp.ele),
            color,
            lat: wp.lat,
            lon: wp.lon,
            chartIdx: idx,
          });
        }

        return {
          data: {
            labels: distances.map((d) => `${(d / 1000).toFixed(1)}`),
            datasets: [
              {
                data: sampled.map((p) => p.ele),
                fill: true,
                // Chart.js canvas는 CSS var/color-mix를 해석하지 못하므로 hex로 고정
                backgroundColor: "rgba(198, 244, 50, 0.18)",
                borderColor: "#c6f432",
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
              },
              {
                data: wpData,
                pointRadius: wpData.map((v, i) => {
                  if (v === null) return 0;
                  const activeIdx = hoveredWpIdx ?? selectedWpIdx;
                  const isActive = activeIdx !== null && wpLegendItems.some((item) => item.chartIdx === i && wpLegendItems.indexOf(item) === activeIdx);
                  return isActive ? 12 : 7;
                }),
                pointBackgroundColor: wpColors.map((c) => c || "transparent"),
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointHoverRadius: 9,
                pointStyle: wpSymbols,
                borderWidth: 0,
                fill: false,
                showLine: false,
              },
            ],
          },
          wpLabels,
          wpShowLabel,
          wpLegendItems,
          totalDist,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items: { label: string }[]) => `${items[0]?.label} km`,
                  label: (item: { datasetIndex: number; dataIndex: number; raw: unknown }) => {
                    if (item.datasetIndex === 1 && wpLabels[item.dataIndex]) {
                      return `${wpLabels[item.dataIndex]} (${Math.round(item.raw as number)}m)`;
                    }
                    return `${Math.round(item.raw as number)} m`;
                  },
                },
              },
            },
            scales: {
              x: {
                display: true,
                title: { display: true, text: t("detail.chart.distanceAxis"), font: { size: 11 } },
                ticks: { maxTicksLimit: 10, font: { size: 10 } },
              },
              y: {
                display: true,
                title: { display: true, text: t("detail.chart.elevationAxis"), font: { size: 11 } },
                ticks: { font: { size: 10 } },
              },
            },
          },
        };
      })()
    : null;

  // ── Render helpers ──

  const formatDateTime = (ts: number) => {
    if (!ts) return "-";
    return new Date(ts).toLocaleString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="py-8">
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="py-16">
        <EmptyState
          icon="🗓️"
          title={t("empty.noResults")}
          description={t("detail.notFound.description")}
          actions={[
            { label: t("detail.button.eventList"), variant: "primary", onClick: () => navigate("/events") },
          ]}
        />
      </div>
    );
  }

  const isGranFondo = event.type === "GRANFONDO";
  const courses = event.courses || [];

  const activeWpName = (() => {
    const idx = hoveredWpIdx ?? selectedWpIdx;
    if (idx === null || !elevationChart) return null;
    return elevationChart.wpLegendItems[idx]?.name ?? null;
  })();

  const mapWaypoints: WaypointMarker[] = (courseData?.waypoints || []).map((w) => ({
    lat: w.lat,
    lon: w.lon,
    name: w.name,
    icon: LANE_META[classifyLane(w)].icon,
    active: activeWpName === w.name,
  }));

  const statusMeta = (() => {
    switch (event.status) {
      case "OPEN": return { label: t("status.open"), color: "var(--aqua)" };
      case "LIVE": return { label: t("status.live"), color: "var(--lime)" };
      case "FINISHED": return { label: t("status.finished"), color: "var(--ink-3)" };
      case "CANCELLED": return { label: t("status.cancelled"), color: "var(--rose)" };
      case "DRAFT": return { label: t("status.draft"), color: "var(--ink-3)" };
      default: return { label: event.status, color: "var(--ink-3)" };
    }
  })();

  const fillPct = event.maxParticipants
    ? Math.min(100, Math.round((participantCount / event.maxParticipants) * 100))
    : null;

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center" style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 24px 0", gap: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)" }}>
        <Link to="/events" style={{ color: "var(--ink-3)" }}>{t("title")}</Link>
        <span style={{ color: "var(--ink-4)" }}>›</span>
        <span className="truncate" style={{ color: "var(--ink-2)" }}>{event.name}</span>
      </div>

      {/* 히어로 카드 */}
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 24px 0" }}>
        <Card padding="none" style={{ padding: 0, overflow: "hidden" }}>
          {courseData ? (
            <RouteMap
              latlng={courseData.latlng}
              height="h-80"
              interactive={false}
              rounded={false}
              waypoints={mapWaypoints}
              flyToPosition={flyToPos}
            />
          ) : (
            <div className="h-64" style={{ background: "linear-gradient(135deg, var(--bg-3), var(--bg-4))" }} />
          )}
          <div style={{ padding: "22px 28px" }}>
            {/* 칩 행 */}
            <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 10 }}>
              <Chip style={{ fontSize: 10, color: "var(--amber)", display: "inline-flex", alignItems: "center", gap: 'var(--space-1)' }}>
                <span aria-hidden="true">🏔️</span> {isGranFondo ? t("type.granfondo") : t("type.tour")}
              </Chip>
              <Chip
                style={{
                  fontSize: 10,
                  color: statusMeta.color,
                  borderColor: statusMeta.color === "var(--ink-3)" ? "var(--line-soft)" : `color-mix(in oklch, ${statusMeta.color} 40%, var(--line-soft))`,
                }}
              >
                {statusMeta.label}
              </Chip>
              {event.region && <Chip style={{ fontSize: 10 }}>{event.region}</Chip>}
              {isGranFondo && <Chip style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>Cat HC</Chip>}
            </div>

            {/* 제목 + 메타 + 액션 */}
            <div className="flex flex-wrap items-end justify-between" style={{ gap: 'var(--space-5)' }}>
              <div className="flex-1 min-w-0">
                <h1 style={{ fontSize: 32, letterSpacing: "-0.025em", marginBottom: 6, color: "var(--ink-0)" }}>{event.name}</h1>
                <div className="flex flex-wrap items-center" style={{ fontSize: 12, color: "var(--ink-3)", gap: 'var(--space-4)' }}>
                  <span className="inline-flex items-center" style={{ gap: 5 }}>
                    <span aria-hidden="true">📅</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{formatDateTime(event.startTime)}</span>
                  </span>
                  {event.creatorName && (
                    <span className="inline-flex items-center" style={{ gap: 5 }}>
                      <span aria-hidden="true">👥</span> {t("detail.hostedBy", { name: event.creatorName })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap" style={{ gap: 'var(--space-2)' }}>
                <Button
                  type="button" variant="secondary" size="sm"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.share) {
                      navigator.share({ title: event.name, url: window.location.href }).catch(() => undefined);
                    } else {
                      navigator.clipboard?.writeText(window.location.href).then(() => showToast(t("detail.toast.linkCopied")));
                    }
                  }}
                >
                  🔗 {t("button.share")}
                </Button>
                {event.status === "OPEN" && !isParticipant && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/register`)} variant="primary" size="sm"
                  >
                    + {t("button.register")}
                  </Button>
                )}
                {event.status === "OPEN" && isParticipant && (
                  <Button
                    type="button" variant="secondary" size="sm"
                    style={{ color: "var(--aqua)", borderColor: "color-mix(in oklch, var(--aqua) 40%, transparent)" }}
                  >
                    ✓ {t("status.registered")}
                  </Button>
                )}
                {event.status === "OPEN" && isLeader && (
                  <Button
                    type="button"
                    onClick={() => setShowStartConfirm(true)} variant="primary" size="sm"
                  >
                    ▶ {t("button.start")}
                  </Button>
                )}
                {event.status === "LIVE" && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/dashboard`)} variant="primary" size="sm"
                  >
                    📊 {t("detail.button.liveDashboard")}
                  </Button>
                )}
                {event.status === "FINISHED" && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/results`)} variant="primary" size="sm"
                  >
                    🏆 {t("resultsTitle")}
                  </Button>
                )}
              </div>
            </div>

            {/* 핵심 수치 5컬럼 strip */}
            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 1,
                background: "var(--line-soft)",
                border: "1px solid var(--line-soft)",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              {[
                [t("label.totalDistance"), courseData ? (courseData.distance / 1000).toFixed(1) : "—", "km"],
                [t("label.totalElevation"), courseData ? Math.round(courseData.elevationGain).toString() : "—", "m"],
                [t("label.maxElevation"), courseData ? Math.round(courseData.maxElevation).toString() : "—", "m"],
                [t("participants"), event.maxParticipants ? `${participantCount}/${event.maxParticipants}` : `${participantCount}`, t("detail.unit.person")],
                [t("label.fillRate"), fillPct != null ? fillPct.toString() : "—", "%"],
              ].map(([k, v, u]) => (
                <div key={k} style={{ padding: "14px 16px", background: "var(--bg-1)" }}>
                  <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{k}</Text>
                  <div>
                    <Text variant="dataMedium">{v}</Text>
                    {u && <Text variant="unit">{u}</Text>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* 본문 */}
      <div
        className="event-detail-body"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "20px 24px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 'var(--space-5)',
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-4)', minWidth: 0 }}>
          {/* 코스 선택 */}
          {courses.length > 1 && (
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {courses.map((c, i) => {
                const cd = courseDataMap[i];
                const active = selectedCourseIdx === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSelectedCourseIdx(i); setSelectedWpIdx(null); setHoveredWpIdx(null); setFlyToPos(null); }}
                    aria-pressed={active}
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 5,
                      background: active ? "color-mix(in oklch, var(--lime) 10%, var(--bg-2))" : "var(--bg-2)",
                      color: active ? "var(--ink-0)" : "var(--ink-2)",
                      border: `1px solid ${active ? "var(--lime)" : "var(--line-soft)"}`,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 'var(--space-2)',
                      cursor: "pointer",
                    }}
                  >
                    <span aria-hidden="true">🛣️</span>
                    <span>{c.name}</span>
                    {cd && (
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: 11 }}>
                        {(cd.distance / 1000).toFixed(1)}km · ↑{Math.round(cd.elevationGain)}m
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* 고도 프로필 카드 */}
          {elevationChart && (
            <Card padding="none" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-start justify-between flex-wrap" style={{ marginBottom: 'var(--space-3)', gap: 10 }}>
                <div>
                  <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)", margin: 0 }}>{t("label.elevationProfile")}</h2>
                  <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                    {(courses[selectedCourseIdx]?.name) ?? ""} · {courseData ? (courseData.distance / 1000).toFixed(1) : "—"}km · ↑{courseData ? Math.round(courseData.elevationGain) : "—"}m
                  </div>
                </div>
                <div className="flex flex-wrap" style={{ gap: 10, fontSize: 10, color: "var(--ink-3)" }}>
                  {LANE_ORDER.map((l) => (
                    <span key={l} className="inline-flex items-center" style={{ gap: 'var(--space-1)' }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: LANE_META[l].color, display: "inline-block" }} />
                      <span aria-hidden="true">{LANE_META[l].icon}</span> {LANE_META[l].label}
                    </span>
                  ))}
                </div>
              </div>
              {courseData && (courseData.maxElevation - courseData.minElevation) < 1 ? (
                <div
                  className="h-52 flex items-center justify-center"
                  style={{
                    color: "var(--ink-3)",
                    fontSize: 12,
                    background: "var(--bg-2)",
                    border: "1px solid var(--line-soft)",
                    borderRadius: "var(--r-md, 6px)",
                  }}
                >
                  {t("detail.elevationChart.noElevation")}
                </div>
              ) : (
              <div className="h-52" ref={chartContainerRef}>
                <Line
                  ref={chartRef}
                  data={elevationChart.data as any}
                  options={elevationChart.options as any}
                  plugins={[{
                    id: "wpHighlightPlugin",
                    afterDraw(chart: any) {
                      const containerW = chartContainerRef.current?.offsetWidth || 1;
                      const ca = chart.chartArea;
                      if (ca) {
                        const newPad = { left: ca.left, right: containerW - ca.right, width: ca.right - ca.left };
                        if (newPad.left !== chartPad.left || newPad.width !== chartPad.width) {
                          setTimeout(() => setChartPad(newPad), 0);
                        }
                      }
                      const { ctx } = chart;
                      const dataset = chart.getDatasetMeta(1);
                      if (!dataset?.data) return;
                      const show = elevationChart.wpShowLabel;
                      ctx.save();
                      for (let i = 0; i < dataset.data.length; i++) {
                        if (!show[i]) continue;
                        const pt = dataset.data[i];
                        if (!pt || pt.skip) continue;
                        ctx.beginPath();
                        ctx.setLineDash([3, 3]);
                        ctx.strokeStyle = "rgba(0,0,0,0.15)";
                        ctx.lineWidth = 1;
                        ctx.moveTo(pt.x, pt.y + 8);
                        ctx.lineTo(pt.x, chart.chartArea.bottom);
                        ctx.stroke();
                        ctx.setLineDash([]);
                      }
                      ctx.restore();
                    },
                  }]}
                />
              </div>
              )}
              {elevationChart.wpLegendItems.length > 0 && (() => {
                const items = elevationChart.wpLegendItems;
                const total = elevationChart.totalDist;
                const laneOrder = ["⛰️", "🍌", "⏱️", "🏔️📍"];
                const laneLabel: Record<string, string> = { "⛰️": t("detail.lane.kom"), "🍌": t("detail.lane.aid"), "⏱️": t("detail.lane.cut"), "🏔️📍": t("detail.lane.seg") };
                const getLane = (icon: string) => icon.includes("⛰") ? "⛰️" : icon.includes("🍌") ? "🍌" : icon.includes("⏱") ? "⏱️" : "🏔️📍";
                const laneH = 34;
                const connectorH = 12;
                return (
                  <div className="mt-2 relative" style={{ paddingLeft: chartPad.left, paddingRight: chartPad.right }}>
                    <svg className="w-full" style={{ height: connectorH }} preserveAspectRatio="none">
                      {items.map((item, gi) => {
                        const xPct = (parseFloat(item.distKm) * 1000 / total) * 100;
                        return (
                          <line key={gi} x1={`${xPct}%`} y1="0" x2={`${xPct}%`} y2={connectorH}
                            stroke={item.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
                        );
                      })}
                    </svg>
                    {laneOrder.map((lane, li) => {
                      const laneItems = items.filter((it) => getLane(it.icon) === lane);
                      if (laneItems.length === 0) return null;
                      return (
                        <div key={lane} className="relative" style={{ height: laneH }}>
                          <div className="absolute left-0 text-[length:var(--fs-xs)] font-bold" style={{ top: 4, transform: "translateX(-100%)", paddingRight: 6, whiteSpace: "nowrap", color: "var(--ink-3)" }}>
                            {laneLabel[lane]}
                          </div>
                          <svg className="absolute inset-0 w-full" style={{ height: laneH }}>
                            <line x1="0" y1={laneH / 2} x2="100%" y2={laneH / 2} stroke="var(--line-soft)" strokeWidth="1" />
                            {laneItems.map((item, idx) => {
                              const xPct = (parseFloat(item.distKm) * 1000 / total) * 100;
                              return (
                                <line key={idx} x1={`${xPct}%`} y1="0" x2={`${xPct}%`} y2={laneH / 2}
                                  stroke={item.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
                              );
                            })}
                          </svg>
                          {laneItems.map((item) => {
                            const gi = items.indexOf(item);
                            const xPct = (parseFloat(item.distKm) * 1000 / total) * 100;
                            const isHovered = hoveredWpIdx === gi;
                            const isSelected = selectedWpIdx === gi;
                            const isActive = isHovered || isSelected;
                            return (
                              <div
                                key={gi}
                                onMouseEnter={() => setHoveredWpIdx(gi)}
                                onMouseLeave={() => setHoveredWpIdx(null)}
                                onClick={() => {
                                  if (isSelected) { setSelectedWpIdx(null); setFlyToPos(null); }
                                  else { setSelectedWpIdx(gi); setFlyToPos([item.lat, item.lon]); }
                                }}
                                className={`absolute cursor-pointer transition-all text-[length:var(--fs-xs)] leading-tight ${isActive ? "z-20 font-bold" : "z-10"}`}
                                style={{ left: `${xPct}%`, top: li % 2 === 0 ? 2 : 4, transform: "translateX(-50%)" }}
                              >
                                <div
                                  className="whitespace-nowrap rounded-[var(--r-sm)] px-1 py-0.5 transition-colors"
                                  style={{
                                    background: isSelected
                                      ? "color-mix(in oklch, var(--lime) 18%, var(--bg-2))"
                                      : isActive
                                      ? "color-mix(in oklch, var(--lime) 10%, var(--bg-2))"
                                      : undefined,
                                    outline: isSelected ? "1px solid var(--lime)" : undefined,
                                    color: isActive ? item.color : "var(--ink-3)",
                                  }}
                                >
                                  <span style={{ color: item.color }}>{item.icon}</span> {item.name}
                                  <span className="ml-0.5" style={{ color: "var(--ink-3)" }}>{item.distKm}km</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          )}

          {/* 웨이포인트 테이블 */}
          {waypointRows.length > 0 && (
            <Card padding="none" style={{ padding: 0 }}>
              <div className="flex items-center justify-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)" }}>
                <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{t("label.waypoints")}</div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{t("create.itemCount", { count: waypointRows.length })}</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg-2)" }}>
                    {["#", t("detail.col.name"), t("detail.col.type"), t("distance"), t("detail.col.elevation")].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 0 || i >= 3 ? "right" : "left",
                          padding: "10px 16px",
                          fontSize: 10,
                          letterSpacing: "0.06em",
                          color: "var(--ink-3)",
                          fontWeight: 500,
                          textTransform: "uppercase",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waypointRows.map((w, i) => {
                    const m = LANE_META[w.lane];
                    return (
                      <tr key={`${w.name}-${i}`} style={{ borderTop: "1px solid var(--line-soft)" }}>
                        <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-3)", textAlign: "right" }}>
                          {String(i + 1).padStart(2, "0")}
                        </td>
                        <td style={{ padding: "10px 16px", color: "var(--ink-0)" }}>{w.name}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: m.color, fontSize: 11, fontWeight: 500 }}>
                            <span aria-hidden="true">{m.icon}</span> {m.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                          {w.km.toFixed(1)} km
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                          {w.ele} m
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* 연결된 코스 */}
          {linkedCourses.length > 0 && (
            <Card padding="none" style={{ padding: 'var(--space-5)' }}>
              <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("field.course")}</h2>
              <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
                {linkedCourses.map((course) => (
                  <div
                    key={course.id}
                    className="flex items-center justify-between"
                    style={{ padding: 14, background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md, 6px)" }}
                  >
                    <div>
                      <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)" }}>{course.name}</div>
                      <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                        {(course.distance / 1000).toFixed(1)}km · ↑{Math.round(course.elevationGain)}m
                      </div>
                    </div>
                    <div className="flex" style={{ gap: 'var(--space-2)' }}>
                      <Button type="button" onClick={() => navigate(`/course/${course.id}`)} variant="secondary" size="sm">
                        {t("action.viewDetails")}
                      </Button>
                      {isLeader && (
                        <Button
                          type="button"
                          onClick={() => handleSendCourseToParticipants(course)}
                          disabled={sending} variant="primary" size="sm" className="disabled:opacity-50"
                        >
                          {t("detail.button.sendToParticipants")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 대회 안내 */}
          {event.description && (
            <Card padding="none" style={{ padding: 'var(--space-5)' }}>
              <h2 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>{t("label.eventGuide")}</h2>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, color: "var(--ink-1)", lineHeight: 1.7, margin: 0 }}>
                {event.description}
              </pre>
            </Card>
          )}
        </div>

        {/* 사이드바 */}
        <aside className="event-detail-aside" style={{ display: "flex", flexDirection: "column", gap: 14, alignSelf: "start", position: "sticky", top: 68 }}>
          {/* 참가 현황 */}
          <Card padding="none" style={{ padding: 18 }}>
            <h2 className="text-[length:var(--fs-sm)] font-semibold mb-2" style={{ color: "var(--ink-1)" }}>{t("label.myParticipation")}</h2>
            <div className="flex items-baseline" style={{ gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: "var(--ink-0)" }}>{participantCount}</span>
              {event.maxParticipants ? (
                <Text variant="unit" style={{ color: "var(--ink-3)" }}>/ {event.maxParticipants}{t("detail.unit.person")}</Text>
              ) : (
                <Text variant="unit" style={{ color: "var(--ink-3)" }}>{t("detail.unit.person")}</Text>
              )}
            </div>
            {fillPct != null && event.maxParticipants && (
              <>
                <div style={{ marginTop: 10, height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${fillPct}%`,
                      height: "100%",
                      background: fillPct > 80 ? "var(--amber)" : "var(--lime)",
                    }}
                  />
                </div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  {t("label.fillRate")} {fillPct}% · {t("label.remaining")} {Math.max(0, event.maxParticipants - participantCount)}{t("detail.unit.person")}
                </div>
              </>
            )}
            <div
              className="flex flex-col"
              style={{ borderTop: "1px solid var(--line-soft)", marginTop: 14, paddingTop: 14, gap: 'var(--space-2)', fontSize: 12 }}
            >
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.categories")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {event.categories && event.categories.length > 0
                    ? event.categories.map((c) => c.name).join(" / ")
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.entryFee")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {event.entryFee != null ? `₩ ${event.entryFee.toLocaleString("ko-KR")}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.cutoff")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                  {event.cutoffMs ? t("detail.cutoffHours", { count: Math.round(event.cutoffMs / 3_600_000) }) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ink-3)" }}>{t("label.bibDistribution")}</span>
                <span style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{event.bibStartTime ?? "—"}</span>
              </div>
            </div>
          </Card>

          {/* 최근 참가자 */}
          <Card padding="none" style={{ padding: 18 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("label.recentParticipants")}</h2>
              <button
                type="button"
                onClick={() => navigate(`/event/${eventId}/participants`)}
                style={{ background: "none", border: "none", fontSize: 10, color: "var(--ink-3)", cursor: "pointer", padding: 0 }}
              >
                {t("action.viewAll")}
              </button>
            </div>
            {recentParticipants.length === 0 ? (
              <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("empty.noParticipants")}</p>
            ) : (
              <div className="flex flex-col" style={{ gap: 10 }}>
                {recentParticipants.map((p) => (
                  <div key={p.uid} className="flex items-center" style={{ gap: 10 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--bg-3)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        color: "var(--ink-2)",
                        fontWeight: 500,
                      }}
                    >
                      {p.nickname.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[length:var(--fs-xs)] truncate" style={{ color: "var(--ink-1)" }}>{p.nickname}</div>
                      {p.category && <div style={{ color: "var(--ink-3)", fontSize: 10 }}>{p.category}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Host menu */}
          {isLeader && (
            <Card padding="none"
              style={{ padding: 18, borderColor: "color-mix(in oklch, var(--amber) 30%, var(--line-soft))" }}
            >
              <div className="flex items-center" style={{ gap: 6, marginBottom: 10 }}>
                <span aria-hidden="true">⚙️</span>
                <Text variant="eyebrow" style={{ color: "var(--amber)" }}>{t("label.hostMenu")}</Text>
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {(event.status === "DRAFT" || event.status === "OPEN") && (
                  <Button
                    type="button"
                    onClick={() => navigate(`/event/${eventId}/edit`)} variant="secondary" size="sm"
                    style={{ justifyContent: "flex-start", width: "100%" }}
                  >
                    ✏️ {t("action.editEvent")}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => linkedCourses[0] && handleSendCourseToParticipants(linkedCourses[0])}
                  disabled={sending || linkedCourses.length === 0} variant="secondary" size="sm" className="disabled:opacity-50"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  📤 {t("action.sendCourse")}
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate(`/event/${eventId}/participants`)} variant="secondary" size="sm"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  👥 {t("action.manageParticipants")}
                </Button>
                {event.status === "OPEN" && (
                  <Button
                    type="button"
                    onClick={() => setShowStartConfirm(true)}
                    disabled={starting} variant="primary" size="sm" className="disabled:opacity-50"
                    style={{ justifyContent: "flex-start", width: "100%" }}
                  >
                    {starting ? t("detail.button.starting") : `▶ ${t("button.start")}`}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>

      {/* 좁은 뷰포트: 사이드바 아래로 stack */}
      <style>{`
        @media (max-width: 1024px) {
          .event-detail-body { grid-template-columns: 1fr !important; }
          .event-detail-aside { position: static !important; }
        }
      `}</style>

      {/* 이벤트 시작 확인 모달 */}
      {showStartConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 100 }}
          onClick={() => setShowStartConfirm(false)}
        >
          <Card padding="none"
            style={{ padding: 'var(--space-6)', maxWidth: 440, width: "90%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex" style={{ gap: 14, marginBottom: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "color-mix(in oklch, var(--lime) 15%, var(--bg-2))",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontSize: 18,
                  color: "var(--lime)",
                }}
              >
                ▶
              </div>
              <div>
                <div className="text-[length:var(--fs-base)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: 6 }}>
                  {t("confirm.startEvent")}
                </div>
                <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", lineHeight: 1.5 }}>
                  {t("detail.confirm.startEventWithCount", { count: participantCount })}
                </div>
              </div>
            </div>
            <div className="flex justify-end" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <Button type="button" onClick={() => setShowStartConfirm(false)} variant="secondary" size="sm">
                {t("detail.button.goBack")}
              </Button>
              <Button
                type="button"
                onClick={handleStartEvent}
                disabled={starting} variant="primary" size="sm" className="disabled:opacity-50"
              >
                {starting ? t("detail.button.starting") : `▶ ${t("button.start")}`}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Toast — 우상단 */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: 72,
            right: 24,
            maxWidth: 400,
            padding: "var(--space-3) var(--space-4)",
            background: "color-mix(in oklch, var(--lime) 12%, var(--bg-2))",
            border: "1px solid var(--lime)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--ink-0)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            boxShadow: "var(--shadow-lg)",
            zIndex: 200,
          }}
        >
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      )}
    </>
  );
}
