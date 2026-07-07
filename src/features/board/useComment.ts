import { useState } from "react";
import { useTranslation } from "react-i18next";
import { firestore } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { track } from "../../services/analytics";

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
      const { addDoc, collection, doc, updateDoc, increment } = await import("firebase/firestore");
      
      const commentData = {
        userId: user.uid,
        nickname: profile?.nickname || user.displayName || "익명",
        profileImage: profile?.photoURL || user.photoURL || null,
        text: text.trim(),
        createdAt: Date.now(),
        deletedAt: null,
      };

      const docRef = await addDoc(collection(firestore, `board_posts/${postId}/comments`), commentData);

      // 게시글의 댓글 수 업데이트
      await updateDoc(doc(firestore, "board_posts", postId), {
        commentCount: increment(1)
      });

      track("board_comment_send", { post_id: postId, text_len: commentData.text.length });

      return docRef.id;
    } finally {
      setSubmitting(false);
    }
  };

  return { createComment, submitting };
}
