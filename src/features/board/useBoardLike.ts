import { useState, useEffect, useRef } from "react";
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { track } from "../../services/analytics";

/**
 * 게시글 좋아요 기능을 위한 훅
 */
export function useBoardLike(postId: string, serverLikeCount = 0) {
  const { t } = useTranslation("board");
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(serverLikeCount);
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

    pendingRef.current = true;
    setIsLiked(nextLiked);
    setLikeCount(nextCount);

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

  return { isLiked, likeCount, toggleLike, loading };
}
