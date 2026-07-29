import { useState } from "react";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { track } from "../../services/analytics";
import { logClientError } from "../../services/errorLogger";

export async function softDeleteBoardComment(postId: string, commentId: string): Promise<void> {
  const { doc, updateDoc } = await import("firebase/firestore");
  // commentCount 감소는 백엔드 onBoardCommentUpdate 트리거가 deletedAt 변경을 보고 처리한다.
  await updateDoc(doc(firestore, `board_posts/${postId}/comments`, commentId), {
    deletedAt: Date.now(),
  });
}

/**
 * 댓글 작성을 위한 훅
 */
export function useCreateComment(postId: string) {
  const { t } = useTranslation("board");
  const { user, profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const createComment = async (text: string) => {
    if (!user) throw new Error(t("error.loginRequired"));
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      
      const commentData = {
        userId: user.uid,
        nickname: profile?.nickname || user.displayName || "익명",
        profileImage: profile?.photoURL || user.photoURL || null,
        text: text.trim(),
        createdAt: Date.now(),
        deletedAt: null,
      };

      // commentCount 증가와 글 작성자 알림은 백엔드 onBoardCommentCreate 트리거 소유다.
      const docRef = await addDoc(collection(firestore, `board_posts/${postId}/comments`), commentData);

      try {
        track("board_comment_send", { post_id: postId, text_len: commentData.text.length });
      } catch (error) {
        // Analytics is best-effort; record the failure without changing the persisted submission result.
        logClientError("useCreateComment.analytics", error, { postId });
      }

      return docRef.id;
    } finally {
      setSubmitting(false);
    }
  };

  return { createComment, submitting };
}
