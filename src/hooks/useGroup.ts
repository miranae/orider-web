import { useRef, useState, useEffect } from "react";
import {
  doc, collection, query, onSnapshot, getDocs, where, orderBy, limit as firestoreLimit,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { getPublicUserProfile, type PublicUserProfile } from "../services/publicProfiles";
import type { Group, GroupMember, GroupMemberRole } from "@shared/types";

export interface GroupMemberWithProfile extends GroupMember {
  id: string;
  profile: PublicUserProfile | null;
}

// 그룹 메타데이터 실시간 구독
export function useGroup(groupId: string | undefined) {
  const [group, setGroup] = useState<Group | null>(null);
  const [inactive, setInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

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
    return onSnapshot(doc(firestore, "groups", groupId), (snap) => {
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
  }, [groupId]);

  return { group, loading, error, inactive };
}

/** Subscribe only to the signed-in user's membership document for role gates. */
export function useGroupMemberRole(groupId: string | undefined, userId: string | undefined) {
  const [role, setRole] = useState<GroupMemberRole | null>(null);
  const [loading, setLoading] = useState(!!groupId && !!userId);

  useEffect(() => {
    if (!groupId || !userId) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(doc(firestore, "groups", groupId, "members", userId), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const value = data?.role;
      const isActive = data && ["active", "approved"].includes(String(data.status ?? ""));
      setRole(isActive && (value === "leader" || value === "co-leader" || value === "member") ? value : null);
      setLoading(false);
    }, (err) => {
      logClientError("useGroupMemberRole.snapshot", err, { groupId, userId });
      setRole(null);
      setLoading(false);
    });
  }, [groupId, userId]);

  return { role, loading };
}

// 그룹 멤버 목록 + 프로필 조회
export function useGroupMembers(groupId: string | undefined, maxCount?: number) {
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const snapshotEpochRef = useRef(0);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    let cancelled = false;

    const q = maxCount
      ? query(collection(firestore, "groups", groupId, "members"), firestoreLimit(maxCount))
      : query(collection(firestore, "groups", groupId, "members"));

    const unsub = onSnapshot(q, async (snap) => {
      const snapshotEpoch = ++snapshotEpochRef.current;
      const memberDocs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        profile: null as PublicUserProfile | null,
      })) as GroupMemberWithProfile[];

      // 프로필 병렬 조회
      const profilePromises = memberDocs.map(async (m) => {
        m.profile = await getPublicUserProfile(m.id);
        return m;
      });

      const resolved = await Promise.all(profilePromises);
      if (!cancelled && snapshotEpoch === snapshotEpochRef.current) {
        setMembers(resolved);
        setLoading(false);
      }
    }, () => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; unsub(); };
  }, [groupId, maxCount]);

  return { members, loading };
}

// 내 그룹 목록: user_groups/{userId}/groups 서브컬렉션으로 빠르게 조회
export function useMyGroups(userId: string | undefined) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      setGroups([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // user_groups/{userId}/groups에서 내 그룹 ID 목록 조회
    getDocs(collection(firestore, "user_groups", userId, "groups")).then(async (snap) => {
      const groupIds = snap.docs.map((d) => d.id);

      if (groupIds.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      // 그룹 문서들 조회 (10개씩 in 쿼리)
      const groupDocs: Group[] = [];
      for (let i = 0; i < groupIds.length; i += 10) {
        const chunk = groupIds.slice(i, i + 10);
        const gq = query(
          collection(firestore, "groups"),
          where("__name__", "in", chunk),
        );
        const gSnap = await getDocs(gq);
        gSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.isActive !== false) {
            groupDocs.push({ id: d.id, ...data } as Group);
          }
        });
      }
      setGroups(groupDocs);
      setLoading(false);
    }).catch((err) => {
      logClientError("useMyGroups.load", err, { userId });
      setError(err);
      setGroups([]);
      setLoading(false);
    });
  }, [userId, reloadKey]);

  return { groups, loading, error, retry: () => setReloadKey((key) => key + 1) };
}

// 공개 그룹 검색
export function usePublicGroups(options: { searchText?: string; discipline?: "ALL" | "bike" | "run" | "swim" | "tri"; city?: string; maxCount?: number } = {}) {
  const { searchText = "", discipline = "ALL", city = "", maxCount = 30 } = options;
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
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
      setGroups(snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Group));
      setLoading(false);
    }).catch((err) => {
      logClientError("usePublicGroups.load", err, {});
      setError(err);
      setGroups([]);
      setLoading(false);
    });
  }, [city, discipline, maxCount, reloadKey, searchText]);

  return { groups, loading, error, retry: () => setReloadKey((key) => key + 1) };
}
