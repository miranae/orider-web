import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import type { BoardPost } from "@shared/types";
import { functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

const MAX_ATTEMPTS_PER_VIEW = 2;

export function useBoardPostView(
  postId: string | undefined,
  locationKey: string,
  post: Pick<BoardPost, "id" | "deletedAt"> | null,
): void {
  const visitRef = useRef<{
    postId: string;
    locationKey: string;
    viewId: string;
    attempts: number;
    inFlight: boolean;
    completed: boolean;
  } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const loadedPostId = post?.id;
  const deletedAt = post?.deletedAt;

  useEffect(() => {
    if (!postId) {
      visitRef.current = null;
      return;
    }
    // 방문이 바뀔 때만 새 키를 발급한다. StrictMode 재실행과 재시도는 같은 키를 쓴다.
    if (visitRef.current?.postId !== postId || visitRef.current.locationKey !== locationKey) {
      visitRef.current = {
        postId, locationKey, viewId: crypto.randomUUID(),
        attempts: 0, inFlight: false, completed: false,
      };
    }
    const visit = visitRef.current;
    if (loadedPostId !== postId || deletedAt != null
      || visit.completed || visit.inFlight || visit.attempts >= MAX_ATTEMPTS_PER_VIEW) return;

    visit.inFlight = true;
    visit.attempts += 1;

    const onError = (error: unknown) => {
      visit.inFlight = false;
      logClientError("PostDetailPage.viewCount", error, { postId });
      if (visitRef.current === visit) setRetryVersion((version) => version + 1);
    };
    try {
      const recordView = httpsCallable(functions, "recordBoardPostView");
      Promise.resolve(recordView({ postId, viewId: visit.viewId })).then(
        () => {
          visit.inFlight = false;
          visit.completed = true;
        },
        onError,
      );
    } catch (error) {
      onError(error);
    }
  }, [postId, locationKey, loadedPostId, deletedAt, retryVersion]);
}
