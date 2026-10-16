import { useRef, useState, useEffect, useCallback } from "react";
import {
  doc, collection, query, onSnapshot, getDoc, getDocs, where, orderBy, limit as firestoreLimit,
} from "firebase/firestore";
import { auth, firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { getPublicUserProfile, type PublicUserProfile } from "../services/publicProfiles";
import type { Group, GroupMember, GroupMemberRole } from "@shared/types";

export interface GroupMemberWithProfile extends GroupMember {
  id: string;
  profile: PublicUserProfile | null;
}

// 그룹 메타데이터 실시간 구독
export function useGroup(groupId: string | undefined, accessKey?: string) {
  const [group, setGroup] = useState<Group | null>(null);
  const [inactive, setInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!groupId) {
      setGroup(null);
      setLoading(false);
      setError(null);
      setInactive(false);
      return;
    }
    setGroup(null);
    setLoading(true);
    setError(null);
    setInactive(false);
    return onSnapshot(doc(firestore, "groups", groupId), { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata?.fromCache === true && !snap.exists()) {
        setError(new Error("Club document could not be confirmed with the server"));
        setGroup(null);
        setInactive(false);
        setLoading(false);
        return;
      }
      setError(null);
      if (snap.exists()) {
        const nextGroup = { id: snap.id, ...snap.data() } as Group;
        if (nextGroup.isActive === false) {
          setInactive(true);
          setGroup(null);
        } else {
          setInactive(false);
          setGroup(nextGroup);
        }
      } else {
        setInactive(false);
        setGroup(null);
      }
      setLoading(false);
    }, (err) => {
      setError(err);
      setGroup(null);
      setInactive(false);
      setLoading(false);
    });
  }, [groupId, accessKey, attempt]);

  return { group, loading, error, inactive, retry };
}

/** Subscribe only to the signed-in user's membership document for role gates. */
export function useGroupMemberRole(groupId: string | undefined, userId: string | undefined) {
  const [role, setRole] = useState<GroupMemberRole | null>(null);
  const [loading, setLoading] = useState(!!groupId && !!userId);

  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!groupId || !userId) {
      setRole(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setRole(null);
    setError(null);
    setLoading(true);
    const unsubscribe = onSnapshot(doc(firestore, "groups", groupId, "members", userId), { includeMetadataChanges: true }, (snap) => {
      if (cancelled) return;
      if (snap.metadata?.fromCache === true && !snap.exists()) {
        setRole(null);
        setError(new Error("Club membership could not be confirmed with the server"));
        setLoading(false);
        return;
      }
      setError(null);
      const data = snap.exists() ? snap.data() : null;
      // Legacy active memberships omit role; the server treats only nullish roles as member.
      const value = data?.role ?? "member";
      const isActive = data && ["active", "approved"].includes(String(data.status ?? ""));
      setRole(isActive && (value === "owner" || value === "leader" || value === "co-leader" || value === "member") ? value : null);
      setLoading(false);
    }, (err) => {
      if (cancelled) return;
      logClientError("useGroupMemberRole.snapshot", err, { groupId, userId });
      setRole(null);
      setError(err);
      setLoading(false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [groupId, userId, attempt]);

  return { role, loading, error, retry };
}

// 그룹 멤버 목록 + 프로필 조회
export function useGroupMembers(groupId: string | undefined, maxCount?: number, accessKey?: string) {
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const snapshotEpochRef = useRef(0);
  const uid = auth.currentUser?.uid;
  const scope = `${groupId ?? ""}:${accessKey ?? ""}:${uid ?? ""}`;
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current !== scope || !groupId) { setMembers([]); scopeRef.current = scope; }
    setError(null);
    if (!groupId) { setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    const q = maxCount
      ? query(collection(firestore, "groups", groupId, "members"), firestoreLimit(maxCount))
      : query(collection(firestore, "groups", groupId, "members"));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, async snap => {
      const epoch = ++snapshotEpochRef.current;
      if (snap.metadata?.fromCache === true && snap.docs.length === 0) {
        if (!cancelled) { setError(new Error("Club members could not be confirmed with the server")); setLoading(false); }
        return;
      }
      const rows = await Promise.all(snap.docs.map(async memberDoc => {
        const member = { id: memberDoc.id, ...memberDoc.data(), profile: null as PublicUserProfile | null } as GroupMemberWithProfile;
        try { member.profile = await getPublicUserProfile(member.id); }
        catch (reason) { logClientError("useGroupMembers.profile", reason, {groupId,userId:member.id}); }
        return member;
      }));
      if (cancelled || epoch !== snapshotEpochRef.current) return;
      setMembers(rows);
      setError(snap.metadata?.fromCache === true ? new Error("Club members could not be confirmed with the server") : null);
      setLoading(false);
    }, reason => {
      if (cancelled) return;
      snapshotEpochRef.current += 1;
      logClientError("useGroupMembers.snapshot", reason, {groupId});
      setError(reason); setLoading(false);
    });
    return () => { cancelled = true; unsub(); };
  }, [groupId, maxCount, accessKey, uid, scope, attempt]);
  return { members, loading, error, retry: () => setAttempt(value => value + 1) };
}

// 내 그룹 목록: 빠른 조회 인덱스, 사용자 현재 그룹, creator 관계를 함께 조회한다.
export function useMyGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const ownerRef = useRef(userId);

  useEffect(() => {
    if (ownerRef.current !== userId) { setGroups([]); ownerRef.current = userId; }
    if (!userId) {
      setGroups([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      const [indexResult, currentGroupResult, creatorResult] = await Promise.allSettled([
        getDocs(collection(firestore, "user_groups", userId, "groups")),
        getDoc(doc(firestore, "users", userId)),
        getDocs(query(collection(firestore, "groups"), where("creatorId", "==", userId))),
      ]);
      if (cancelled) return;

      let cacheError: Error | null = [indexResult, currentGroupResult, creatorResult].some(
        result => result.status === "fulfilled" && result.value.metadata?.fromCache === true,
      ) ? new Error("Club list could not be confirmed with the server") : null;
      const partialFailures: Array<{ source: string; reason: unknown }> = [];
      if (indexResult.status === "rejected") partialFailures.push({ source: "index", reason: indexResult.reason });
      if (currentGroupResult.status === "rejected") partialFailures.push({ source: "currentGroup", reason: currentGroupResult.reason });
      if (creatorResult.status === "rejected") partialFailures.push({ source: "creator", reason: creatorResult.reason });

      const groupsById = new Map<string, Group>();
      if (creatorResult.status === "fulfilled") {
        creatorResult.value.docs.forEach((groupDoc) => {
          const data = groupDoc.data();
          if (data.isActive !== false) groupsById.set(groupDoc.id, { id: groupDoc.id, ...data } as Group);
        });
      }

      // 그룹 문서들 조회 (10개씩 in 쿼리)
      let discoveredGroupsLoaded = false;
      let discoveryError: unknown = null;
      const currentGroupId = currentGroupResult.status === "fulfilled" && currentGroupResult.value.exists()
        ? currentGroupResult.value.data().currentGroupId
        : null;
      const validCurrentGroupId = typeof currentGroupId === "string" && currentGroupId ? currentGroupId : null;
      const discoverySourceLoaded = indexResult.status === "fulfilled" || validCurrentGroupId !== null;
      if (discoverySourceLoaded) {
        const groupIds = new Set(
          indexResult.status === "fulfilled" ? indexResult.value.docs.map((membership) => membership.id) : [],
        );
        if (validCurrentGroupId) groupIds.add(validCurrentGroupId);
        const discoveredGroupIds = [...groupIds];
        const chunkResults = await Promise.allSettled(
          Array.from({ length: Math.ceil(discoveredGroupIds.length / 10) }, (_, chunkIndex) => {
            const chunk = discoveredGroupIds.slice(chunkIndex * 10, chunkIndex * 10 + 10);
            return getDocs(query(collection(firestore, "groups"), where("__name__", "in", chunk)));
          }),
        );
        if (cancelled) return;
        discoveredGroupsLoaded = chunkResults.every((result) => result.status === "fulfilled");
        discoveryError = chunkResults.find((result) => result.status === "rejected")?.reason ?? null;
        chunkResults.forEach((result) => {
          if (result.status === "rejected") {
            partialFailures.push({ source: "discoveredChunk", reason: result.reason });
            return;
          }
          if (result.value.metadata?.fromCache === true) cacheError ??= new Error("Club list could not be confirmed with the server");
          result.value.docs.forEach((groupDoc) => {
            const data = groupDoc.data();
            if (data.isActive !== false) groupsById.set(groupDoc.id, { id: groupDoc.id, ...data } as Group);
          });
        });
      }

      if (cacheError && groupsById.size === 0) throw cacheError;
      if (!discoveredGroupsLoaded && groupsById.size === 0) {
        throw discoveryError ?? (indexResult.status === "rejected"
          ? indexResult.reason
          : currentGroupResult.status === "rejected"
            ? currentGroupResult.reason
            : creatorResult.status === "rejected"
              ? creatorResult.reason
              : new Error("Failed to resolve indexed groups"));
      }
      if (cancelled) return;
      partialFailures.forEach(({ source, reason }) => {
        logClientError("useMyGroups.partial", reason, { userId, source });
      });
      setError(cacheError);
      setGroups(previous => cacheError
        ? [...new Map([...previous, ...groupsById.values()].map(group => [group.id, group])).values()]
        : [...groupsById.values()]);
      setLoading(false);
    };

    void load().catch((err) => {
      if (cancelled) return;
      logClientError("useMyGroups.load", err, { userId });
      setError(err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  return { groups, loading, error, retry: () => setReloadKey((key) => key + 1) };
}

// 공개 그룹 검색
export function usePublicGroups(options: { searchText?: string; discipline?: "ALL" | "bike" | "run" | "swim" | "tri"; city?: string; maxCount?: number; enabled?: boolean } = {}) {
  const { searchText = "", discipline = "ALL", city = "", maxCount = 30, enabled = true } = options;
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const queryKey = JSON.stringify([city, discipline, enabled, maxCount, searchText]);
  const queryKeyRef = useRef(queryKey);

  useEffect(() => {
    if (queryKeyRef.current !== queryKey) { setGroups([]); queryKeyRef.current = queryKey; }
    if (!enabled) {
      setGroups([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const trimmed = searchText.trim();
    const constraints = [
      where("visibility", "==", "public"),
      where("isActive", "==", true),
      where("toggles.showInDirectory", "==", true),
      ...(discipline !== "ALL" ? [where("discipline", "==", discipline)] : []),
      ...(city.trim() ? [where("city", "==", city.trim())] : []),
      ...(trimmed ? [where("name", ">=", trimmed), where("name", "<=", `${trimmed}\uf8ff`), orderBy("name")] : []),
      firestoreLimit(maxCount),
    ];
    const q = query(collection(firestore, "groups"), ...constraints);
    getDocs(q).then((snap) => {
      if (cancelled) return;
      const fromCache = snap.metadata?.fromCache === true;
      const cacheError = fromCache ? new Error("Public clubs could not be confirmed with the server") : null;
      if (cacheError && snap.docs.length === 0) throw cacheError;
      setError(cacheError);
      const nextGroups = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Group);
      setGroups(previous => fromCache
        ? [...new Map([...previous, ...nextGroups].map(group => [group.id, group])).values()]
        : nextGroups);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      logClientError("usePublicGroups.load", err, {});
      setError(err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [city, discipline, enabled, maxCount, reloadKey, searchText, queryKey]);

  return { groups, loading, error, retry: () => setReloadKey((key) => key + 1) };
}
