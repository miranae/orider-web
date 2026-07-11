import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useTranslation } from "react-i18next";
import { localeTag } from "../utils/localeDate";

export interface NextEventInfo {
  id: string;
  groupId: string;
  name: string;
  startTime: number;
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

export function isEligibleNextEvent(info: Record<string, unknown>, publicOnly: boolean): boolean {
  return !publicOnly || info.visibility === "PUBLIC";
}

/**
 * 그룹별 가장 가까운 OPEN/LIVE 이벤트 1건씩 묶어 반환.
 * Firestore in-clause 한도(10) 단위로 chunk 쿼리.
 */
export function useGroupNextEvents(groupIds: string[], excludeEventId?: string, publicOnly = false) {
  const { t, i18n } = useTranslation("group");
  const [byGroup, setByGroup] = useState<Map<string, string>>(new Map());
  const [eventByGroup, setEventByGroup] = useState<Map<string, NextEventInfo>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (groupIds.length === 0) {
      setByGroup(new Map());
      setEventByGroup(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const map = new Map<string, NextEventInfo>();
        for (let i = 0; i < groupIds.length; i += 10) {
          const chunk = groupIds.slice(i, i + 10);
          const q = query(
            collection(firestore, "events"),
            where("info.groupId", "in", chunk),
            where("info.status", "in", ["OPEN", "LIVE"]),
            orderBy("info.startTime", "asc"),
          );
          const snap = await getDocs(q);
          snap.forEach((doc) => {
            if (doc.id === excludeEventId) return;
            const d = doc.data();
            const info = d.info ?? {};
            if (!isEligibleNextEvent(info, publicOnly)) return;
            const groupId: string = info.groupId ?? "";
            const startTime = toMillis(info.startTime);
            const name = info.name ?? t("dashboard.fallbackEventName");
            const existing = map.get(groupId);
            if (!existing || startTime < existing.startTime) {
              map.set(groupId, { id: doc.id, groupId, name, startTime });
            }
          });
        }
        if (cancelled) return;
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
  }, [excludeEventId, groupIds.join("|"), i18n.language, publicOnly, t]);

  return { byGroup, eventByGroup, loading };
}
