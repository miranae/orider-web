import { resolveMyGroupSummaries, isGroupReadPermissionDenied } from "../services/groupSummaries";
import { usePublicClubDirectory } from "./usePublicClubDirectory";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  doc, collection, query, onSnapshot, getDoc, getDocs, where, limit as firestoreLimit,
} from "firebase/firestore";
// 임베드는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 인스턴스(#847).
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import { getPublicUserProfiles, type PublicUserProfile } from "../services/publicProfiles";
import type { Group, GroupMember, GroupMemberRole } from "@shared/types";

export interface GroupMemberWithProfile extends GroupMember {
  id: string;
  profile: PublicUserProfile | null;
}

// 그룹 메타데이터 실시간 구독
export function useGroup(groupId: string | undefined, accessKey?: string) {
  const services = useFirebaseServices();
  const { firestore } = services;
  const viewerUid = services.auth.currentUser?.uid;
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
    let cancelled = false;
    const unsubscribe = onSnapshot(doc(firestore, "groups", groupId), { includeMetadataChanges: true }, (snap) => {
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
      if (isGroupReadPermissionDenied(err)) {
        void resolveMyGroupSummaries(services, [groupId]).then(groups => {
          if (cancelled) return;
          const resolved = groups.find(group => group.id === groupId);
          const inactive = resolved?.isActive === false;
          setGroup(inactive ? null : resolved ?? null);
          setError(resolved ? null : err);
          setInactive(inactive);
          setLoading(false);
        }).catch(error => {
          // The resolver records failures even when the old surface has been closed.
          if (cancelled) return;
          setGroup(null); setError(error); setInactive(false); setLoading(false);
        });
        return;
      }
      logClientError("useGroup.snapshot", err, { groupId }, services);
      if (cancelled) return;
      setError(err);
      setGroup(null);
      setInactive(false);
      setLoading(false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [firestore, services, viewerUid, groupId, accessKey, attempt]);

  return { group, loading, error, inactive, retry };
}

/** Subscribe only to the signed-in user's membership document for role gates. */
export function useGroupMemberRole(groupId: string | undefined, userId: string | undefined, creatorId?: string) {
  const { firestore } = useFirebaseServices();
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
      // Display callers may supply the canonical creator; active membership remains required.
      // Permission callers omit this argument and retain the existing member fallback.
      const value = data?.role ?? (creatorId === userId ? "leader" : "member");
      const isActive = data && ["active", "approved"].includes(String(data.status ?? ""));
      // 회원 판정은 서버 규칙과 같다 — active/approved 회원 문서면 역할 값과 관계없이 회원이다.
      // 알 수 없는 역할은 운영 권한 없이 일반 회원으로 본다(방문자로 떨어뜨리지 않는다).
      const knownRole = value === "owner" || value === "leader" || value === "co-leader" || value === "member";
      setRole(isActive ? (knownRole ? value : "member") : null);
      setLoading(false);
    }, (err) => {
      if (cancelled) return;
      logClientError("useGroupMemberRole.snapshot", err, { groupId, userId });
      setRole(null);
      setError(err);
      setLoading(false);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [firestore, groupId, userId, creatorId, attempt]);

  return { role, loading, error, retry };
}

// 그룹 멤버 목록 + 프로필 조회
export function useGroupMembers(groupId: string | undefined, maxCount?: number, accessKey?: string) {
  const services = useFirebaseServices();
  const { auth, firestore } = services;
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
    const profiles = new Map<string, { profile: PublicUserProfile | null; expires: number }>();
    let pending: { key: string; promise: ReturnType<typeof getPublicUserProfiles> } | null = null;
    const q = maxCount
      ? query(collection(firestore, "groups", groupId, "members"), firestoreLimit(maxCount))
      : query(collection(firestore, "groups", groupId, "members"));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, async snap => {
      const epoch = ++snapshotEpochRef.current;
      if (snap.metadata?.fromCache === true && snap.docs.length === 0) {
        if (!cancelled) { setError(new Error("Club members could not be confirmed with the server")); setLoading(false); }
        return;
      }
      const currentIds = new Set(snap.docs.map(doc => doc.id));
      for (const id of profiles.keys()) if (!currentIds.has(id)) profiles.delete(id);
      const missing = [...currentIds].filter(id => !profiles.has(id) || profiles.get(id)!.expires <= Date.now()).sort();
      let fetched: Map<string, PublicUserProfile> | null = null;
      if (missing.length) {
        const key = JSON.stringify(missing);
        if (pending?.key !== key) pending = { key, promise: getPublicUserProfiles(missing, firestore, services, { onReadError: (userId, reason) => logClientError("useGroupMembers.profile", reason, { groupId, userId }, services) }) };
        try { fetched = await pending.promise; }
        catch (reason) { logClientError("useGroupMembers.profiles", reason, { groupId, count: missing.length }, services); }
        if (pending?.key === key) pending = null;
      }
      if (cancelled || epoch !== snapshotEpochRef.current) return;
      for (const id of missing) {
        if (fetched?.has(id)) profiles.set(id, { profile: fetched.get(id)!, expires: Date.now() + 60_000 });
        else profiles.delete(id);
      }
      const rows = snap.docs.map(memberDoc => ({ id: memberDoc.id, ...memberDoc.data(), profile: profiles.get(memberDoc.id)?.profile ?? null } as GroupMemberWithProfile));
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
  }, [services, firestore, groupId, maxCount, accessKey, uid, scope, attempt]);
  return { members, loading, error, retry: () => setAttempt(value => value + 1) };
}

/** 가입 회원으로 보는 회원 문서 상태 — 역할 문자열과 무관하게 이 상태면 회원이다. */
function isActiveMembershipStatus(status: unknown): boolean {
  return ["active", "approved"].includes(String(status ?? ""));
}

// 내 그룹 목록: 빠른 조회 인덱스, 사용자 현재 그룹, creator 관계로 후보를 찾고 정본 회원 문서로 확정한다.
export function useMyGroups(userId: string | undefined) {
  const services = useFirebaseServices();
  const { firestore } = services;
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // 일부 조회(색인·현재 클럽·생성자·클럽 묶음)가 실패해 목록에 빠진 가입 클럽이 있을 수 있다.
  // 이때 목록 밖 클럽을 '미가입'으로 확정하지 않는다.
  const [incomplete, setIncomplete] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const ownerRef = useRef(userId);

  useEffect(() => {
    if (ownerRef.current !== userId) { setGroups([]); ownerRef.current = userId; }
    if (!userId) {
      setGroups([]);
      setError(null);
      setIncomplete(false);
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
          Array.from({ length: Math.ceil(discoveredGroupIds.length / 10) }, async (_, chunkIndex) => {
            const chunk = discoveredGroupIds.slice(chunkIndex * 10, chunkIndex * 10 + 10);
            try {
              return await getDocs(query(collection(firestore, "groups"), where("__name__", "in", chunk)));
            } catch (error) {
              if (!isGroupReadPermissionDenied(error)) throw error;
              const groups = await resolveMyGroupSummaries(services, chunk);
              return { docs: groups.map(({ id, ...data }) => ({ id, data: () => data })), metadata: { fromCache: false } };
            }
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

      // 세 출처는 후보 발견에만 쓴다 — 가입 목록은 현재 정본 회원 문서가 active/approved 인 클럽만(#1589).
      // 탈퇴·강퇴 뒤 남은 색인·현재 클럽 포인터나, 리더를 넘기고 나간 생성자는 여기서 빠진다.
      // 회원 조회 실패는 비회원 확정이 아니다 — 목록에서는 빼되 incomplete 로 남겨 가입 버튼을 다시 열지 않는다.
      const membershipResults = await Promise.all([...groupsById.keys()].map(async (groupId) => {
        try {
          return { groupId, result: { status: "fulfilled" as const, value: await getDoc(doc(firestore, "groups", groupId, "members", userId)) } };
        } catch (reason) {
          return { groupId, result: { status: "rejected" as const, reason } };
        }
      }));
      if (cancelled) return;
      // 서버가 비회원으로 확인한 클럽 — 캐시 병합에서도 이전 목록으로 되살리지 않는다.
      const confirmedNonMembers = new Set<string>();
      let membershipError: unknown = null;
      membershipResults.forEach(({ groupId, result }) => {
        if (result.status === "rejected") {
          groupsById.delete(groupId);
          membershipError ??= result.reason;
          partialFailures.push({ source: "membership", reason: result.reason });
          return;
        }
        const fromCache = result.value.metadata?.fromCache === true;
        if (fromCache) cacheError ??= new Error("Club list could not be confirmed with the server");
        if (!isActiveMembershipStatus(result.value.exists() ? result.value.data()?.status : null)) {
          groupsById.delete(groupId);
          if (!fromCache) confirmedNonMembers.add(groupId);
        }
      });
      // 서버가 비회원으로 확인한 클럽은 아래에서 오류로 끝나더라도(캐시·조회 실패) 기존 목록에서 먼저 뺀다 —
      // 마지막 클럽에서 탈퇴하면 목록이 비어 오류 경로로 가고, 그때 이전 목록이 그대로 남았다.
      if (confirmedNonMembers.size > 0) setGroups(previous => previous.filter(group => !confirmedNonMembers.has(group.id)));
      // 확정된 클럽이 하나도 없는데 회원 조회가 실패했다면 '가입 클럽 없음'이 아니라 조회 오류다.
      if (groupsById.size === 0 && membershipError) throw membershipError;

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
        logClientError("useMyGroups.partial", reason, { userId, source }, services);
      });
      setIncomplete(partialFailures.length > 0 || cacheError !== null);
      setError(cacheError);
      setGroups(previous => cacheError
        ? [...new Map([...previous.filter(group => !confirmedNonMembers.has(group.id)), ...groupsById.values()]
          .map(group => [group.id, group])).values()]
        : [...groupsById.values()]);
      setLoading(false);
    };

    void load().catch((err) => {
      if (cancelled) return;
      logClientError("useMyGroups.load", err, { userId }, services);
      setIncomplete(true);
      setError(err);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [firestore, services, userId, reloadKey]);

  // 회원 색인(user_groups)이 바뀌면 다시 읽는다 — 화면을 연 뒤 다른 경로(초대 링크·앱·상세)로 가입·탈퇴해도
  // '클럽 찾기'에 가입한 클럽이 남지 않게 한다(#1558). 첫 스냅샷은 위 조회와 같은 상태라 건너뛴다.
  useEffect(() => {
    if (!userId) return;
    let first = true;
    const unsubscribe = onSnapshot(collection(firestore, "user_groups", userId, "groups"), { includeMetadataChanges: true }, (snapshot) => {
      // Embedded LRU can emit cached rows before the server is reachable. Even when
      // the rows are identical, server confirmation must retry a cache-only load.
      if (snapshot.metadata?.fromCache === true) { first = false; return; }
      if (first) { first = false; return; }
      setReloadKey((key) => key + 1);
    }, (err) => { logClientError("useMyGroups.membershipIndex", err, { userId }, services); });
    return unsubscribe;
  }, [firestore, services, userId]);

  return { groups, loading, error, incomplete, retry: () => setReloadKey((key) => key + 1) };
}

/** 내가 보낸 클럽 가입 요청 중 승인 대기인 클럽 ID(users/{uid}/group_requests, 실시간). '승인 대기' 표시에 쓴다(#1558). */
export function usePendingGroupRequestIds(userId: string | undefined): Set<string> {
  const { firestore } = useFirebaseServices();
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setIds(new Set());
    if (!userId) return;
    const unsubscribe = onSnapshot(
      query(collection(firestore, "users", userId, "group_requests"), where("status", "==", "pending"), firestoreLimit(50)),
      (snapshot) => setIds(new Set(snapshot.docs.map((d) => String(d.data().groupId ?? d.id)))),
      (err) => { logClientError("usePendingGroupRequestIds", err, { userId }); },
    );
    return unsubscribe;
  }, [firestore, userId]);
  return ids;
}

// 공개 그룹 검색
/** Signed-in discovery shares the same sanitized HTTP directory as anonymous discovery.
 * Legacy inviteCode roots cannot be read through a public Firestore list query.
 */
export function usePublicGroups(options: { searchText?: string; discipline?: "ALL" | "bike" | "run" | "swim" | "tri"; city?: string; enabled?: boolean } = {}) {
  const { searchText = "", discipline = "ALL", city = "", enabled = true } = options;
  return usePublicClubDirectory({ searchText, discipline, city }, enabled);
}
