import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { track } from "../../services/analytics";
import { getPublicUserProfiles } from "../../services/publicProfiles";
import { isPermissionDeniedError } from "../../utils/firebaseErrors";
import type { LikerAvatarItem } from "../../components/social/LikersAvatarStack";

/**
 * 좋아요 누른 사람을 몇 명까지 읽어 올지. 활동 쿠도스처럼 문서에 비정규화된 목록이 없어
 * 서브컬렉션을 직접 읽으므로(read N), 아바타 스택에 필요한 만큼만 가져온다.
 */
const LIKERS_FETCH_LIMIT = 15;

/**
 * 게시글 좋아요 기능을 위한 훅
 *
 * 좋아요 문서(`board_posts/{postId}/likes/{uid}`)엔 uid 와 createdAt 만 있고 닉네임·프로필
 * 이미지가 없다(활동 쿠도스와 다른 점). 표시용 정보는 `users_public` 에서 채운다 —
 * 문서 스키마·보안 규칙을 건드리지 않아 기존 좋아요도 그대로 이름이 나온다.
 */
export function useBoardLike(postId: string, serverLikeCount = 0) {
  const { t } = useTranslation("board");
  const { user, profile } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(serverLikeCount);
  const [likers, setLikers] = useState<LikerAvatarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!pendingRef.current) {
      setLikeCount(serverLikeCount);
    }
  }, [serverLikeCount]);

  useEffect(() => {
    if (!user || !postId) {
      setLoading(false);
      return;
    }

    const likeRef = doc(firestore, `board_posts/${postId}/likes`, user.uid);
    
    // 좋아요 여부 실시간 구독
    const unsubscribe = onSnapshot(likeRef, (snap) => {
      if (!pendingRef.current) {
        setIsLiked(snap.exists());
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, postId]);

  // 누른 사람 목록 — 규칙상 로그인 사용자만 likes 서브컬렉션을 읽을 수 있어(비로그인은 카운트만).
  // 실시간 구독 대신 진입 시 1회 + 토글 후에만 재조회 — 목록은 보조 정보라 read 를 아낀다.
  const loadLikers = useCallback(async () => {
    if (!user || !postId) {
      setLikers([]);
      return;
    }
    try {
      const snap = await getDocs(query(
        collection(firestore, `board_posts/${postId}/likes`),
        orderBy("createdAt", "desc"),
        limit(LIKERS_FETCH_LIMIT),
      ));
      const userIds = snap.docs.map((d) => d.id);
      if (userIds.length === 0) {
        setLikers([]);
        return;
      }
      const profiles = await getPublicUserProfiles(userIds);
      // 프로필이 없거나(탈퇴·비공개) 조회에 실패한 사람은 이름을 모르므로 아바타에서 뺀다 —
      // 전체 인원 수는 likeCount 로 표시되고, 스택은 "이름 아는 사람" 만 보여 준다.
      setLikers(userIds.flatMap((userId) => {
        const profile = profiles.get(userId);
        return profile
          ? [{ userId, nickname: profile.nickname, profileImage: profile.photoURL }]
          : [];
      }));
    } catch (err) {
      if (isPermissionDeniedError(err)) return;
      logClientError("useBoardLike.loadLikers", err, { postId });
    }
  }, [user, postId]);

  useEffect(() => {
    void loadLikers();
  }, [loadLikers]);

  const toggleLike = async () => {
    if (!user) throw new Error(t("error.loginRequired"));

    const likeRef = doc(firestore, `board_posts/${postId}/likes`, user.uid);
    const action = isLiked ? "off" : "on";
    const previousLiked = isLiked;
    const previousCount = likeCount;
    const nextLiked = !previousLiked;
    const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));

    // tap 의도는 write 성공/실패와 무관하게 발사 (catch 에서 fail 별도 기록)
    track("board_like_tap", { action, post_id: postId });

    const previousLikers = likers;
    pendingRef.current = true;
    setIsLiked(nextLiked);
    setLikeCount(nextCount);
    // 아바타도 같이 낙관적 반영 — 카운트만 움직이고 얼굴이 그대로면 어긋나 보인다.
    setLikers((list) => {
      const withoutMe = list.filter((l) => l.userId !== user.uid);
      if (!nextLiked) return withoutMe;
      return [{
        userId: user.uid,
        nickname: profile?.nickname ?? user.displayName ?? "User",
        profileImage: profile?.photoURL ?? user.photoURL ?? null,
      }, ...withoutMe];
    });

    try {
      if (previousLiked) {
        // 좋아요 취소
        await deleteDoc(likeRef);
      } else {
        // 좋아요 추가
        await setDoc(likeRef, {
          userId: user.uid,
          createdAt: Date.now()
        });
      }
    } catch (err) {
      setIsLiked(previousLiked);
      setLikeCount(previousCount);
      setLikers(previousLikers);
      track("board_like_tap_fail", {
        action,
        post_id: postId,
        err: err instanceof Error ? err.message : String(err),
      });
      logClientError("useBoardLike.toggleLike", err, { postId, action });
      throw err;
    } finally {
      pendingRef.current = false;
    }
  };

  return { isLiked, likeCount, likers, toggleLike, loading };
}
