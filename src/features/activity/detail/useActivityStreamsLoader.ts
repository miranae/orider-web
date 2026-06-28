import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";

import type { Activity, ActivityStreams } from "@shared/types";
import { firestore } from "../../../services/firebase";
import { logClientError } from "../../../services/errorLogger";
import { isStreamNotCachedError } from "./activityDetailUtils";

interface UseActivityStreamsLoaderArgs {
  activityId: string | undefined;
  activity: Activity | null;
  userId: string | undefined;
  getStreams: (stravaId: number) => Promise<unknown>;
  t: (key: string) => string;
}

export function useActivityStreamsLoader({
  activityId,
  activity,
  userId,
  getStreams,
  t,
}: UseActivityStreamsLoaderArgs) {
  const [streams, setStreams] = useState<ActivityStreams | null>(null);
  const [showStreamSpinner, setShowStreamSpinner] = useState(false);
  const [streamsError, setStreamsError] = useState<string | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);

  useEffect(() => {
    setStreams(null);
    setStreamsError(null);
    setLoadingStreams(false);
    setShowStreamSpinner(false);
  }, [activityId]);

  useEffect(() => {
    if (!activity || streams) return;

    const source = (activity as Activity & { source?: string }).source;
    const stravaId = (activity as Activity & { stravaActivityId?: number }).stravaActivityId;

    if (source === "orider" && activityId) {
      setLoadingStreams(true);
      setStreamsError(null);
      const timer = setTimeout(() => setShowStreamSpinner(true), 500);
      getDoc(doc(firestore, "activity_streams", activityId)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const jsonStr = data.json as string | undefined;
          if (jsonStr) {
            const parsed = JSON.parse(jsonStr) as ActivityStreams;
            parsed.userId = data.userId;
            setStreams(parsed);
          }
        }
      }).catch((err) => {
        logClientError("ActivityPage.streams", err, {
          activityId,
          source: "orider",
          visibility: (activity as Activity & { visibility?: string }).visibility ?? null,
          isOwn: !!userId && activity.userId === userId,
        });
        setStreamsError(err instanceof Error ? err.message : t("page.streamsErrorFallback"));
      }).finally(() => {
        clearTimeout(timer);
        setShowStreamSpinner(false);
        setLoadingStreams(false);
      });
      return;
    }

    if (!stravaId) return;

    setLoadingStreams(true);
    setStreamsError(null);
    const timer = setTimeout(() => setShowStreamSpinner(true), 500);
    getStreams(stravaId).then((data) => {
      setStreams(data as unknown as ActivityStreams);
    }).catch((err) => {
      if (isStreamNotCachedError(err)) {
        setStreamsError(t("page.streamsNotCached"));
      } else {
        logClientError("ActivityPage.streams", err, {
          activityId,
          source: "strava",
          stravaId,
          visibility: (activity as Activity & { visibility?: string }).visibility ?? null,
          isOwn: !!userId && activity.userId === userId,
        });
        setStreamsError(err instanceof Error ? err.message : t("page.streamsErrorFallback"));
      }
    }).finally(() => {
      clearTimeout(timer);
      setShowStreamSpinner(false);
      setLoadingStreams(false);
    });
  }, [activity, activityId, getStreams, streams, t, userId]);

  return {
    streams,
    setStreams,
    showStreamSpinner,
    setShowStreamSpinner,
    streamsError,
    setStreamsError,
    loadingStreams,
    setLoadingStreams,
  };
}
