import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useEffect, useState } from "react";
import { getVisibleEventPage } from "../services/eventDiscovery";
import { logClientError } from "../services/errorLogger";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";

export interface NextEventInfo {
  id: string;
  groupId: string;
  name: string;
  startTime: number;
  /** 클럽 모임이면 모임 상세(`/club/:id/meetings/:eventId`), 아니면 이벤트 상세로 간다. */
  meeting: boolean;
  /** 응답에 담긴 서버 참가 집계(counters.totalRegistered). 없으면 null — 화면에서 세지 않는다. */
  registered: number | null;
}

function toMillis(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const a = v as { _seconds?: number; seconds?: number; toMillis?: () => number };
    if (typeof a.toMillis === "function") return a.toMillis();
    if (typeof a._seconds === "number") return a._seconds * 1000;
    if (typeof a.seconds === "number") return a.seconds * 1000;
  }
  return 0;
}

export function formatNextLabel(ts: number, name: string, locale: string): string {
  if (!ts) return name;
  return `${new Date(ts).toLocaleString(locale, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} · ${name}`;
}

export function isEligibleNextEvent(info: Record<string, unknown>, publicOnly: boolean, serverAuthorized = false): boolean {
  return !publicOnly || (info.deletedAt == null && info.kind !== "CLUB_MEETING" && (info.visibility === "PUBLIC" || (serverAuthorized && (info.visibility == null || info.visibility === "GROUP"))));
}

/**
 * 그룹별 가장 가까운 OPEN/LIVE 이벤트 1건씩 묶어 반환.
 * 클럽마다 서버 목록 조회 한 번(최대 250건). 끝까지 못 읽은 클럽은 전체 목록으로 이어 보게 한다.
 */
export function useGroupNextEvents(groupIds: string[], excludeEventId?: string, publicOnly = false) {
  const services = useFirebaseServices();
  const { t, i18n } = useTranslation("group");
  const [byGroup, setByGroup] = useState<Map<string, string>>(new Map());
  const [eventByGroup, setEventByGroup] = useState<Map<string, NextEventInfo>>(new Map());
  const [loading, setLoading] = useState(false);
  const [incompleteGroups, setIncompleteGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIncompleteGroups(new Set());
    if (groupIds.length === 0) {
      setByGroup(new Map());
      setEventByGroup(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setByGroup(new Map());
      setEventByGroup(new Map());
      try {
        const map = new Map<string, NextEventInfo>();
        const uniqueGroupIds = [...new Set(groupIds)];
        const incomplete = new Set<string>();
        // 클럽별 다음 모임은 서버가 지원하는 목록 조회(listVisibleEventEnvelopes)로 읽는다. 시작 시각 오름차순이라
        // 첫 읽을 수 있는 행이 다음 모임이다. 묶음 조회(getGroupNextEvents)는 서버에서 지웠다(orider-g1-web #3835).
        const snapshots = await Promise.all(uniqueGroupIds.map(async groupId => {
          const page = await getVisibleEventPage({ groupId, publicOnly, statuses: ["OPEN", "LIVE"], limit: 250 }, services);
          if (page.nextCursor) incomplete.add(groupId);
          return page;
        }));

        snapshots.forEach((snap) => {
          snap.docs.forEach((doc) => {
            if (doc.id === excludeEventId) return;
            const d = doc.data();
            const info = d.info ?? {};
            if (!isEligibleNextEvent(info, publicOnly, true)) return;
            if (info.status !== "OPEN" && info.status !== "LIVE") return;
            const groupId: string = info.groupId ?? "";
            if (!uniqueGroupIds.includes(groupId)) return;
            const startTime = toMillis(info.startTime);
            const name = info.name ?? t("dashboard.fallbackEventName");
            const existing = map.get(groupId);
            if (!existing || startTime < existing.startTime) {
              const registered = d.counters?.totalRegistered;
              map.set(groupId, { id: doc.id, groupId, name, startTime, meeting: info.kind === "CLUB_MEETING", registered: typeof registered === "number" ? registered : null });
            }
          });
        });
        if (cancelled) return;
        setIncompleteGroups(new Set([...incomplete].filter(groupId => !map.has(groupId))));
        const labels = new Map<string, string>();
        map.forEach((v, k) => labels.set(k, formatNextLabel(v.startTime, v.name, localeTag())));
        setByGroup(labels);
        setEventByGroup(map);
      } catch (err) {
        // 인덱스/규칙 문제 시 조용히 실패
        logClientError("useGroupNextEvents.load", err, { count: groupIds.length });
        if (!cancelled) setByGroup(new Map());
        if (!cancelled) setEventByGroup(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [excludeEventId, groupIds.join("|"), i18n.language, publicOnly, t, services]);

  return { byGroup, eventByGroup, incompleteGroups, loading };
}
