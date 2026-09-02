import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import type { BoardPost } from "@shared/types";
import { functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

const MAX_ATTEMPTS_PER_VIEW = 2;

export function useBoardPostView(
  postId: string | undefined,
  uid: string | undefined,
  post: Pick<BoardPost, "id" | "deletedAt"> | null,
): void {
  const completedKeys = useRef(new Set<string>());
  const inFlightKeys = useRef(new Set<string>());
  const attemptsByKey = useRef(new Map<string, number>());
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!postId || !uid || !post || post.id !== postId || post.deletedAt != null) return;

    const viewKey = `${uid}:${postId}`;
    const attempts = attemptsByKey.current.get(viewKey) ?? 0;
    if (
      completedKeys.current.has(viewKey)
      || inFlightKeys.current.has(viewKey)
      || attempts >= MAX_ATTEMPTS_PER_VIEW
    ) return;

    inFlightKeys.current.add(viewKey);
    attemptsByKey.current.set(viewKey, attempts + 1);

    try {
      const recordView = httpsCallable(functions, "recordBoardPostView");
      Promise.resolve(recordView({ postId })).then(
        () => {
          inFlightKeys.current.delete(viewKey);
          completedKeys.current.add(viewKey);
        },
        (error) => {
          inFlightKeys.current.delete(viewKey);
          logClientError("PostDetailPage.viewCount", error, { postId });
          setRetryVersion((version) => version + 1);
        },
      );
    } catch (error) {
      inFlightKeys.current.delete(viewKey);
      logClientError("PostDetailPage.viewCount", error, { postId });
      setRetryVersion((version) => version + 1);
    }
  }, [postId, uid, post, retryVersion]);
}
