import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

export interface GroupRideActivity {
  id: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  startTime: number;
  summary: {
    distance: number;
    ridingTimeMillis: number;
    elevationGain: number;
    relativeEffort: number | null;
  };
}

export interface GroupRideSummary {
  groupRideId: string;
  activities: GroupRideActivity[];
  startTime: number;
  participantCount: number;
  totalDistance: number;
}

export interface MemberRideStat {
  distance: number;
  rideCount: number;
  lastActivityAt: number;
}

interface RideStatsResponse {
  rides: GroupRideSummary[];
  memberStats: Record<string, MemberRideStat>;
  computedAt: number;
  cached: boolean;
  aggregate?: GroupRideAggregate;
}

export interface GroupRideAggregate {
  monthKey: string;
  monthlyDistance: number;
  lifetimeDistance: number;
  lifetimeRideCount: number;
  longestRideDistance: number;
}

export function normalizeGroupRideAggregate(value: unknown): GroupRideAggregate | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const numericKeys = ["monthlyDistance", "lifetimeDistance", "lifetimeRideCount", "longestRideDistance"] as const;
  if (typeof data.monthKey !== "string" || !/^\d{4}-\d{2}$/.test(data.monthKey)) return null;
  if (numericKeys.some((key) => typeof data[key] !== "number" || !Number.isFinite(data[key]) || data[key] < 0)) return null;
  return {
    monthKey: data.monthKey,
    monthlyDistance: data.monthlyDistance as number,
    lifetimeDistance: data.lifetimeDistance as number,
    lifetimeRideCount: data.lifetimeRideCount as number,
    longestRideDistance: data.longestRideDistance as number,
  };
}

export function useGroupRideStats(groupId: string | undefined) {
  const [rides, setRides] = useState<GroupRideSummary[]>([]);
  const [memberStats, setMemberStats] = useState<Record<string, MemberRideStat>>({});
  const [loading, setLoading] = useState(true);
  const [aggregate, setAggregate] = useState<GroupRideAggregate | null>(null);

  useEffect(() => {
    if (!groupId) {
      setRides([]);
      setMemberStats({});
      setLoading(false);
      setAggregate(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const fn = httpsCallable<{ groupId: string }, RideStatsResponse>(functions, "getGroupRideStats");
        const { data } = await fn({ groupId });
        if (cancelled) return;
        setRides(data.rides ?? []);
        setMemberStats(data.memberStats ?? {});
        setAggregate(normalizeGroupRideAggregate(data.aggregate));
      } catch (err) {
        if (cancelled) return;
        setRides([]);
        setMemberStats({});
        setAggregate(null);
        const code = (err as { code?: string } | null)?.code;
        if (code !== "functions/permission-denied" && code !== "permission-denied") {
          logClientError("useGroupRideStats", err, { groupId });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return { rides, memberStats, aggregate, loading };
}
