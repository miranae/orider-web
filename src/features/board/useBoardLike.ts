import { useState, useEffect } from "react";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  increment,
  onSnapshot,
  collection,
  addDoc,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { track } from "../../services/analytics";

/**
 * 게시글 좋아요 기능을 위한 훅
 */
export function useBoardLike(postId: string) {
  const { t } = useTranslation("board");
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !postId) {
      setLoading(false);
      return;
    }

    const likeRef = doc(firestore, `board_posts/${postId}/likes`, user.uid);
    
    // 좋아요 여부 실시간 구독
    const unsubscribe = onSnapshot(likeRef, (snap) => {
      setIsLiked(snap.exists());
      setLoading(false);
    });

    return unsubscribe;
  }, [user, postId]);

  const toggleLike = async () => {
    if (!user) throw new Error(t("error.loginRequired"));

    const likeRef = doc(firestore, `board_posts/${postId}/likes`, user.uid);
    const postRef = doc(firestore, "board_posts", postId);
    const action = isLiked ? "off" : "on";

    // tap 의도는 write 성공/실패와 무관하게 발사 (catch 에서 fail 별도 기록)
    track("board_like_tap", { action, post_id: postId });

    try {
      if (isLiked) {
        // 좋아요 취소
        await deleteDoc(likeRef);
        await updateDoc(postRef, {
          likeCount: increment(-1)
        });
      } else {
        // 좋아요 추가
        await setDoc(likeRef, {
          userId: user.uid,
          createdAt: Date.now()
        });

        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
          const postData = postSnap.data();
          if (postData.userId !== user.uid) {
            await addDoc(collection(firestore, "notifications", postData.userId, "items"), {
              type: "kudos",
              fromUserId: user.uid,
              fromNickname: user.displayName || "익명",
              fromProfileImage: user.photoURL || null,
              activityId: null,
              postId: postId,
              message: `[커뮤니티] ${user.displayName || "익명"}님이 내 게시글을 좋아합니다.`,
              read: false,
              createdAt: Date.now(), // setDoc과 통일
            });
          }
        }

        await updateDoc(postRef, {
          likeCount: increment(1)
        });
      }
    } catch (err) {
      track("board_like_tap_fail", {
        action,
        post_id: postId,
        err: err instanceof Error ? err.message : String(err),
      });
      logClientError("useBoardLike.toggleLike", err, { postId, action });
      throw err;
    }
  };

  return { isLiked, toggleLike, loading };
}
