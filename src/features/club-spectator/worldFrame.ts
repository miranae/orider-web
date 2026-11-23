import type { WorldEventFrame } from "../ride-world/useWorldEvent";
import type { MeetingSpectatorSnapshot, SpectatorCourse, SpectatorRider } from "./types";

type Point = { lat: number; lon: number };
const R = 6371000;
const rad = (v: number) => v * Math.PI / 180;
function meters(a: Point, b: Point) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** 서버 `projectCourseProgress`와 같은 규칙이다. 교차·왕복 구간처럼 모호한 좌표는 순위를 추측하지 않는다. */
export function courseProgress(course: SpectatorCourse, point: Point): number | null {
  let total = 0;
  const cumulative = course.points.map((p, i, all) => { const prev = all[i - 1]; if (prev) total += meters(prev, p); return total; });
  const candidates: { offset: number; progress: number }[] = [];
  for (let i = 1; i < course.points.length; i++) {
    const a = course.points[i - 1], b = course.points[i], from = cumulative[i - 1], to = cumulative[i];
    if (!a || !b || from === undefined || to === undefined) continue;
    const x = (lon: number) => R * rad(lon - point.lon) * Math.cos(rad(point.lat));
    const y = (lat: number) => R * rad(lat - point.lat);
    const ax = x(a.lon), ay = y(a.lat), dx = x(b.lon) - ax, dy = y(b.lat) - ay;
    const length2 = dx * dx + dy * dy;
    if (length2 === 0) continue;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
    candidates.push({offset: Math.hypot(ax + t * dx, ay + t * dy), progress: from + t * (to - from)});
  }
  candidates.sort((a, b) => a.offset - b.offset);
  const best = candidates[0];
  if (!best || best.offset > 50) return null;
  if (candidates.some(c => c.offset <= best.offset + 5 && Math.abs(c.progress - best.progress) > 100)) return null;
  return best.progress;
}

/** 월드 프레임이 제한(최대 10개) 없이 보이는 모든 주행자를 담았는지 확인한다. */
export const worldFrameComplete = (frame: WorldEventFrame) => frame.markers.length >= frame.counts.riding;

/**
 * 월드(Redis) 위치를 받은 즉시 반영한다(P11 Redis 실시간 경로 예외).
 * 명단·코스·이름은 회원 전용 API 값을 유지하고, 위치를 바꾼 경우 순서·격차를 같은 규칙으로 다시 계산한다.
 */
export function applyWorldFrame(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number): MeetingSpectatorSnapshot {
  const course = snapshot.course;
  if (frame.eventId !== snapshot.eventId || !course) return snapshot;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  let changed = false;
  for (const marker of frame.markers) {
    const uid = marker.uid;
    const prior = uid ? rows.get(uid) : undefined;
    if (!uid || (!prior && !names.has(uid)) || !Number.isFinite(marker.lat) || !Number.isFinite(marker.lon) ||
        !Number.isFinite(marker.capturedAt) || marker.capturedAt > now + 2000 || (prior && prior.sampledAtMs >= marker.capturedAt)) continue;
    if (prior && prior.courseId !== course.courseId) continue;
    const powerLive = typeof marker.power === "number" && typeof marker.powerExpiresAtMs === "number" && marker.powerExpiresAtMs > now;
    const ended = prior?.status === "FINISHED" || prior?.status === "DNF";
    rows.set(uid, {
      uid, displayName: prior?.displayName ?? names.get(uid) ?? "회원", courseId: course.courseId,
      lat: marker.lat, lng: marker.lon, sampledAtMs: marker.capturedAt,
      progressM: courseProgress(course, {lat: marker.lat, lon: marker.lon}),
      speedMps: typeof marker.speedMps === "number" && marker.speedMps >= 0 && marker.speedMps <= 100 ? marker.speedMps : null,
      powerWatts: powerLive ? marker.power! : null, powerExpiresAtMs: powerLive ? marker.powerExpiresAtMs! : null,
      gapToLeaderM: null, leaderGapExpiresAtMs: null, gapToSelectedM: null, selectedGapExpiresAtMs: null,
      status: ended ? prior.status : marker.eventStatus === "lost_signal" ? "LOST_SIGNAL" : marker.status === "paused" ? "STOPPED" : "RIDING",
    });
    changed = true;
  }
  if (!changed) return snapshot;
  return {...snapshot, locations: withGaps([...rows.values()], snapshot.selectedUid)};
}

function withGaps(rows: SpectatorRider[], selectedUid: string | null): SpectatorRider[] {
  const comparable = (r: SpectatorRider) => r.progressM !== null && r.status !== "FINISHED" && r.status !== "DNF";
  const ordered = [...rows].sort((a, b) => (comparable(b) ? b.progressM! : -1) - (comparable(a) ? a.progressM! : -1) || a.uid.localeCompare(b.uid));
  const leader = ordered.find(comparable);
  const selected = ordered.find(r => r.uid === selectedUid && comparable(r));
  return ordered.map(r => ({...r,
    gapToLeaderM: comparable(r) && leader ? leader.progressM! - r.progressM! : null,
    leaderGapExpiresAtMs: comparable(r) && leader ? Math.min(leader.sampledAtMs, r.sampledAtMs) + 30000 : null,
    gapToSelectedM: comparable(r) && selected ? selected.progressM! - r.progressM! : null,
    selectedGapExpiresAtMs: comparable(r) && selected ? Math.min(selected.sampledAtMs, r.sampledAtMs) + 30000 : null,
  }));
}
