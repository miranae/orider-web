import { resolveProfilePhotoUrl } from "@shared/profileAvatar";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useFriends, sendFriendRequest } from "../../hooks/useFriends";
import { track } from "../../services/analytics";
import { logClientError } from "../../services/errorLogger";

export type FriendState = "friend" | "sent" | "received" | "none";
export type PendingAction = "send" | "accept" | "cancel";

/** 친구 요청 대상 — 사람 검색 결과와 친구 추천 카드가 같이 쓴다. */
export interface FriendRequestTarget {
  id: string;
  nickname: string;
}

export interface FriendRequestActions {
  friendState: (id: string) => FriendState;
  pending: ReadonlyMap<string, PendingAction>;
  /** `analytics` 는 friend_request_send 이벤트에 그대로 붙는다(via 등). */
  send: (target: FriendRequestTarget, analytics: Record<string, unknown>) => Promise<void>;
  accept: (target: FriendRequestTarget) => Promise<void>;
  cancel: (target: FriendRequestTarget) => Promise<void>;
}

/**
 * 친구 요청 보내기·수락·취소와 낙관적 상태. 탐색 > 사람(ExploreAthletesPage)에서 뽑아
 * 커뮤니티 화면의 라이더 검색·친구 추천 줄이 같은 상태를 공유한다.
 */
export function useFriendRequestActions(): FriendRequestActions {
  const { user, profile } = useAuth();
  const { firestore } = useFirebaseServices();
  const { t } = useTranslation("friends");
  const { showToast } = useToast();
  const dialog = useDialog();
  const { friends, requests, sentRequests = [], acceptRequest, cancelRequest } = useFriends();
  const [pending, setPending] = useState<ReadonlyMap<string, PendingAction>>(() => new Map());
  // 낙관적 상태는 걸 당시의 구독 상태(base)와 함께 둔다 — 구독이 바뀌면(확인·상대 행동) 구독 쪽을 따른다
  const [localStatus, setLocalStatus] = useState<ReadonlyMap<string, { state: FriendState; base: FriendState }>>(() => new Map());

  const friendIds = useMemo(() => new Set(friends.map(friend => friend.userId)), [friends]);
  const receivedIds = useMemo(() => new Set(requests.map(request => request.requesterId)), [requests]);
  const sentIds = useMemo(() => new Set(sentRequests.map(request => request.targetId)), [sentRequests]);
  const subscribedState = (id: string): FriendState => {
    if (friendIds.has(id)) return "friend";
    if (receivedIds.has(id)) return "received";
    return sentIds.has(id) ? "sent" : "none";
  };
  const friendState = (id: string): FriendState => {
    const subscribed = subscribedState(id);
    const local = localStatus.get(id);
    return local && local.base === subscribed ? local.state : subscribed;
  };
  // 구독이 기준값에서 한 번이라도 벗어나면(반영·다른 변경) 낙관적 값은 버린다 — 남겨 두면
  // 보냄 → 상대 거절로 구독이 기준값(none)에 돌아왔을 때 옛 "요청됨"이 되살아난다.
  useEffect(() => {
    setLocalStatus(previous => {
      let next: Map<string, { state: FriendState; base: FriendState }> | null = null;
      for (const [id, local] of previous) {
        const subscribed = friendIds.has(id) ? "friend" : receivedIds.has(id) ? "received" : sentIds.has(id) ? "sent" : "none";
        if (subscribed === local.base) continue;
        next ??= new Map(previous);
        next.delete(id);
      }
      return next ?? previous;
    });
  }, [friendIds, receivedIds, sentIds]);

  const withPending = async (id: string, action: PendingAction, work: () => Promise<void>) => {
    if (pending.has(id)) return;
    setPending(previous => new Map(previous).set(id, action));
    try { await work(); }
    finally { setPending(previous => { const next = new Map(previous); next.delete(id); return next; }); }
  };
  const setLocal = (id: string, state: FriendState | null) => setLocalStatus(previous => {
    const next = new Map(previous);
    if (state) next.set(id, { state, base: subscribedState(id) }); else next.delete(id);
    return next;
  });

  const send = (target: FriendRequestTarget, analytics: Record<string, unknown>) => withPending(target.id, "send", async () => {
    if (!user) return;
    setLocal(target.id, "sent");
    try {
      await sendFriendRequest({
        uid: user.uid,
        nickname: profile?.nickname || user.displayName || "",
        profileImage: resolveProfilePhotoUrl(profile?.photoURL, user.photoURL),
      }, target.id, firestore);
      track("friend_request_send", analytics);
      showToast(t("search.toast.sent", { nickname: target.nickname || t("defaultNickname") }));
    } catch (error) {
      setLocal(target.id, null);
      logClientError("friendRequestActions.send", error, { targetUserId: target.id });
      showToast(t("search.toast.sendFailed"), "error");
    }
  });
  const accept = (target: FriendRequestTarget) => withPending(target.id, "accept", async () => {
    try {
      await acceptRequest(target.id);
      setLocal(target.id, "friend");
      showToast(t("toast.acceptSuccess"));
    } catch (error) {
      logClientError("friendRequestActions.accept", error, { requesterId: target.id });
      showToast(t("toast.acceptFailed"), "error");
    }
  });
  const cancel = (target: FriendRequestTarget) => withPending(target.id, "cancel", async () => {
    if (!await dialog.confirm(t("cancelConfirm"))) return;
    try {
      await cancelRequest(target.id);
      setLocal(target.id, "none");
      showToast(t("cancelSuccess"));
    } catch {
      // cancelFriendRequest 가 실패를 기록한다.
      showToast(t("cancelFailed"), "error");
    }
  });

  return { friendState, pending, send, accept, cancel };
}
