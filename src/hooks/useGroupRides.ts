import { useState, useEffect } from "react";
import {
  collection, query, where, orderBy, getDocs, limit as firestoreLimit,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { Activity } from "@shared/types";

export interface GroupRideSummary {
  groupRideId: string;
  activities: Activity[];
  startTime: number;
  participantCount: number;
  totalDistance: number;
}

export function useGroupRides(memberIds: string[], pageSize = 20) {
  const [rides, setRides] = useState<GroupRideSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRides = async () => {
      if (memberIds.length === 0) {
        setRides([]);
        setLoading(false);
        return;
      }
      setLoading(true);

      try {
        const allActivities: Activity[] = [];
        for (let i = 0; i < memberIds.length; i += 10) {
          const chunk = memberIds.slice(i, i + 10);
          const q = query(
            collection(firestore, "activities"),
            where("userId", "in", chunk),
            orderBy("startTime", "desc"),
            firestoreLimit(pageSize * 3),
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...d.data() } as Activity;
            if (data.groupRideId && !data.deletedAt) {
              allActivities.push(data);
            }
          });
        }

        const rideMap = new Map<string, Activity[]>();
        allActivities.forEach((a) => {
          if (!a.groupRideId) return;
          const existing = rideMap.get(a.groupRideId) ?? [];
          existing.push(a);
          rideMap.set(a.groupRideId, existing);
        });

        // 이 그룹 멤버 2명 이상이 참여한 라이드만 표시
        const memberIdSet = new Set(memberIds);
        const newRides: GroupRideSummary[] = Array.from(rideMap.entries())
          .filter(([, acts]) => {
            const uniqueMembers = new Set(acts.map((a) => a.userId).filter((uid) => memberIdSet.has(uid)));
            return uniqueMembers.size >= 2;
          })
          .map(([id, acts]) => ({
            groupRideId: id,
            activities: acts.sort((a, b) => a.startTime - b.startTime),
            startTime: Math.min(...acts.map((a) => a.startTime)),
            participantCount: acts.length,
            totalDistance: acts.reduce((sum, a) => sum + a.summary.distance, 0),
          })).sort((a, b) => b.startTime - a.startTime);

        setRides(newRides);
      } catch (err) {
        logClientError("useGroupRides.fetchRides", err, { memberCount: memberIds.length });
      }
      setLoading(false);
    };

    fetchRides();
     
  }, [memberIds.join(",")]);

  return { rides, loading };
}
