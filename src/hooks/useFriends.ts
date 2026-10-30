import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection, doc, getDoc, onSnapshot, deleteDoc, setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
import type { FriendRelation, FriendRequest } from "@shared/types";

export async function cancelFriendRequest(uid: string, targetId: string): Promise<void> {
  try { await deleteDoc(doc(firestore, "friend_requests", targetId, "items", uid)); }
  catch (error) { logClientError("useFriends.cancelRequest", error, { targetId }); throw error; }
}

export interface FriendRequester {
  uid: string;
  nickname: string;
  profileImage: string | null;
}

/** friend_requests/{target}/items/{me} 쓰기 — 프로필 페이지·사람 검색이 같은 경로를 쓴다. 로깅은 호출부 책임. */
export async function sendFriendRequest(requester: FriendRequester, targetId: string): Promise<void> {
  await setDoc(doc(firestore, "friend_requests", targetId, "items", requester.uid), {
    requesterId: requester.uid,
    nickname: requester.nickname,
    profileImage: requester.profileImage,
    createdAt: Date.now(),
  });
}

function toMillis(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date || typeof value === "string") {
    const millis = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(millis) ? millis : 0;
  }
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; _seconds?: number; seconds?: number; _nanoseconds?: number; nanoseconds?: number };
    if (typeof timestamp.toMillis === "function") {
      const millis = timestamp.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    }
    const seconds = timestamp._seconds ?? timestamp.seconds;
    const nanoseconds = timestamp._nanoseconds ?? timestamp.nanoseconds ?? 0;
    if (typeof seconds === "number" && Number.isFinite(seconds) && Number.isFinite(nanoseconds)) return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }
  return 0;
}

export function useFriends() {
  const { user, profile } = useAuth();
  const [friends, setFriends] = useState<FriendRelation[]>([]);
  const [sentRequests, setSentRequests] = useState<{ targetId: string; nickname: string; profileImage: string | null; createdAt: number }[]>([]);
  const [readError, setReadError] = useState<unknown>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friendCodeState, setFriendCodeState] = useState<{ uid: string; code: string | null } | null>(null);
  const [friendCodeLoadingUid, setFriendCodeLoadingUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const pendingAcceptsRef = useRef<Set<string>>(new Set());

  // Real-time friends subscription
  useEffect(() => {
    if (!user) {
      setFriends([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    return onSnapshot(
      collection(firestore, "friends", user.uid, "users"),
      (snap) => {
        setFriends(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              userId: d.id,
              nickname: data.nickname || "",
              profileImage: data.profileImage || null,
              friendCode: data.friendCode || null,
              createdAt: toMillis(data.createdAt),
            };
          }),
        );
        setLoading(false);
      },
      (error) => { setReadError(error); setLoading(false); },
    );
  }, [user]);

  // Real-time friend requests subscription
  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    return onSnapshot(
      collection(firestore, "friend_requests", user.uid, "items"),
      (snap) => {
        setRequests(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              requesterId: d.id,
              nickname: data.nickname || "",
              profileImage: data.profileImage || null,
              createdAt: toMillis(data.createdAt),
            };
          }),
        );
      },
      (error) => { setReadError(error); },
    );
  }, [user]);

  useEffect(() => {
    setSentRequests([]); setReadError(null);
    if (!user) return;
    return onSnapshot(collection(firestore, "users", user.uid, "sent_friend_requests"), snapshot => {
      setSentRequests(snapshot.docs.map(doc => {
        const data = doc.data();
        return { targetId: doc.id, nickname: data.targetNickname ?? "", profileImage: data.targetPhotoURL ?? null, createdAt: toMillis(data.createdAt) };
      }));
    }, error => { setSentRequests([]); setReadError(error); logClientError("useFriends.sentRequests", error); });
  }, [user?.uid]);

  const cancelRequest = useCallback(async (targetId: string) => {
    if (!user) return;
    await cancelFriendRequest(user.uid, targetId);
  }, [user?.uid]);

  // Fetch friend code from Firestore
  useEffect(() => {
    if (!user) { setFriendCodeState(null); setFriendCodeLoadingUid(null); return; }
    let cancelled = false;
    const uid = user.uid;
    setFriendCodeLoadingUid(uid);
    getDoc(doc(firestore, "users", user.uid)).then((snap) => {
      if (!cancelled && snap.exists()) {
        const code = snap.data()?.friendCode;
        setFriendCodeState({ uid, code: typeof code === "string" && code ? code : null });
      } else if (!cancelled) {
        setFriendCodeState({ uid, code: null });
      }
    }).catch((error) => {
      logClientError("useFriends.friendCode", error, { uid });
      if (!cancelled) setFriendCodeState({ uid, code: null });
    })
      .finally(() => { if (!cancelled) setFriendCodeLoadingUid((current) => current === uid ? null : current); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  const currentUid = user?.uid ?? null;
  const friendCode = currentUid && friendCodeState?.uid === currentUid ? friendCodeState.code : null;
  const friendCodeLoading = currentUid !== null && (friendCodeState?.uid !== currentUid || friendCodeLoadingUid === currentUid);

  // via 출처: "invite_link" = /friend/:code 딥링크, "manual" = 친구 페이지 수동 입력.
  // 기본값 "manual" — 호출 사이트에서 override 가능. funnel 분석 시 어떤 경로가 효과적인지 비교.
  const addByCode = useCallback(async (code: string, via: "invite_link" | "manual" = "manual") => {
    if (!user || actionLoading) return null;
    setActionLoading(true);
    try {
      const fn = httpsCallable<{ friendCode: string }, { success?: boolean; alreadyFriends?: boolean; friendId: string; friendNickname?: string }>(
        functions, "addFriendByCode",
      );
      const result = await fn({ friendCode: code });
      track("friend_add_by_code", {
        via,
        already_friends: result.data.alreadyFriends ? "true" : "false",
      });
      return result.data;
    } finally {
      setActionLoading(false);
    }
  }, [user, actionLoading]);

  const acceptRequest = useCallback(async (requesterId: string) => {
    if (!user || pendingAcceptsRef.current.has(requesterId)) return;
    pendingAcceptsRef.current.add(requesterId);
    try {
      const fn = httpsCallable(functions, "acceptFriendRequest");
      await fn({ requesterId });
      track("friend_request_accept");
    } finally {
      pendingAcceptsRef.current.delete(requesterId);
    }
  }, [user]);

  const declineRequest = useCallback(async (requesterId: string) => {
    if (!user) return;
    await deleteDoc(doc(firestore, "friend_requests", user.uid, "items", requesterId));
    track("friend_request_decline");
  }, [user]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    const fn = httpsCallable<{ friendId: string }, { success?: boolean; friendId?: string }>(
      functions,
      "removeFriend",
    );
    await fn({ friendId });
    track("friend_remove");
  }, [user]);

  const sendRequest = useCallback(async (targetUserId: string) => {
    if (!user || actionLoading) return;
    setActionLoading(true);
    try {
      await sendFriendRequest({
        uid: user.uid,
        nickname: profile?.nickname || user.displayName || "",
        profileImage: profile?.photoURL || user.photoURL || null,
      }, targetUserId);
      track("friend_request_send");
    } finally {
      setActionLoading(false);
    }
  }, [user, profile, actionLoading]);

  return {
    friends,
    requests,
    sentRequests,
    readError,
    cancelRequest,
    friendCode,
    friendCodeLoading,
    loading,
    actionLoading,
    addByCode,
    acceptRequest,
    declineRequest,
    removeFriend,
    sendRequest,
  };
}
