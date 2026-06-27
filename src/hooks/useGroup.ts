import { useState, useEffect } from "react";
import {
  doc, collection, query, onSnapshot, getDocs, getDoc, where, limit as firestoreLimit,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import type { Group, GroupMember, UserProfile } from "@shared/types";

export interface GroupMemberWithProfile extends GroupMember {
  id: string;
  profile: UserProfile | null;
}

// 그룹 메타데이터 실시간 구독
export function useGroup(groupId: string | undefined) {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    return onSnapshot(doc(firestore, "groups", groupId), (snap) => {
      if (snap.exists()) {
        setGroup({ id: snap.id, ...snap.data() } as Group);
      } else {
        setGroup(null);
      }
      setLoading(false);
    }, () => setLoading(false));
  }, [groupId]);

  return { group, loading };
}

// 그룹 멤버 목록 + 프로필 조회
export function useGroupMembers(groupId: string | undefined, maxCount?: number) {
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    let cancelled = false;

    const q = maxCount
      ? query(collection(firestore, "groups", groupId, "members"), firestoreLimit(maxCount))
      : query(collection(firestore, "groups", groupId, "members"));

    const unsub = onSnapshot(q, async (snap) => {
      const memberDocs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        profile: null as UserProfile | null,
      })) as GroupMemberWithProfile[];

      // 프로필 병렬 조회
      const profilePromises = memberDocs.map(async (m) => {
        const profileSnap = await getDoc(doc(firestore, "users", m.id));
        m.profile = profileSnap.exists() ? (profileSnap.data() as UserProfile) : null;
        return m;
      });

      const resolved = await Promise.all(profilePromises);
      if (!cancelled) {
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

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

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
      console.error("[useMyGroups] failed:", err);
      setLoading(false);
    });
  }, [userId]);

  return { groups, loading };
}

// 공개 그룹 검색
export function usePublicGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(firestore, "groups"),
      where("visibility", "==", "public"),
      where("isActive", "==", true),
    );
    getDocs(q).then((snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Group));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return { groups, loading };
}
