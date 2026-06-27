import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { doc, getDoc, getDocs, collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore as db, functions } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import RouteMap, { type WaypointMarker } from "../../components/RouteMap";
import { decodePolyline } from "../../utils/polyline";
import ParticipantTable from "../../components/event/ParticipantTable";

type CourseWaypoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lane: "KOM" | "AID" | "CUT" | "SEG";
};

const LANE_EMOJI: Record<CourseWaypoint["lane"], string> = {
  KOM: "⛰️",
  AID: "🍌",
  CUT: "⏱️",
  SEG: "🏁",
};

function classifyWaypointLane(type: string, name: string): CourseWaypoint["lane"] {
  const t = type.toUpperCase();
  if (t === "FOOD" || name.includes("보급")) return "AID";
  if (name.includes("정상") || name.includes("KOM") || t === "KOM") return "KOM";
  if (name.includes("컷") || name.includes("CUT") || t === "CUT") return "CUT";
  return "SEG";
}

function parseGpxString(xml: string, idPrefix: string): { latlngs: Array<[number, number]>; waypoints: CourseWaypoint[] } {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const latlngs: Array<[number, number]> = [];
    doc.querySelectorAll("trkpt").forEach((pt) => {
      const lat = parseFloat(pt.getAttribute("lat") || "");
      const lng = parseFloat(pt.getAttribute("lon") || "");
      if (Number.isFinite(lat) && Number.isFinite(lng)) latlngs.push([lat, lng]);
    });
    const waypoints: CourseWaypoint[] = [];
    doc.querySelectorAll("wpt").forEach((wpt, i) => {
      const lat = parseFloat(wpt.getAttribute("lat") || "");
      const lng = parseFloat(wpt.getAttribute("lon") || "");
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const name = wpt.querySelector("name")?.textContent?.trim() || "";
      const type = wpt.querySelector("type")?.textContent?.trim() || "GENERIC";
      waypoints.push({
        id: `${idPrefix}-wp-${i}`,
        name: name || `WP${i + 1}`,
        lat,
        lng,
        lane: classifyWaypointLane(type, name),
      });
    });
    return { latlngs, waypoints };
  } catch (err) {
    console.warn(`[EventDashboard] GPX 파싱 실패 (${idPrefix}):`, err);
    return { latlngs: [], waypoints: [] };
  }
}

import { EmptyState, ErrorState, LoadingSkeleton, PermissionGate } from "../../components/redesign";
import { Button, Chip, Text } from "../../theme/components";

interface EventInfo {
  name: string;
  status: string;
  creatorId: string;
  type: string;
}

interface SnapshotLocation {
  uid: string;
  lat: number;
  lng: number;
  speed: number;
  distance: number;
  status: string;
  displayName: string;
  bib: number | null;
  category: string | null;
  rank: number | null;
  overallRank: number | null;
  lastCp: number | null;
  geohash: string | null;
}

interface SnapshotData {
  timestamp: number;
  counts: {
    riding: number;
    finished: number;
    dnf: number;
    sos: number;
    offCourse: number;
    total: number;
  };
  checkpoints: Array<{ cpId: string; name: string; passedCount: number }>;
  locations: SnapshotLocation[];
}

interface AlertItem {
  key: string;
  ts: number;
  emoji: string;
  color: string;
  message: string;
  sub?: string;
}

function statusChipColor(status: string): string {
  switch (status) {
    case "LIVE": return "var(--lime)";
    case "OPEN": return "var(--aqua)";
    case "FINISHED": return "var(--ink-3)";
    case "CANCELLED": return "var(--rose)";
    default: return "var(--ink-3)";
  }
}

function formatHHMM(ts: number | null | undefined): string {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function EventDashboardPage() {
  const { t } = useTranslation("event");
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: t("status.draft"),
    OPEN: t("status.open"),
    LIVE: t("status.live"),
    FINISHED: t("status.finished"),
    CANCELLED: t("status.cancelled"),
  };

  const STATUS_META: Record<
    "RIDING" | "FINISHED" | "DNF" | "SOS" | "OFFCOURSE",
    { label: string; color: string; emoji: string }
  > = {
    RIDING: { label: t("dashboard.status.riding"), color: "var(--lime)", emoji: "🟢" },
    FINISHED: { label: t("stats.finished"), color: "var(--aqua)", emoji: "🏁" },
    DNF: { label: t("stats.dnf"), color: "var(--ink-3)", emoji: "❌" },
    SOS: { label: t("dashboard.status.sos"), color: "var(--rose)", emoji: "🆘" },
    OFFCOURSE: { label: t("dashboard.status.offCourse"), color: "var(--amber)", emoji: "🟠" },
  };

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [registeredCount, setRegisteredCount] = useState<number>(0);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [finishing, setFinishing] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [coursePolylines, setCoursePolylines] = useState<string[]>([]);
  const [courseLatlngs, setCourseLatlngs] = useState<Array<Array<[number, number]>>>([]);
  const [courseWaypoints, setCourseWaypoints] = useState<CourseWaypoint[]>([]);

  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const prevCpRef = useRef<Map<string, number>>(new Map());
  // 코스 로딩 race 방지 — onSnapshot이 빠르게 재발사될 때 이전 IIFE의 setState를 무효화
  const courseLoadAbortRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(
      doc(db, `events/${eventId}`),
      (snap) => {
        if (!snap.exists()) {
          setLoadError(t("empty.noResults"));
          return;
        }
        const d = snap.data();
        const info = d.info || {};
        setEventInfo({
          name: info.name || t("noName"),
          status: info.status || "UNKNOWN",
          creatorId: info.creatorId || "",
          type: info.type || "TOUR",
        });
        // 카운터가 있으면 사용, 없으면(레거시 이벤트) participants 서브컬렉션에서 1회 집계
        if (typeof d.counters?.totalRegistered === "number") {
          setRegisteredCount(d.counters.totalRegistered);
        } else {
          (async () => {
            try {
              const partsSnap = await getDocs(collection(db, `events/${eventId}/participants`));
              setRegisteredCount(partsSnap.size);
            } catch (err) {
              console.warn("[EventDashboard] 참가자 수 집계 실패:", err);
            }
          })();
        }
        // 코스 로드 — 1) info.courseGpx (인라인 GPX 문자열) 2) info.courseIds[] (참조)
        const inlineGpx: string = typeof info.courseGpx === "string" ? info.courseGpx : "";
        const courseIds: string[] = Array.isArray(info.courseIds) ? info.courseIds : [];
        const cps: Array<{ cpId?: string; name?: string; lat?: number; lng?: number }> = Array.isArray(info.checkpoints)
          ? info.checkpoints
          : [];
        // 직전 IIFE 무효화
        courseLoadAbortRef.current();
        let cancelled = false;
        courseLoadAbortRef.current = () => { cancelled = true; };
        (async () => {
          try {
            const latlngsAcc: Array<Array<[number, number]>> = [];
            const polylinesAcc: string[] = [];
            const wpsAcc: CourseWaypoint[] = [];

            if (inlineGpx) {
              const { latlngs, waypoints } = parseGpxString(inlineGpx, "inline");
              if (latlngs.length > 0) latlngsAcc.push(latlngs);
              wpsAcc.push(...waypoints);
            }

            if (courseIds.length > 0) {
              const courses = await Promise.all(
                courseIds.map(async (cid) => {
                  const cs = await getDoc(doc(db, `courses/${cid}`));
                  if (!cs.exists()) return { polyline: "", id: cid };
                  const data = cs.data();
                  return {
                    id: cid,
                    polyline: typeof data.polyline === "string" ? data.polyline : "",
                  };
                })
              );
              for (const c of courses) {
                if (c.polyline) polylinesAcc.push(c.polyline);
              }
            }

            // info.checkpoints[] 위치를 SEG 마커로 합침
            cps.forEach((c, i) => {
              if (typeof c.lat === "number" && typeof c.lng === "number") {
                wpsAcc.push({
                  id: c.cpId || `cp-${i}`,
                  name: c.name || `CP${i + 1}`,
                  lat: c.lat,
                  lng: c.lng,
                  lane: classifyWaypointLane("", c.name || ""),
                });
              }
            });

            if (cancelled) return;
            setCoursePolylines(polylinesAcc);
            setCourseLatlngs(latlngsAcc);
            setCourseWaypoints(wpsAcc);
          } catch (err) {
            console.warn("[EventDashboard] 코스 로드 실패:", err);
          }
        })();
      },
      (err) => {
        console.error("[EventDashboard] event 구독 실패:", err);
        setLoadError(err.message ?? t("dashboard.errorLoadEvent"));
      }
    );
    return () => {
      unsub();
      courseLoadAbortRef.current();
    };
  }, [eventId, t]);

  useEffect(() => {
    if (!eventId) return;
    const unsub = onSnapshot(
      doc(db, `events/${eventId}/snapshots/latest`),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as SnapshotData;
          const data: SnapshotData = {
            ...raw,
            locations: (raw.locations ?? []).map((l) => ({
              ...l,
              status: (l.status || "").toUpperCase(),
            })),
          };
          setSnapshot(data);

          const newAlerts: AlertItem[] = [];
          const now = data.timestamp || Date.now();
          for (const loc of data.locations ?? []) {
            const prev = prevStatusRef.current.get(loc.uid);
            const bibLabel = loc.bib != null ? `#${String(loc.bib).padStart(3, "0")}` : "";
            if (prev && prev !== loc.status) {
              if (loc.status === "FINISHED") {
                newAlerts.push({
                  key: `${loc.uid}-fin-${now}`,
                  ts: now,
                  emoji: "🏁",
                  color: "var(--aqua)",
                  message: t("dashboard.alert.finished", { bib: bibLabel, name: loc.displayName }),
                  sub: loc.overallRank ? t("dashboard.alert.overallRank", { rank: loc.overallRank }) : undefined,
                });
              } else if (loc.status === "DNF") {
                newAlerts.push({
                  key: `${loc.uid}-dnf-${now}`,
                  ts: now,
                  emoji: "❌",
                  color: "var(--ink-3)",
                  message: t("dashboard.alert.dnf", { bib: bibLabel, name: loc.displayName }),
                  sub: loc.lastCp ? t("dashboard.alert.dnfSub", { cp: loc.lastCp }) : undefined,
                });
              } else if (loc.status === "SOS") {
                newAlerts.push({
                  key: `${loc.uid}-sos-${now}`,
                  ts: now,
                  emoji: "🆘",
                  color: "var(--rose)",
                  message: t("dashboard.alert.sos", { bib: bibLabel, name: loc.displayName }),
                  sub: loc.lastCp ? t("dashboard.alert.sosSub", { cp: loc.lastCp }) : t("dashboard.alert.locationConfirmed"),
                });
              } else if (loc.status === "OFF_COURSE") {
                newAlerts.push({
                  key: `${loc.uid}-off-${now}`,
                  ts: now,
                  emoji: "🟠",
                  color: "var(--amber)",
                  message: t("dashboard.alert.offCourse", { bib: bibLabel, name: loc.displayName }),
                  sub: loc.lastCp ? t("dashboard.alert.offCourseSub", { cp: loc.lastCp }) : undefined,
                });
              }
            }
            prevStatusRef.current.set(loc.uid, loc.status);
          }
          for (const cp of data.checkpoints ?? []) {
            const prev = prevCpRef.current.get(cp.cpId) ?? 0;
            const delta = cp.passedCount - prev;
            if (delta > 0 && prev > 0) {
              newAlerts.push({
                key: `cp-${cp.cpId}-${now}`,
                ts: now,
                emoji: "📍",
                color: "var(--lime)",
                message: t("dashboard.alert.cpPassed", { count: delta, name: cp.name }),
                sub: t("dashboard.alert.cpTotal", { count: cp.passedCount }),
              });
            }
            prevCpRef.current.set(cp.cpId, cp.passedCount);
          }
          if (newAlerts.length > 0) {
            setAlerts((prev) => [...newAlerts, ...prev].slice(0, 30));
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("[EventDashboard] snapshot 구독 실패:", err);
        setLoadError(err.message ?? t("dashboard.errorLoadSnapshot"));
        setLoading(false);
      }
    );
    return () => unsub();
  }, [eventId, t]);

  const handleFinishEvent = useCallback(async () => {
    if (!eventId || finishing) return;
    if (!window.confirm(t("dashboard.confirm.finish"))) return;
    setFinishing(true);
    try {
      const finishEvent = httpsCallable(functions, "finishEvent");
      await finishEvent({ eventId });
      navigate(`/event/${eventId}/results`);
    } catch (err) {
      console.error("Failed to finish event:", err);
      alert(t("dashboard.error.finish"));
      setFinishing(false);
    }
  }, [eventId, finishing, navigate, t]);

  const handleSendAlert = useCallback(async () => {
    if (!eventId) return;
    const message = window.prompt(t("dashboard.prompt.sendAlert"));
    if (!message || !message.trim()) return;
    try {
      const sendEventAlert = httpsCallable(functions, "sendEventAlert");
      await sendEventAlert({ eventId, message: message.trim(), severity: "info" });
      alert(t("dashboard.success.alertSent"));
    } catch (err) {
      console.error("Failed to send alert:", err);
      alert(t("dashboard.error.alertFailed"));
    }
  }, [eventId, t]);

  const categories = useMemo(() => {
    if (!snapshot) return [] as string[];
    const set = new Set<string>();
    for (const loc of snapshot.locations) {
      if (loc.category) set.add(loc.category);
    }
    return Array.from(set).sort();
  }, [snapshot]);

  const combinedRoute = useMemo<[number, number][] | undefined>(() => {
    const out: [number, number][] = [];
    for (const enc of coursePolylines) {
      if (!enc) continue;
      const pts = decodePolyline(enc);
      if (pts.length > 0) out.push(...pts);
    }
    for (const track of courseLatlngs) {
      if (track.length > 0) out.push(...track);
    }
    return out.length > 0 ? out : undefined;
  }, [coursePolylines, courseLatlngs]);

  const filteredLocations = useMemo(() => {
    if (!snapshot) return [] as SnapshotLocation[];
    if (categoryFilter === "ALL") return snapshot.locations;
    return snapshot.locations.filter((l) => l.category === categoryFilter);
  }, [snapshot, categoryFilter]);

  const filteredCounts = useMemo(() => {
    const c = { riding: 0, finished: 0, dnf: 0, sos: 0, offCourse: 0, total: filteredLocations.length };
    for (const l of filteredLocations) {
      if (l.status === "RIDING") c.riding++;
      else if (l.status === "FINISHED") c.finished++;
      else if (l.status === "DNF") c.dnf++;
      else if (l.status === "SOS") c.sos++;
      else if (l.status === "OFF_COURSE") c.offCourse++;
    }
    return c;
  }, [filteredLocations]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "60vh" }}>
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <PermissionGate title={t("dashboard.permissionTitle")} description={t("dashboard.permissionDesc")} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <ErrorState title={t("dashboard.errorTitle")} description={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (loading || !eventInfo) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <LoadingSkeleton kind="chart" />
      </div>
    );
  }

  const isHost = user.uid === eventInfo.creatorId;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div
        className="flex items-center flex-wrap"
        style={{ gap: 'var(--space-4)', padding: "14px 24px", borderBottom: "1px solid var(--line-soft)", flexShrink: 0 }}
      >
        <button
          type="button"
          onClick={() => navigate(`/event/${eventId}`)}
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-3)",
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            gap: 'var(--space-1)',
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← {t("title")}
        </button>
        <div style={{ width: 1, height: 16, background: "var(--line-soft)" }} />
        <div className="min-w-0">
          <Text as="div" variant="eyebrow" style={{ color: "var(--ink-3)" }}>{t("dashboardTitle")}</Text>
          <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <Chip
              style={{ color: statusChipColor(eventInfo.status), borderColor: "var(--line-soft)", fontWeight: 600 }}
            >
              {STATUS_LABELS[eventInfo.status] ?? eventInfo.status}
            </Chip>
            <h1 className="text-[length:var(--fs-base)] font-semibold truncate" style={{ color: "var(--ink-0)", margin: 0, fontSize: 15 }}>
              {eventInfo.name}
            </h1>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>· {t("dashboard.lastUpdated", { time: timeAgo(snapshot?.timestamp, t) })}</span>
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 'var(--space-2)', marginLeft: "auto" }}>
          <Button
            type="button"
            onClick={() => eventId && window.open(`/live/${eventId}`, "_blank", "noopener")} variant="secondary" size="sm"
          >
            🔭 {t("action.spectatorView")}
          </Button>
          <Button
            type="button"
            onClick={() => navigate(`/event/${eventId}/participants`)} variant="secondary" size="sm"
          >
            👥 {t("participants")}
          </Button>
          {isHost && (
            <Button
              type="button"
              onClick={handleSendAlert} variant="secondary" size="sm"
            >
              📢 {t("action.sendNotice")}
            </Button>
          )}
          {isHost && eventInfo.status === "LIVE" && (
            <Button
              type="button"
              onClick={handleFinishEvent}
              disabled={finishing} variant="secondary" size="sm"
              style={{ color: "var(--rose)", borderColor: "color-mix(in oklch, var(--rose) 40%, transparent)" }}
            >
              {finishing ? t("dashboard.finishing") : `⏹ ${t("button.finish")}`}
            </Button>
          )}
        </div>
      </div>

      {categories.length > 0 && (
        <div
          className="flex items-center flex-wrap"
          style={{ gap: 6, padding: "var(--space-2) var(--space-4)", borderBottom: "1px solid var(--line-soft)", flexShrink: 0 }}
        >
          <Text variant="eyebrow">{t("label.categories")}</Text>
          <Button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            aria-pressed={categoryFilter === "ALL"} variant="secondary" size="sm"
            style={{
              background: categoryFilter === "ALL" ? "var(--bg-3)" : "transparent",
              color: categoryFilter === "ALL" ? "var(--ink-0)" : "var(--ink-3)",
              fontWeight: categoryFilter === "ALL" ? 600 : 400,
            }}
          >
            {t("filter.all")}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              aria-pressed={categoryFilter === cat} variant="secondary" size="sm"
              style={{
                background: categoryFilter === cat ? "var(--bg-3)" : "transparent",
                color: categoryFilter === cat ? "var(--ink-0)" : "var(--ink-3)",
                fontWeight: categoryFilter === cat ? 600 : 400,
              }}
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      {/* Body — 3 columns */}
      <div
        className="event-dashboard-body"
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 320px",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {/* Left: status + checkpoints */}
        <aside style={{ borderRight: "1px solid var(--line-soft)", padding: 18, overflowY: "auto" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 10 }}>
            {t("dashboard.statusTitle", { category: categoryFilter === "ALL" ? t("filter.all") : categoryFilter })}
          </Text>
          <StatusRow kind="RIDING" count={filteredCounts.riding} total={filteredCounts.total} statusMeta={STATUS_META} />
          <StatusRow kind="FINISHED" count={filteredCounts.finished} total={filteredCounts.total} statusMeta={STATUS_META} />
          <StatusRow kind="DNF" count={filteredCounts.dnf} total={filteredCounts.total} statusMeta={STATUS_META} />
          <StatusRow kind="SOS" count={filteredCounts.sos} total={filteredCounts.total} statusMeta={STATUS_META} />
          <StatusRow kind="OFFCOURSE" count={filteredCounts.offCourse} total={filteredCounts.total} statusMeta={STATUS_META} />

          {/* 전체 강조 */}
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              background: "color-mix(in oklch, var(--lime) 6%, var(--bg-2))",
              border: "1px solid color-mix(in oklch, var(--lime) 30%, var(--line-soft))",
              borderRadius: 5,
            }}
          >
            <div className="flex items-center">
              <span style={{ flex: 1, fontSize: 12, color: "var(--ink-1)", fontWeight: 500 }}>{t("label.totalParticipants")}</span>
              <Text variant="num" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-0)" }}>
                {categoryFilter === "ALL" ? registeredCount : filteredCounts.total}
              </Text>
            </div>
          </div>

          <Text as="div" variant="eyebrow" style={{ marginTop: 22, marginBottom: 10 }}>{t("checkpoints")}</Text>
          {snapshot?.checkpoints.length ? (
            snapshot.checkpoints.map((cp) => {
              const total = filteredCounts.total || snapshot.counts?.total || 1;
              const pct = Math.round((cp.passedCount / total) * 100);
              return (
                <div key={cp.cpId} style={{ padding: "8px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div className="flex items-center" style={{ gap: 'var(--space-2)', fontSize: 11 }}>
                    <span className="truncate" style={{ flex: 1, color: "var(--ink-2)" }}>{cp.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-0)" }}>{cp.passedCount}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: 10, width: 30, textAlign: "right" }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 2, background: "var(--bg-3)", borderRadius: 1, overflow: "hidden", marginTop: 'var(--space-1)' }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--aqua)" }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("dashboard.noCheckpointData")}</p>
          )}
        </aside>

        {/* Center: map + table */}
        <section style={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 300, position: "relative" }}>
            <RouteMap
              latlng={combinedRoute}
              height="h-full"
              interactive
              rounded={false}
              waypoints={courseWaypoints.map<WaypointMarker>((w) => ({
                lat: w.lat,
                lon: w.lng,
                name: w.name,
                icon: LANE_EMOJI[w.lane],
              }))}
            />
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(10,26,5,0.7)",
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 10,
                color: "var(--lime)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                pointerEvents: "none",
              }}
            >
              <span style={{ width: 6, height: 6, background: "var(--lime)", borderRadius: "50%", animation: "rd-pulse 1s infinite" }} />
              LIVE · {t("live")}
            </div>
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                fontSize: 10,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
                background: "rgba(10,26,5,0.6)",
                padding: "4px 10px",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            >
              {t("dashboard.lastUpdated", { time: snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString("ko-KR", { hour12: false }) : "--:--:--" })}
            </div>
          </div>
          <div style={{ height: 300, borderTop: "1px solid var(--line-soft)", flexShrink: 0, overflow: "hidden" }}>
            {filteredLocations.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState icon="👥" title={t("dashboard.noParticipantsMatch")} compact />
              </div>
            ) : (
              <ParticipantTable
                locations={filteredLocations}
                selectedUid={selectedUid}
                onSelectParticipant={setSelectedUid}
              />
            )}
          </div>
        </section>

        {/* Right: alert feed */}
        <aside style={{ borderLeft: "1px solid var(--line-soft)", padding: 18, overflowY: "auto" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 10 }}>{t("dashboard.liveAlerts")}</Text>
          {alerts.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("dashboard.noAlertsYet")}</p>
          ) : (
            <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {alerts.map((a) => (
                <li
                  key={a.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: `color-mix(in oklch, ${a.color} 14%, var(--bg-2))`,
                      color: a.color,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      marginTop: 2,
                      fontSize: 11,
                    }}
                  >
                    {a.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-0)", marginBottom: 2 }}>{a.message}</div>
                    {a.sub && <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{a.sub}</div>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                    {formatHHMM(a.ts)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* 좁은 뷰포트에서 3컬럼 → 1컬럼 스택 */}
      <style>{`
        @media (max-width: 1100px) {
          .event-dashboard-body {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

type StatusMetaMap = Record<
  "RIDING" | "FINISHED" | "DNF" | "SOS" | "OFFCOURSE",
  { label: string; color: string; emoji: string }
>;

function StatusRow({
  kind,
  count,
  total,
  statusMeta,
}: {
  kind: keyof StatusMetaMap;
  count: number;
  total: number;
  statusMeta: StatusMetaMap;
}) {
  const m = statusMeta[kind];
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 5,
        background: "var(--bg-2)",
        border: "1px solid var(--line-soft)",
        marginBottom: 6,
      }}
    >
      <div className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 6 }}>
        <span aria-hidden="true" style={{ color: m.color }}>{m.emoji}</span>
        <span style={{ flex: 1, fontSize: 12, color: "var(--ink-1)" }}>{m.label}</span>
        <Text variant="num" style={{ fontSize: 18, color: "var(--ink-0)", fontWeight: 600 }}>{count}</Text>
      </div>
      <div style={{ height: 2, background: "var(--bg-3)", borderRadius: 1, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: m.color }} />
      </div>
    </div>
  );
}

function timeAgo(ts: number | null | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ts) return "-";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("dashboard.timeAgo.justNow");
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return t("dashboard.timeAgo.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("dashboard.timeAgo.hoursAgo", { count: hours });
  return new Date(ts).toLocaleDateString("ko-KR");
}
