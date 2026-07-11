import { useEffect, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { Group } from "@shared/types";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

export interface GroupChallengeStanding {
  rank: number;
  groupId: string;
  name: string;
  badge: string | null;
  distanceKm: number;
  goalKm: number | null;
}

export interface GroupChallenge {
  id: string;
  name: string;
  monthKey: string;
  participantGroupIds: string[];
  standings: GroupChallengeStanding[];
  computedAt: number;
}

export interface GroupChallengeProgress {
  distanceKm: number;
  goalKm: number | null;
  percent: number | null;
  remainingKm: number | null;
  completed: boolean;
}

/** Normalize untrusted callable values before rendering progress UI. */
export function getGroupChallengeProgress(distanceKm: unknown, goalKm: unknown): GroupChallengeProgress {
  const distance = typeof distanceKm === "number" && Number.isFinite(distanceKm)
    ? Math.max(0, distanceKm)
    : 0;
  const goal = typeof goalKm === "number" && Number.isFinite(goalKm) && goalKm > 0
    ? goalKm
    : null;
  if (goal === null) return { distanceKm: distance, goalKm: null, percent: null, remainingKm: null, completed: false };
  return {
    distanceKm: distance,
    goalKm: goal,
    percent: Math.min(100, Math.max(0, (distance / goal) * 100)),
    remainingKm: Math.max(0, goal - distance),
    completed: distance >= goal,
  };
}

export function getVisibleChallengeStandings(
  standings: GroupChallengeStanding[],
  selectedGroupId: string,
  limitCount = 5,
): GroupChallengeStanding[] {
  const leaders = standings.slice(0, Math.max(0, limitCount));
  const selected = standings.find((standing) => standing.groupId === selectedGroupId);
  return selected && !leaders.some((standing) => standing.groupId === selected.groupId)
    ? [...leaders, selected]
    : leaders;
}

interface StandingsResponse {
  challengeId: string;
  name: string;
  monthKey: string;
  metric: "distance_km";
  standings: GroupChallengeStanding[];
  computedAt: number;
}

export function currentKstMonthKey(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1_000).toISOString().slice(0, 7);
}

export async function createGroupChallenge(input: { groupId: string; name: string }): Promise<string> {
  const fn = httpsCallable<typeof input, { challengeId: string }>(functions, "createGroupChallenge");
  const { data } = await fn({ groupId: input.groupId, name: input.name.trim() });
  return data.challengeId;
}

export async function joinGroupChallenge(input: { challengeId: string; groupId: string }): Promise<void> {
  const fn = httpsCallable<typeof input, { success: true }>(functions, "joinGroupChallenge");
  await fn(input);
}

export async function getGroupChallengeStandings(challengeId: string): Promise<StandingsResponse> {
  const fn = httpsCallable<{ challengeId: string }, StandingsResponse>(functions, "getGroupChallengeStandings");
  return (await fn({ challengeId })).data;
}

export function useManagedGroups(userId: string | undefined, groups: Group[]) {
  const [managedGroups, setManagedGroups] = useState<Group[]>([]);

  useEffect(() => {
    if (!userId || groups.length === 0) {
      setManagedGroups([]);
      return;
    }
    let cancelled = false;
    void Promise.all(groups.map(async (group) => {
      if (group.creatorId === userId) return group;
      const membership = await getDoc(doc(firestore, "groups", group.id, "members", userId));
      const data = membership.data();
      return membership.exists()
        && ["active", "approved"].includes(String(data?.status ?? ""))
        && ["leader", "co-leader"].includes(String(data?.role ?? ""))
        ? group : null;
    })).then((results) => {
      if (!cancelled) setManagedGroups(results.filter((group): group is Group => group !== null));
    }).catch((err) => {
      if (!cancelled) setManagedGroups(groups.filter((group) => group.creatorId === userId));
      logClientError("useManagedGroups", err, { userId });
    });
    return () => { cancelled = true; };
  }, [groups, userId]);

  return managedGroups;
}

export function useGroupChallenges() {
  const [challenges, setChallenges] = useState<GroupChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let epoch = 0;
    return onSnapshot(
      query(collection(firestore, "group_challenges"), where("status", "==", "OPEN"), limit(20)),
      (snapshot) => {
        const currentEpoch = ++epoch;
        setLoading(true);
        const currentMonth = currentKstMonthKey();
        const currentDocs = snapshot.docs.filter((challengeDoc) => challengeDoc.data().monthKey === currentMonth);
        void Promise.all(currentDocs.map(async (challengeDoc) => {
          const raw = challengeDoc.data();
          const standings = await getGroupChallengeStandings(challengeDoc.id);
          return {
            id: challengeDoc.id,
            name: standings.name,
            monthKey: standings.monthKey,
            participantGroupIds: Array.isArray(raw.participantGroupIds)
              ? raw.participantGroupIds.filter((id): id is string => typeof id === "string") : [],
            standings: standings.standings,
            computedAt: standings.computedAt,
          };
        })).then((items) => {
          if (epoch === currentEpoch) {
            setChallenges(items.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5));
            setLoading(false);
          }
        }).catch((err) => {
          if (epoch === currentEpoch) {
            setChallenges([]);
            setLoading(false);
          }
          logClientError("useGroupChallenges.standings", err, {});
        });
      },
      (err) => {
        setChallenges([]);
        setLoading(false);
        logClientError("useGroupChallenges.snapshot", err, {});
      },
    );
  }, []);

  return { challenges, loading };
}
