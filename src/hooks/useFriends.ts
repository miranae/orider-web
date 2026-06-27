import { useState, useEffect, useCallback } from "react";
import {
  collection, doc, getDoc, onSnapshot, deleteDoc, setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../services/analytics";
import type { FriendRelation, FriendRequest } from "@shared/types";

export function useFriends() {
  const { user, profile } = useAuth();
  const [friends, setFriends] = useState<FriendRelation[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

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
              createdAt: typeof data.createdAt === "number"
                ? data.createdAt
                : data.createdAt?.toMillis?.() ?? Date.now(),
            };
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
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
              createdAt: typeof data.createdAt === "number"
                ? data.createdAt
                : data.createdAt?.toMillis?.() ?? Date.now(),
            };
          }),
        );
      },
      () => {},
    );
  }, [user]);

  // Fetch friend code from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(firestore, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const code = snap.data()?.friendCode;
        if (code) setFriendCode(code);
      }
    });
  }, [user]);

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
    if (!user || actionLoading) return;
    setActionLoading(true);
    try {
      const fn = httpsCallable(functions, "acceptFriendRequest");
      await fn({ requesterId });
      track("friend_request_accept");
    } finally {
      setActionLoading(false);
    }
  }, [user, actionLoading]);

  const declineRequest = useCallback(async (requesterId: string) => {
    if (!user) return;
    await deleteDoc(doc(firestore, "friend_requests", user.uid, "items", requesterId));
    track("friend_request_decline");
  }, [user]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!user) return;
    await deleteDoc(doc(firestore, "friends", user.uid, "users", friendId));
    track("friend_remove");
  }, [user]);

  const sendRequest = useCallback(async (targetUserId: string) => {
    if (!user || actionLoading) return;
    setActionLoading(true);
    try {
      await setDoc(doc(firestore, "friend_requests", targetUserId, "items", user.uid), {
        requesterId: user.uid,
        nickname: profile?.nickname || user.displayName || "",
        profileImage: profile?.photoURL || user.photoURL || null,
        createdAt: Date.now(),
      });
      track("friend_request_send");
    } finally {
      setActionLoading(false);
    }
  }, [user, profile, actionLoading]);

  return {
    friends,
    requests,
    friendCode,
    loading,
    actionLoading,
    addByCode,
    acceptRequest,
    declineRequest,
    removeFriend,
    sendRequest,
  };
}

