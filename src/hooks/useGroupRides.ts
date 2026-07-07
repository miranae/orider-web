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
}

export function useGroupRideStats(groupId: string | undefined) {
  const [rides, setRides] = useState<GroupRideSummary[]>([]);
  const [memberStats, setMemberStats] = useState<Record<string, MemberRideStat>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setRides([]);
      setMemberStats({});
      setLoading(false);
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
      } catch (err) {
        if (cancelled) return;
        setRides([]);
        setMemberStats({});
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

  return { rides, memberStats, loading };
}
