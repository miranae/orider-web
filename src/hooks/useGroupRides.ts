import { useCallback, useEffect, useRef, useState } from "react";
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
  averageRidingTimeMillis?: number;
  averageElevationGain?: number;
}

export interface GroupRideCursor { startTime: number; groupRideId: string }
export interface GroupWeekStats {
  totalDistance: number;
  totalTime: number;
  totalElevation: number;
  rideCount: number;
  activeMembers: number;
}
export interface GroupMemberWeekStat { distance: number; elevation: number; time: number; tss: number }

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
  nextCursor?: GroupRideCursor | null;
  weeklyStats?: GroupWeekStats;
  memberWeekStats?: Record<string, GroupMemberWeekStat>;
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
  const [weeklyStats, setWeeklyStats] = useState<GroupWeekStats | null>(null);
  const [memberWeekStats, setMemberWeekStats] = useState<Record<string, GroupMemberWeekStat> | null>(null);
  const [nextCursor, setNextCursor] = useState<GroupRideCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const loadMore = useCallback(async () => {
    if (!groupId || !nextCursor || loadingMore) return;
    const requestedGroup = groupId;
    const requestedGeneration = generation.current;
    setLoadingMore(true);
    try {
      const fn = httpsCallable<{ groupId: string; pageSize: number; cursor: GroupRideCursor }, RideStatsResponse>(functions, "getGroupRideStats");
      const { data } = await fn({ groupId, pageSize: 20, cursor: nextCursor });
      if (generation.current !== requestedGeneration || requestedGroup !== groupId) return;
      setRides((previous) => {
        const existing = new Set(previous.map((ride) => ride.groupRideId));
        return [...previous, ...(data.rides ?? []).filter((ride) => !existing.has(ride.groupRideId))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      if (generation.current === requestedGeneration) logClientError("useGroupRideStats.loadMore", error, { groupId });
    } finally {
      if (generation.current === requestedGeneration) setLoadingMore(false);
    }
  }, [groupId, loadingMore, nextCursor]);

  useEffect(() => {
    generation.current += 1;
    if (!groupId) {
      setRides([]);
      setMemberStats({});
      setLoading(false);
      setAggregate(null);
      setWeeklyStats(null);
      setMemberWeekStats(null);
      setNextCursor(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setRides([]);
    setNextCursor(null);

    (async () => {
      try {
        const fn = httpsCallable<{ groupId: string; pageSize: number }, RideStatsResponse>(functions, "getGroupRideStats");
        const { data } = await fn({ groupId, pageSize: 20 });
        if (cancelled) return;
        setRides(data.rides ?? []);
        setMemberStats(data.memberStats ?? {});
        setAggregate(normalizeGroupRideAggregate(data.aggregate));
        setWeeklyStats(data.weeklyStats ?? null);
        setMemberWeekStats(data.memberWeekStats ?? null);
        setNextCursor(data.nextCursor ?? null);
      } catch (err) {
        if (cancelled) return;
        setRides([]);
        setMemberStats({});
        setAggregate(null);
        setWeeklyStats(null);
        setMemberWeekStats(null);
        setNextCursor(null);
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

  return { rides, memberStats, aggregate, weeklyStats, memberWeekStats, loading, loadingMore, hasMore: nextCursor !== null, loadMore };
}
